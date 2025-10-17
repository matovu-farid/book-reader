import { useCallback, useEffect, useRef } from 'react'
import type { Rendition } from '@epubjs'
import type { ParagraphWithCFI } from '../../../shared/types'
import { useTTSStore } from '../stores/ttsStore'
import { useTTSApiKeyStatus, useTTSQueueStatus, useRequestTTSAudio } from './useTTSQueries'

export interface TTSControls {
  play: () => void
  pause: () => void
  resume: () => void
  stop: () => void
  next: () => void
  prev: () => void
  setParagraphs: (paragraphs: ParagraphWithCFI[]) => void
  state: {
    isPlaying: boolean
    isPaused: boolean
    currentParagraphIndex: number
    paragraphs: ParagraphWithCFI[]
    isLoading: boolean
    hasApiKey: boolean
    error: string | null
  }
}

interface UseTTSProps {
  bookId: string
  rendition: Rendition | null
  onNavigateToPreviousPage: () => void
  onNavigateToNextPage: () => void
}

export function useTTS({
  bookId,
  rendition,
  onNavigateToPreviousPage,
  onNavigateToNextPage
}: UseTTSProps): TTSControls {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const currentHighlightRef = useRef<string | null>(null)

  // Zustand store
  const {
    isPlaying,
    isPaused,
    isLoading,
    hasApiKey,
    currentParagraphIndex,
    paragraphs,
    audioCache,
    error,
    setPlaying,
    setPaused,
    setLoading,
    setHasApiKey,
    setCurrentParagraphIndex,
    setParagraphs,
    setCurrentBookId,
    setCurrentPage,
    addToAudioCache,
    setError
  } = useTTSStore()

  // React Query hooks
  const { data: apiKeyStatus } = useTTSApiKeyStatus()
  useTTSQueueStatus()
  const requestAudioMutation = useRequestTTSAudio()

  // Update API key status in store
  useEffect(() => {
    if (apiKeyStatus !== undefined) {
      setHasApiKey(apiKeyStatus)
    }
  }, [apiKeyStatus, setHasApiKey])

  // Set current book ID when it changes
  useEffect(() => {
    if (bookId) {
      setCurrentBookId(bookId)
    }
  }, [bookId, setCurrentBookId])

  // Create ref for advanceToNextParagraph to avoid stale closure
  const advanceToNextParagraphRef = useRef<() => void>()

  // Audio element management with proper cleanup
  useEffect(() => {
    // Initialize audio element once
    if (!audioRef.current) {
      audioRef.current = new Audio()
    }

    const audio = audioRef.current

    // Event handlers as stable functions
    const handleEnded = () => {
      setPlaying(false)
      setPaused(false)

      // Safely remove current highlight
      if (currentHighlightRef.current && rendition) {
        try {
          rendition.removeHighlight(currentHighlightRef.current)
          currentHighlightRef.current = null
        } catch (error) {
          console.warn('Failed to remove highlight:', error)
        }
      }

      advanceToNextParagraphRef.current?.() // Use ref to avoid stale closure
    }

    const handleError = (e: Event) => {
      console.error('Audio error:', e)
      setError('Audio playback failed')
      setPlaying(false)
      setLoading(false)
    }

    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('error', handleError)

    return () => {
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', handleError)
      audio.pause()
      audio.src = ''
    }
  }, [setPlaying, setPaused, setError, setLoading]) // Include dependencies

  // Track page changes to handle audio continuation
  useEffect(() => {
    const currentLocation = rendition?.location?.start?.cfi

    if (currentLocation && currentLocation !== useTTSStore.getState().currentPage) {
      // Page changed
      if (isPlaying && !isPaused) {
        // Audio is playing - check if we need to continue
        const isMovingForward = true // For now, assume forward navigation

        if (isMovingForward) {
          // User manually navigated forward while audio playing
          // Reset to first paragraph of new page
          setCurrentParagraphIndex(0)
        } else {
          // User navigated backward - pause audio
          pause()
        }
      }

      setCurrentPage(currentLocation)
    }
  }, [
    rendition?.location?.start?.cfi,
    isPlaying,
    isPaused,
    setCurrentPage,
    setCurrentParagraphIndex
  ])

  // Set up audio ready listener
  useEffect(() => {
    const handleAudioReady = (
      _event: unknown,
      data: { bookId: string; cfiRange: string; audioPath: string }
    ) => {
      if (data.bookId === bookId) {
        addToAudioCache(data.cfiRange, data.audioPath)
        // Don't auto-play here - let the requesting function handle it
      }
    }

    window.functions.onTTSAudioReady(handleAudioReady)

    return () => {
      window.functions.removeTTSAudioReadyListener(handleAudioReady)
    }
  }, [bookId, addToAudioCache]) // Stable dependencies

  const requestAudio = useCallback(
    async (paragraph: ParagraphWithCFI, priority = 0): Promise<string | void> => {
      if (!paragraph.text.trim()) return

      // Check Zustand cache first
      const cached = audioCache.get(paragraph.cfiRange)
      if (cached) return cached

      // Check disk cache via direct API call
      try {
        const diskCached = await window.functions.getTTSAudioPath(bookId, paragraph.cfiRange)
        if (diskCached) {
          addToAudioCache(paragraph.cfiRange, diskCached)
          return diskCached
        }
      } catch (error) {
        console.warn('Cache check failed:', error)
      }

      // Request new audio via React Query mutation
      try {
        const audioPath = await requestAudioMutation.mutateAsync({
          bookId,
          cfiRange: paragraph.cfiRange,
          text: paragraph.text,
          priority
        })
        return audioPath
      } catch (error) {
        setError(
          `Failed to generate audio: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
        throw error
      }
    },
    [bookId, audioCache, addToAudioCache, requestAudioMutation, setError]
  )

  const prefetchAudio = useCallback(
    (startIndex: number, count: number) => {
      for (let i = 0; i < count; i++) {
        const index = startIndex + i
        if (index < paragraphs.length && index >= 0) {
          const paragraph = paragraphs[index]
          requestAudio(paragraph, 1).catch((error) => {
            console.warn(`Prefetch failed for paragraph ${index}:`, error)
          }) // Fix: Add error logging for prefetch failures
        }
      }
    },
    [paragraphs, requestAudio]
  )

  const advanceToNextParagraph = useCallback(async () => {
    const nextIndex = currentParagraphIndex + 1

    // Check if we're at end of current page
    if (nextIndex >= paragraphs.length) {
      // Navigate to next page
      onNavigateToNextPage()

      // Wait for new paragraphs to load (handled by page change effect)
      // Audio will auto-start with first paragraph of next page
      return
    }

    // Remove current highlight BEFORE updating index
    if (currentHighlightRef.current && rendition) {
      try {
        rendition.removeHighlight(currentHighlightRef.current)
      } catch (error) {
        console.warn('Failed to remove highlight:', error)
      }
    }

    // Move to next paragraph on same page
    setCurrentParagraphIndex(nextIndex)

    const nextParagraph = paragraphs[nextIndex]
    if (!nextParagraph) return

    // Highlight next paragraph and store reference
    if (rendition) {
      currentHighlightRef.current = nextParagraph.cfiRange
      rendition.highlightRange(nextParagraph.cfiRange)
    }

    // Request and play audio with proper handling
    try {
      const audioPath = await requestAudio(nextParagraph, 2)
      if (audioPath && audioRef.current) {
        // Pause current audio before setting new source
        audioRef.current.pause()
        audioRef.current.currentTime = 0

        // Set new source and wait for it to be ready
        audioRef.current.src = audioPath
        audioRef.current.load()

        // Wait for audio to be ready before playing
        await new Promise((resolve, reject) => {
          const handleCanPlay = () => {
            audioRef.current?.removeEventListener('canplaythrough', handleCanPlay)
            audioRef.current?.removeEventListener('error', handleError)
            resolve(undefined)
          }
          const handleError = (e: Event) => {
            audioRef.current?.removeEventListener('canplaythrough', handleCanPlay)
            audioRef.current?.removeEventListener('error', handleError)
            reject(e)
          }
          audioRef.current?.addEventListener('canplaythrough', handleCanPlay, { once: true })
          audioRef.current?.addEventListener('error', handleError, { once: true })
        })

        await audioRef.current.play()
        setLoading(false) // Fix: Set loading to false when audio starts playing
      }

      // Prefetch next paragraphs
      prefetchAudio(nextIndex + 1, 3)
    } catch (error) {
      console.error('Failed to advance:', error)
      setPlaying(false)
    }
  }, [
    currentParagraphIndex,
    paragraphs,
    rendition,
    requestAudio,
    prefetchAudio,
    onNavigateToNextPage,
    setCurrentParagraphIndex,
    setPlaying,
    setLoading
  ])

  // Update ref when function changes
  useEffect(() => {
    advanceToNextParagraphRef.current = advanceToNextParagraph
  }, [advanceToNextParagraph])

  const play = useCallback(async () => {
    if (!hasApiKey) {
      setError('OpenAI API key not configured')
      return
    }

    if (paragraphs.length === 0) {
      setError('No paragraphs available to play')
      return
    }

    const currentParagraph = paragraphs[currentParagraphIndex]
    if (!currentParagraph) return

    setPlaying(true)
    setPaused(false)
    setLoading(true)
    setError(null)

    // Highlight current paragraph and store reference
    if (rendition) {
      currentHighlightRef.current = currentParagraph.cfiRange
      rendition.highlightRange(currentParagraph.cfiRange)
    }

    try {
      // Request audio with high priority
      const audioPath = await requestAudio(currentParagraph, 2)

      if (audioPath && audioRef.current) {
        // Pause current audio before setting new source
        audioRef.current.pause()
        audioRef.current.currentTime = 0

        // Set new source and wait for it to be ready
        audioRef.current.src = audioPath
        audioRef.current.load()

        // Wait for audio to be ready before playing
        await new Promise((resolve, reject) => {
          const handleCanPlay = () => {
            audioRef.current?.removeEventListener('canplaythrough', handleCanPlay)
            audioRef.current?.removeEventListener('error', handleError)
            resolve(undefined)
          }
          const handleError = (e: Event) => {
            audioRef.current?.removeEventListener('canplaythrough', handleCanPlay)
            audioRef.current?.removeEventListener('error', handleError)
            reject(e)
          }
          audioRef.current?.addEventListener('canplaythrough', handleCanPlay, { once: true })
          audioRef.current?.addEventListener('error', handleError, { once: true })
        })

        await audioRef.current.play()
        setLoading(false)

        // Prefetch next paragraphs
        prefetchAudio(currentParagraphIndex + 1, 3)
      }
    } catch (error) {
      console.error('Playback failed:', error)
      setError(`Playback failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setPlaying(false)
      setLoading(false)
    }
  }, [
    hasApiKey,
    paragraphs,
    currentParagraphIndex,
    rendition,
    requestAudio,
    prefetchAudio,
    setPlaying,
    setPaused,
    setLoading,
    setError
  ])

  const pause = useCallback(() => {
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause()
      setPaused(true)
    }
  }, [setPaused])

  const resume = useCallback(() => {
    if (audioRef.current && audioRef.current.paused) {
      audioRef.current.play().catch((error) => {
        console.error('Failed to resume audio:', error)
        setError(`Failed to resume audio: ${error.message}`)
      })
      setPaused(false)
    }
  }, [setPaused, setError])

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }

    // Remove highlight using stored reference
    if (currentHighlightRef.current && rendition) {
      try {
        rendition.removeHighlight(currentHighlightRef.current)
        currentHighlightRef.current = null
      } catch (error) {
        console.warn('Failed to remove highlight:', error)
      }
    }

    setPlaying(false)
    setPaused(false)
    setLoading(false)
    setError(null)
  }, [rendition, paragraphs, currentParagraphIndex, setPlaying, setPaused, setLoading, setError])

  const next = useCallback(async () => {
    const nextIndex = currentParagraphIndex + 1

    // If at end of current page, go to next page
    if (nextIndex >= paragraphs.length) {
      onNavigateToNextPage()
      setCurrentParagraphIndex(0)
      return
    }

    // Remove current highlight using stored reference
    if (currentHighlightRef.current && rendition) {
      try {
        rendition.removeHighlight(currentHighlightRef.current)
        currentHighlightRef.current = null
      } catch (error) {
        console.warn('Failed to remove highlight:', error)
      }
    }

    setCurrentParagraphIndex(nextIndex)

    const nextParagraph = paragraphs[nextIndex]
    if (!nextParagraph) return

    // Always handle audio and highlighting when next is clicked
    // Pause current audio first
    if (audioRef.current) {
      audioRef.current.pause()
    }

    // Highlight next paragraph
    if (rendition) {
      currentHighlightRef.current = nextParagraph.cfiRange
      rendition.highlightRange(nextParagraph.cfiRange)
    }

    // If was playing, continue playing with next paragraph
    if (isPlaying) {
      setLoading(true)
      try {
        const audioPath = await requestAudio(nextParagraph, 2)
        if (audioPath && audioRef.current) {
          audioRef.current.pause()
          audioRef.current.currentTime = 0
          audioRef.current.src = audioPath
          audioRef.current.load()

          await new Promise((resolve, reject) => {
            const handleCanPlay = () => {
              audioRef.current?.removeEventListener('canplaythrough', handleCanPlay)
              audioRef.current?.removeEventListener('error', handleError)
              resolve(undefined)
            }
            const handleError = (e: Event) => {
              audioRef.current?.removeEventListener('canplaythrough', handleCanPlay)
              audioRef.current?.removeEventListener('error', handleError)
              reject(e)
            }
            audioRef.current?.addEventListener('canplaythrough', handleCanPlay, { once: true })
            audioRef.current?.addEventListener('error', handleError, { once: true })
          })

          await audioRef.current.play()
          setLoading(false)
          prefetchAudio(nextIndex + 1, 3)
        }
      } catch (error) {
        console.error('Failed to play next paragraph:', error)
        setError(
          `Failed to play next paragraph: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
        setLoading(false)
      }
    }
  }, [
    currentParagraphIndex,
    paragraphs,
    isPlaying,
    rendition,
    onNavigateToNextPage,
    requestAudio,
    prefetchAudio,
    setCurrentParagraphIndex,
    setLoading,
    setError
  ])

  const prev = useCallback(async () => {
    const prevIndex = currentParagraphIndex - 1

    // If at start of current page, go to previous page
    if (prevIndex < 0) {
      onNavigateToPreviousPage()
      // Will be set to last paragraph when new page loads
      return
    }

    // Remove current highlight using stored reference
    if (currentHighlightRef.current && rendition) {
      try {
        rendition.removeHighlight(currentHighlightRef.current)
        currentHighlightRef.current = null
      } catch (error) {
        console.warn('Failed to remove highlight:', error)
      }
    }

    setCurrentParagraphIndex(prevIndex)

    const prevParagraph = paragraphs[prevIndex]
    if (!prevParagraph) return

    // Always handle audio and highlighting when prev is clicked
    // Pause current audio first
    if (audioRef.current) {
      audioRef.current.pause()
    }

    // Highlight previous paragraph
    if (rendition) {
      currentHighlightRef.current = prevParagraph.cfiRange
      rendition.highlightRange(prevParagraph.cfiRange)
    }

    // If was playing, continue playing with previous paragraph
    if (isPlaying) {
      setLoading(true)
      try {
        const audioPath = await requestAudio(prevParagraph, 2)
        if (audioPath && audioRef.current) {
          audioRef.current.pause()
          audioRef.current.currentTime = 0
          audioRef.current.src = audioPath
          audioRef.current.load()

          await new Promise((resolve, reject) => {
            const handleCanPlay = () => {
              audioRef.current?.removeEventListener('canplaythrough', handleCanPlay)
              audioRef.current?.removeEventListener('error', handleError)
              resolve(undefined)
            }
            const handleError = (e: Event) => {
              audioRef.current?.removeEventListener('canplaythrough', handleCanPlay)
              audioRef.current?.removeEventListener('error', handleError)
              reject(e)
            }
            audioRef.current?.addEventListener('canplaythrough', handleCanPlay, { once: true })
            audioRef.current?.addEventListener('error', handleError, { once: true })
          })

          await audioRef.current.play()
          setLoading(false)
          // Prefetch backwards for previous paragraphs
          prefetchAudio(prevIndex - 3, 3)
        }
      } catch (error) {
        console.error('Failed to play previous paragraph:', error)
        setError(
          `Failed to play previous paragraph: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
        setLoading(false)
      }
    }
  }, [
    currentParagraphIndex,
    paragraphs,
    isPlaying,
    rendition,
    onNavigateToPreviousPage,
    requestAudio,
    prefetchAudio,
    setCurrentParagraphIndex,
    setLoading,
    setError
  ])

  const setParagraphsCallback = useCallback(
    (newParagraphs: ParagraphWithCFI[]) => {
      const wasPlaying = isPlaying && !isPaused // Store playing state

      // Stop current audio
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
      }

      // Remove current highlight
      if (currentHighlightRef.current && rendition) {
        try {
          rendition.removeHighlight(currentHighlightRef.current)
          currentHighlightRef.current = null
        } catch (error) {
          console.warn('Failed to remove highlight:', error)
        }
      }

      // Set new paragraphs
      setParagraphs(newParagraphs)
      setCurrentParagraphIndex(0)

      // If was playing, auto-start with first paragraph of new page
      if (wasPlaying && newParagraphs.length > 0) {
        const firstParagraph = newParagraphs[0]

        // Highlight first paragraph
        if (rendition) {
          currentHighlightRef.current = firstParagraph.cfiRange
          rendition.highlightRange(firstParagraph.cfiRange)
        }

        // Start playing asynchronously
        setLoading(true)
        requestAudio(firstParagraph, 2)
          .then((audioPath) => {
            if (audioPath && audioRef.current) {
              audioRef.current.pause()
              audioRef.current.currentTime = 0
              audioRef.current.src = audioPath
              audioRef.current.load()

              return new Promise((resolve, reject) => {
                const handleCanPlay = () => {
                  audioRef.current?.removeEventListener('canplaythrough', handleCanPlay)
                  audioRef.current?.removeEventListener('error', handleError)
                  resolve(undefined)
                }
                const handleError = (e: Event) => {
                  audioRef.current?.removeEventListener('canplaythrough', handleCanPlay)
                  audioRef.current?.removeEventListener('error', handleError)
                  reject(e)
                }
                audioRef.current?.addEventListener('canplaythrough', handleCanPlay, { once: true })
                audioRef.current?.addEventListener('error', handleError, { once: true })
              }).then(() => {
                return audioRef.current?.play()
              })
            }
            return Promise.resolve()
          })
          .then(() => {
            setLoading(false)
            setPlaying(true) // Restore playing state
            setPaused(false) // Ensure not paused
            // Prefetch next paragraphs
            prefetchAudio(1, 3)
          })
          .catch((error) => {
            console.error('Failed to auto-play first paragraph of new page:', error)
            setError(
              `Failed to auto-play: ${error instanceof Error ? error.message : 'Unknown error'}`
            )
            setLoading(false)
            setPlaying(false)
          })
      } else {
        // Not playing, just prefetch
        if (newParagraphs.length > 0) {
          prefetchAudio(0, Math.min(3, newParagraphs.length))
        }
      }
    },
    [
      isPlaying,
      isPaused,
      rendition,
      setParagraphs,
      setCurrentParagraphIndex,
      requestAudio,
      prefetchAudio,
      setLoading,
      setError,
      setPlaying
    ]
  )

  return {
    play,
    pause,
    resume,
    stop,
    next,
    prev,
    setParagraphs: setParagraphsCallback,
    state: {
      isPlaying,
      isPaused,
      currentParagraphIndex,
      paragraphs,
      isLoading,
      hasApiKey,
      error
    }
  }
}
