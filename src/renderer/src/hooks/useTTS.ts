import { useEffect, useEffectEvent, useRef } from 'react'
import type { Rendition } from '@renderer/epubjs/types'
import { PlayingState } from '../stores/ttsStore'
import { useTTSQueueStatus } from './useTTSQueries'
import { Player } from '@renderer/models/Player'

export interface TTSControls {
  play: () => void
  pause: () => void
  resume: () => void
  stop: () => void
  next: () => void
  prev: () => void
  player: React.RefObject<Player | null>
}

interface UseTTSProps {
  bookId: string
  rendition: Rendition | null
  onNavigateToPreviousPage: (playingState: PlayingState) => void | Promise<void>
  onNavigateToNextPage: () => void
}

export function useTTS({ bookId, rendition }: UseTTSProps): TTSControls {
  const player = useRef<Player | null>(null)
  const setupPlayer = useEffectEvent(() => {
    if (rendition) {
      player.current = new Player(rendition, bookId)
    }
  })

  useEffect(() => {
    setupPlayer()
    return () => {
      if (player.current) {
        player.current.cleanup()
        player.current = null
      }
    }
  }, [bookId])
  // Zustand store

  // React Query hooks
  useTTSQueueStatus()

  // const currentLocation = rendition?.location?.start?.cfi
  // const { currentPage } = useTTSStore()
  // const trackChangesToAudioContinuation = useEffectEvent((currentLocation: string) => {
  //   if (currentLocation === currentPage) return
  //   // Page changed
  //   if (playingState === PlayingState.Playing) {
  //     // Audio is playing - check if we need to continue

  //     if (direction === 'forward') {
  //       // User manually navigated forward while audio playing
  //       // Reset to first paragraph of new page
  //       setCurrentParagraphIndex(0)
  //     } else {
  //       setToLastParagraphIndex()
  //     }
  //   }

  //   setCurrentPage(currentLocation)
  // })
  // // Track page changes to handle audio continuation
  // useEffect(() => {
  //   if (currentLocation) {
  //     trackChangesToAudioContinuation(currentLocation)
  //   }
  // }, [currentLocation])

  // Set up audio ready listener
  // useEffect(() => {
  //   const handleAudioReady = (
  //     _event: unknown,
  //     data: { bookId: string; cfiRange: string; audioPath: string }
  //   ) => {
  //     if (data.bookId === bookId) {
  //       addToAudioCache(data.cfiRange, data.audioPath)
  //       // Don't auto-play here - let the requesting function handle it
  //     }
  //   }

  //   window.functions.onTTSAudioReady(handleAudioReady)

  //   return () => {
  //     window.functions.removeTTSAudioReadyListener(handleAudioReady)
  //   }
  // }, [bookId, addToAudioCache]) // Stable dependencies

  // const setParagraphsCallback = useCallback(
  //   (newParagraphs: ParagraphWithCFI[]) => {
  //     // Stop current audio
  //     if (audioRef.current) {
  //       audioRef.current.pause()
  //       audioRef.current.currentTime = 0
  //     }

  //     // Remove current highlight
  //     if (currentHighlightRef.current && rendition) {
  //       try {
  //         rendition.removeHighlight(currentHighlightRef.current)
  //         currentHighlightRef.current = null
  //       } catch (error) {
  //         console.warn('Failed to remove highlight:', error)
  //       }
  //     }

  //     // Set new paragraphs
  //     setParagraphs(newParagraphs)
  //     setCurrentParagraphIndex(0)

  //     // If was playing, auto-start with first paragraph of new page
  //     if (playingState === PlayingState.Playing && newParagraphs.length > 0) {
  //       const firstParagraph = newParagraphs[0]
  //       const lastParagraph = newParagraphs[newParagraphs.length - 1]

  //       // Highlight first paragraph
  //       if (rendition) {
  //         currentHighlightRef.current = firstParagraph.cfiRange
  //         rendition.highlightRange(firstParagraph.cfiRange)
  //       }

  //       // Start playing asynchronously
  //       if (playingState !== PlayingState.Playing) {
  //         setPlayingState(PlayingState.Loading)
  //       }
  //       requestAudio(direction === 'forward' ? firstParagraph : lastParagraph, ttsPriority)
  //         .then((audioPath) => {
  //           setTTSPriority((ttsPriority) => ttsPriority + 1)
  //           if (audioPath && audioRef.current) {
  //             audioRef.current.pause()
  //             audioRef.current.currentTime = 0
  //             audioRef.current.src = audioPath
  //             audioRef.current.load()

  //             return new Promise((resolve, reject) => {
  //               const handleCanPlay = () => {
  //                 audioRef.current?.removeEventListener('canplaythrough', handleCanPlay)
  //                 audioRef.current?.removeEventListener('error', handleError)
  //                 resolve(undefined)
  //               }
  //               const handleError = (e: Event) => {
  //                 audioRef.current?.removeEventListener('canplaythrough', handleCanPlay)
  //                 audioRef.current?.removeEventListener('error', handleError)
  //                 reject(e)
  //               }
  //               audioRef.current?.addEventListener('canplaythrough', handleCanPlay, { once: true })
  //               audioRef.current?.addEventListener('error', handleError, { once: true })
  //             }).then(() => {
  //               return audioRef.current?.play()
  //             })
  //           }
  //           return Promise.resolve()
  //         })
  //         .then(() => {
  //           setPlayingState(PlayingState.Playing)
  //           // Prefetch next paragraphs
  //           prefetchAudio(1, 3)
  //         })
  //         .catch((error) => {
  //           console.error('Failed to auto-play first paragraph of new page:', error)
  //           setError(
  //             `Failed to auto-play: ${error instanceof Error ? error.message : 'Unknown error'}`
  //           )
  //           setPlayingState(PlayingState.Stopped)
  //         })
  //     } else {
  //       // Not playing, just prefetch
  //       if (newParagraphs.length > 0) {
  //         prefetchAudio(0, Math.min(3, newParagraphs.length))
  //       }
  //     }
  //   },
  //   [
  //     playingState,

  //     rendition,
  //     setParagraphs,
  //     setCurrentParagraphIndex,
  //     requestAudio,
  //     prefetchAudio,
  //     setPlayingState,
  //     setError
  //   ]
  // )
  function play() {
    if (player.current) {
      player.current.play()
    }
  }
  function pause() {
    if (player.current) {
      player.current.pause()
    }
  }
  function resume() {
    if (player.current) {
      player.current.resume()
    }
  }
  function stop() {
    if (player.current) {
      player.current.stop()
    }
  }
  function next() {
    if (player.current) {
      player.current.next()
    }
  }
  function prev() {
    if (player.current) {
      player.current.prev()
    }
  }
  return {
    play,
    pause,
    resume,
    stop,
    next,
    prev,
    player
  }
}
