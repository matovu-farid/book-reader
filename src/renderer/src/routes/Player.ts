import { Rendition } from '@renderer/epubjs/types'
import { ParagraphWithCFI } from 'src/shared/types'
export enum PlayingState {
  Playing = 'playing',
  Paused = 'paused',
  Stopped = 'stopped',
  Loading = 'loading'
}
export class Player {
  private rendition: Rendition
  private playingState: PlayingState
  private currentParagraphIndex: number
  private paragraphs: ParagraphWithCFI[]
  private bookId: string
  private audioCache: Map<string, string>
  private priority: number
  private errors: string[]
  private audioElement: HTMLAudioElement
  private direction: 'forward' | 'backward'
  private nextPageParagraphs: ParagraphWithCFI[]
  private previousPageParagraphs: ParagraphWithCFI[]
  constructor(rendition: Rendition, bookId: string) {
    this.rendition = rendition
    this.playingState = PlayingState.Stopped
    this.currentParagraphIndex = 0
    this.bookId = bookId
    this.paragraphs = []
    this.audioCache = new Map()
    this.priority = 3
    this.errors = []
    this.audioElement = new Audio()
    this.direction = 'forward'
    this.nextPageParagraphs = []
    this.previousPageParagraphs = []
    this.audioElement.addEventListener('ended', this.handleEnded)
    this.audioElement.addEventListener('error', this.handleError)
  }
  private cleanup() {
    this.audioElement.removeEventListener('ended', this.handleEnded)
    this.audioElement.removeEventListener('error', this.handleError)
    this.audioElement.pause()
    this.audioElement.src = ''
  }
  private handleEnded = () => {
    // Safely remove current highlight

    try {
      const currentParagraph = this.getCurrentParagraph()
      if (!currentParagraph) return
      this.rendition.removeHighlight(currentParagraph.cfiRange)
    } catch (error) {
      console.warn('Failed to remove highlight:', error)
    }

    // advanceToNextParagraphRef.current?.() // Use ref to avoid stale closure
    this.next()
  }
  private handleError = (e: ErrorEvent) => {
    console.error('Audio error:', e)
    this.errors.push('Audio playback failed')

    this.playingState = PlayingState.Stopped
  }
  private getCurrentParagraph() {
    if (this.currentParagraphIndex >= this.paragraphs.length || this.currentParagraphIndex < 0) {
      this.errors.push('No paragraphs available to play')
      return null
    }
    return this.paragraphs[this.currentParagraphIndex]
  }
  private getNextParagraph() {
    const nextIndex = this.currentParagraphIndex + 1
    if (nextIndex >= this.paragraphs.length || nextIndex < 0) {
      return null
    }
    return this.paragraphs[nextIndex]
  }
  private getPreviousParagraph() {
    const previousIndex = this.currentParagraphIndex - 1
    if (previousIndex >= this.paragraphs.length || previousIndex < 0) {
      return null
    }
    return this.paragraphs[previousIndex]
  }

  public setParagraphs(paragraphs: ParagraphWithCFI[]) {
    this.paragraphs = paragraphs
  }
  public setNextPageParagraphs(paragraphs: ParagraphWithCFI[]) {
    this.nextPageParagraphs = paragraphs
  }
  public setPreviousPageParagraphs(paragraphs: ParagraphWithCFI[]) {
    this.previousPageParagraphs = paragraphs
  }

  public async play() {
    if (this.playingState === PlayingState.Playing) return

    this.playingState = PlayingState.Playing
    if (!this.hasApiKey()) {
      this.errors.push('OpenAI API key not configured')
      return
    }
    if (this.paragraphs.length === 0) {
      this.errors.push('No paragraphs available to play')
    }
    if (this.currentParagraphIndex >= this.paragraphs.length || this.currentParagraphIndex < 0) {
      this.errors.push('No paragraphs available to play')
      return
    }

    const currentParagraph = this.paragraphs[this.currentParagraphIndex]
    // Highlight current paragraph and store reference
    this.highlightParagraph(currentParagraph)
    // Request audio with high priority
    const audioPath = await this.requestAudio(currentParagraph, this.getNextPriority())
    if (!audioPath) {
      this.errors.push('Failed to request audio')
      return
    }
    this.audioElement.pause()
    this.audioElement.currentTime = 0

    // Set new source and wait for it to be ready
    this.audioElement.src = audioPath
    this.audioElement.load()
    try {
      await new Promise((resolve, reject) => {
        const handleCanPlay = () => {
          this.audioElement?.removeEventListener('canplaythrough', handleCanPlay)
          this.audioElement?.removeEventListener('error', handleError)
          resolve(undefined)
        }
        const handleError = (e: Event) => {
          this.audioElement?.removeEventListener('canplaythrough', handleCanPlay)
          this.audioElement?.removeEventListener('error', handleError)
          reject(e)
        }
        this.audioElement?.addEventListener('canplaythrough', handleCanPlay, { once: true })
        this.audioElement?.addEventListener('error', handleError, { once: true })
      })
      await this.audioElement.play()
      this.playingState = PlayingState.Playing

      // Prefetch next paragraphs
      this.prefetchAudio(this.currentParagraphIndex + 1, 3)
    } catch (error) {
      console.error('Playback failed:', error)
      this.errors.push(
        `Playback failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
      this.playingState = PlayingState.Stopped
    }
  }
  public pause = () => {
    if (this.audioElement && !this.audioElement.paused) {
      this.audioElement.pause()

      this.playingState = PlayingState.Paused
    }
  }
  public resume = () => {
    if (!this.audioElement.paused) return
    this.audioElement.play().catch((error) => {
      console.error('Failed to resume audio:', error)
      this.errors.push(`Failed to resume audio: ${error.message}`)
    })
    this.playingState = PlayingState.Playing
  }

  public stop = () => {
    if (this.audioElement) {
      this.audioElement.pause()
      this.audioElement.currentTime = 0
    }
    const currentParagraph = this.getCurrentParagraph()
    if (!currentParagraph) return

    this.rendition.removeHighlight(currentParagraph.cfiRange)

    this.playingState = PlayingState.Stopped
  }
  private prefetchNextPageAudio = (count: number = 3) => {
    if (this.nextPageParagraphs.length === 0) return
    for (let i = 0; i < Math.min(count, this.nextPageParagraphs.length); i++) {
      const paragraph = this.nextPageParagraphs[i]
      this.requestAudio(paragraph, this.getPrefetchPriority()).catch((error) => {
        console.warn(`Prefetch failed for next page paragraph ${i}:`, error)
      })
    }
  }
  private moveToNextPage = async () => {
    const temp = this.paragraphs
    await this.rendition.next()
    this.currentParagraphIndex = 0
    this.paragraphs = this.nextPageParagraphs
    this.cleanup()
    this.nextPageParagraphs = (await this.rendition.getNextViewParagraphs()) || []
    this.previousPageParagraphs = temp
  }
  private moveToPreviousPage = async () => {
    const temp = this.paragraphs
    await this.rendition.prev()
    this.paragraphs = this.previousPageParagraphs
    if (this.playingState === PlayingState.Playing) {
      this.currentParagraphIndex = this.paragraphs.length - 1
    }

    this.cleanup()
    this.previousPageParagraphs = (await this.rendition.getPreviousViewParagraphs()) || []
    this.nextPageParagraphs = temp
  }

  public next = async () => {
    const nextIndex = this.currentParagraphIndex + 1

    this.direction = 'forward'

    if (nextIndex == this.paragraphs.length - 1) {
      // Request audio for the next paragraphs of the next page
      if (this.playingState === PlayingState.Playing) {
        this.prefetchNextPageAudio(3)
      }
    }

    // If at end of current page, go to next page
    if (nextIndex >= this.paragraphs.length) {
      this.moveToNextPage()

      if (this.playingState !== PlayingState.Playing) {
        return
      }
    }
    const currentParagraph = this.getCurrentParagraph()
    if (!currentParagraph) return
    this.unhighlightParagraph(currentParagraph)
    const nextParagraph = this.getNextParagraph()
    if (!nextParagraph) return
    this.highlightParagraph(nextParagraph)
    this.currentParagraphIndex = nextIndex

    // Always handle audio and highlighting when next is clicked
    // Pause current audio first
    this.audioElement.pause()

    // If was playing, continue playing with next paragraph
    if (this.playingState !== PlayingState.Playing) return
    try {
      const audioPath = await this.requestAudio(nextParagraph, this.getNextPriority())

      if (!audioPath) return
      this.audioElement.pause()
      this.audioElement.currentTime = 0
      this.audioElement.src = audioPath
      this.audioElement.load()

      await new Promise((resolve, reject) => {
        const handleCanPlay = () => {
          this.audioElement.removeEventListener('canplaythrough', handleCanPlay)
          this.audioElement.removeEventListener('error', handleError)
          resolve(undefined)
        }
        const handleError = (e: Event) => {
          this.audioElement.removeEventListener('canplaythrough', handleCanPlay)
          this.audioElement.removeEventListener('error', handleError)
          reject(e)
        }
        this.audioElement.addEventListener('canplaythrough', handleCanPlay, { once: true })
        this.audioElement.addEventListener('error', handleError, { once: true })
      })

      await this.audioElement.play()
      this.prefetchAudio(nextIndex + 1, 3)
    } catch (error) {
      console.error('Failed to play next paragraph:', error)
      this.errors.push(
        `Failed to play next paragraph: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
      this.playingState = PlayingState.Stopped
    }
  }
  public prev = async () => {
    this.direction = 'backward'
    const prevIndex = this.currentParagraphIndex - 1

    // If at start of current page, go to previous page
    if (prevIndex < 0) {
      // TODO: Need to set new paragraphs for both the previous and next pages

      // Will be set to last paragraph when new page loads
      // Navigate to previous page

      this.moveToPreviousPage()

      return
    }

    // Remove current highlight using stored reference
    const currentParagraph = this.getCurrentParagraph()
    if (currentParagraph) {
      try {
        this.unhighlightParagraph(currentParagraph)
      } catch (error) {
        console.warn('Failed to remove highlight:', error)
      }
    }

    this.currentParagraphIndex = prevIndex
    const prevParagraph = this.getPreviousParagraph()
    if (!prevParagraph) return

    // Always handle audio and highlighting when prev is clicked
    // Pause current audio first
    if (this.audioElement) {
      this.audioElement.pause()
    }

    // Highlight previous paragraph

    this.highlightParagraph(prevParagraph)

    // If was playing, continue playing with previous paragraph
    if (this.playingState !== PlayingState.Playing) return

    try {
      const audioPath = await this.requestAudio(prevParagraph, this.getNextPriority())

      if (audioPath) {
        this.audioElement.pause()
        this.audioElement.currentTime = 0
        this.audioElement.src = audioPath
        this.audioElement.load()

        await new Promise((resolve, reject) => {
          const handleCanPlay = () => {
            this.audioElement.removeEventListener('canplaythrough', handleCanPlay)
            this.audioElement.removeEventListener('error', handleError)
            resolve(undefined)
          }
          const handleError = (e: Event) => {
            this.audioElement.removeEventListener('canplaythrough', handleCanPlay)
            this.audioElement.removeEventListener('error', handleError)
            reject(e)
          }
          this.audioElement.addEventListener('canplaythrough', handleCanPlay, { once: true })
          this.audioElement.addEventListener('error', handleError, { once: true })
        })

        await this.audioElement.play()
        // Prefetch backwards for previous paragraphs
        this.prefetchAudio(prevIndex - 3, 3)
      }
    } catch (error) {
      console.error('Failed to play previous paragraph:', error)
      this.errors.push(
        `Failed to play previous paragraph: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
      this.playingState = PlayingState.Stopped
    }
  }

  private getNextPriority() {
    this.priority = this.priority + 1
    return this.priority
  }
  private getPrefetchPriority() {
    return this.priority - 1
  }
  private hasApiKey() {
    return window.functions.getTTSApiKeyStatus()
  }
  private highlightParagraph(paragraph: ParagraphWithCFI) {
    this.rendition.highlightRange(paragraph.cfiRange)
  }
  private unhighlightParagraph(paragraph: ParagraphWithCFI) {
    this.rendition.removeHighlight(paragraph.cfiRange)
  }
  private async requestAudio(paragraph: ParagraphWithCFI, priority: number) {
    if (!paragraph.text.trim()) return

    // Check Zustand cache first
    const cached = this.audioCache.get(paragraph.cfiRange)
    if (cached) return cached

    // Check disk cache via direct API call
    try {
      const diskCached = await window.functions.getTTSAudioPath(this.bookId, paragraph.cfiRange)
      if (diskCached) {
        this.addToAudioCache(paragraph.cfiRange, diskCached)
        return diskCached
      }
    } catch (error) {
      console.warn('Cache check failed:', error)
    }

    // Request new audio via React Query mutation

    const audioPath = await window.functions.requestTTSAudio(
      this.bookId,
      paragraph.cfiRange,
      paragraph.text,
      priority
    )

    // Update cache
    this.addToAudioCache(paragraph.cfiRange, audioPath)

    return audioPath
  }
  addToAudioCache(cfiRange: string, audioPath: string) {
    this.audioCache.set(cfiRange, audioPath)
  }

  private async prefetchAudio(startIndex: number, count: number) {
    for (let i = 0; i < count; i++) {
      const index = startIndex + i
      if (index < this.paragraphs.length && index >= 0) {
        const paragraph = this.paragraphs[index]
        this.requestAudio(paragraph, this.priority - 1).catch((error) => {
          console.warn(`Prefetch failed for paragraph ${index}:`, error)
        }) // Fix: Add error logging for prefetch failures
      }
    }
  }
}
