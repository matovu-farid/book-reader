import type { Rendition } from '@epubjs'
import { ParagraphWithCFI } from 'src/shared/types'
import EventEmitter from 'events'
import { EVENTS } from '@renderer/epubjs/src/utils/constants'
export enum PlayingState {
  Playing = 'playing',
  Paused = 'paused',
  Stopped = 'stopped',
  Loading = 'loading'
}
export class Player extends EventEmitter {
  private rendition: Rendition
  private playingState: PlayingState = PlayingState.Stopped
  private currentParagraphIndex: number
  private paragraphs: ParagraphWithCFI[] = []
  private bookId: string
  private audioCache: Map<string, string>
  private priority: number
  private errors: string[]
  private audioElement: HTMLAudioElement = new Audio()

  private nextPageParagraphs: ParagraphWithCFI[]
  private previousPageParagraphs: ParagraphWithCFI[]
  private hasApiKey: boolean
  constructor(rendition: Rendition, bookId: string) {
    super()
    this.rendition = rendition
    this.setPlayingState(PlayingState.Stopped)
    this.currentParagraphIndex = 0
    this.bookId = bookId
    this.hasApiKey = false
    this.checkApiKey()
    // this.paragraphs = rendition.getCurrentViewParagraphs() || []
    rendition.on('rendered', () => {
      this.paragraphs = rendition.getCurrentViewParagraphs() || []
      rendition.getNextViewParagraphs().then((nextPageParagraphs) => {
        this.nextPageParagraphs = nextPageParagraphs || []
      })
      rendition.getPreviousViewParagraphs().then((previousPageParagraphs) => {
        this.previousPageParagraphs = previousPageParagraphs?.reverse() || []
      })
      this.audioElement = new Audio()
      this.audioElement.addEventListener('ended', this.handleEnded)
      this.audioElement.addEventListener('error', this.handleError)
    })
    this.rendition.on(EVENTS.RENDITION.LOCATION_CHANGED, this.handleLocationChanged)
    this.audioCache = new Map()
    this.priority = 3
    this.errors = []

    this.nextPageParagraphs = []
    this.previousPageParagraphs = []
  }

  private handleLocationChanged = () => {
    if (this.playingState !== PlayingState.Playing) return
    this.stop()
    this.paragraphs = this.rendition.getCurrentViewParagraphs() || []
    this.currentParagraphIndex = 0
    this.rendition.getNextViewParagraphs().then((nextPageParagraphs) => {
      this.nextPageParagraphs = nextPageParagraphs || []
    })
    this.rendition.getPreviousViewParagraphs().then((previousPageParagraphs) => {
      this.previousPageParagraphs = previousPageParagraphs?.reverse() || []
    })

    this.play()
  }
  public cleanup() {
    this.audioElement.removeEventListener('ended', this.handleEnded)
    this.audioElement.removeEventListener('error', this.handleError)
    this.audioElement.pause()
    this.audioElement.src = ''
  }
  private handleEnded = () => {
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

    this.setPlayingState(PlayingState.Stopped)
  }
  private getCurrentParagraph() {
    if (this.currentParagraphIndex >= this.paragraphs.length || this.currentParagraphIndex < 0) {
      this.errors.push('No paragraphs available to play')
      return null
    }
    return this.paragraphs[this.currentParagraphIndex]
  }

  public setParagraphs(paragraphs: ParagraphWithCFI[]) {
    this.paragraphs = paragraphs
  }

  public async play() {
    this.setPlayingState(PlayingState.Playing)

    if (!this.hasApiKey) {
      console.error('🎵 No API key available')
      this.errors.push('OpenAI API key not configured')
      return
    }

    if (this.paragraphs.length === 0) {
      console.error('🎵 No paragraphs available')
      this.errors.push('No paragraphs available to play')
      return
    }
    // check if the current paragraph index is valid
    if (this.currentParagraphIndex >= this.paragraphs.length || this.currentParagraphIndex < 0) {
      console.error(
        '🎵 Invalid paragraph index:',
        this.currentParagraphIndex,
        'out of',
        this.paragraphs.length
      )
      this.errors.push('No paragraphs available to play')
      return
    }

    const currentParagraph = this.paragraphs[this.currentParagraphIndex]

    // Highlight current paragraph and store reference

    this.highlightParagraph(currentParagraph)

    // Request audio with high priority

    const audioPath = await this.requestAudio(currentParagraph, this.getNextPriority())

    if (!audioPath) {
      console.error('🎵 Failed to get audio path')
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
          console.error('🎵 Audio load error:', e)
          this.audioElement?.removeEventListener('canplaythrough', handleCanPlay)
          this.audioElement?.removeEventListener('error', handleError)
          reject(e)
        }
        this.audioElement?.addEventListener('canplaythrough', handleCanPlay, { once: true })
        this.audioElement?.addEventListener('error', handleError, { once: true })
      })

      await this.audioElement.play()
      this.setPlayingState(PlayingState.Playing)

      // Prefetch next paragraphs

      this.prefetchAudio(this.currentParagraphIndex + 1, 3)
      this.prefetchAudio(this.currentParagraphIndex - 3, 3)
    } catch (error) {
      console.error('🎵 Playback failed:', error)
      this.errors.push(
        `Playback failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
      this.setPlayingState(PlayingState.Stopped)
    }
  }
  public pause() {
    if (this.audioElement.paused) return
    this.audioElement.pause()

    this.setPlayingState(PlayingState.Paused)
  }
  public resume() {
    if (!this.audioElement.paused) return
    this.audioElement.play().catch((error) => {
      console.error('Failed to resume audio:', error)
      this.errors.push(`Failed to resume audio: ${error.message}`)
    })
    this.setPlayingState(PlayingState.Playing)
  }

  public stop() {
    this.audioElement.pause()
    this.audioElement.currentTime = 0

    const currentParagraph = this.getCurrentParagraph()
    if (!currentParagraph) return

    this.rendition.removeHighlight(currentParagraph.cfiRange)

    this.setPlayingState(PlayingState.Stopped)
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
  private prefetchPrevPageAudio = (count: number = 3) => {
    if (this.previousPageParagraphs.length === 0) return

    for (let i = 0; i < Math.min(count, this.previousPageParagraphs.length); i++) {
      const paragraph = this.previousPageParagraphs[i]
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
  private updateParagaph = async (index: number) => {
    // bounds checks
    if (index < 0) {
      this.moveToPreviousPage()
      return
    }
    if (index >= this.paragraphs.length) {
      this.moveToNextPage()
      return
    }
    if (index == this.paragraphs.length - 1) {
      // Request audio for the next paragraphs of the next page
      if (this.playingState === PlayingState.Playing) {
        this.prefetchNextPageAudio(3)
      }
    }
    if (index == 0) {
      // Request audio for the previous paragraphs of the previous page
      if (this.playingState === PlayingState.Playing) {
        this.prefetchPrevPageAudio(3)
      }
    }
    // first remove the current paragraph highlight and pause audio
    let currentParagraph = this.getCurrentParagraph()
    if (currentParagraph) {
      this.unhighlightParagraph(currentParagraph)
    }

    this.currentParagraphIndex = index
    currentParagraph = this.getCurrentParagraph()
    if (!currentParagraph) return
    await this.play()
  }
  public prev = async () => {
    const prevIndex = this.currentParagraphIndex - 1
    this.updateParagaph(prevIndex)
  }
  public next = async () => {
    const nextIndex = this.currentParagraphIndex + 1

    this.updateParagaph(nextIndex)
  }

  public getPlayingState() {
    return this.playingState
  }
  public setPlayingState(playingState: PlayingState) {
    console.log('🎵 Playing state', playingState)
    if (this.playingState === playingState) return
    this.playingState = playingState
    this.emit('playingStateChanged', playingState)
  }

  public getErrors() {
    return this.errors
  }

  private getNextPriority() {
    this.priority = this.priority + 1
    return this.priority
  }
  private getPrefetchPriority() {
    return this.priority - 1
  }
  private checkApiKey() {
    window.functions.getTTSApiKeyStatus().then((hasApiKey) => {
      this.hasApiKey = hasApiKey
      if (!hasApiKey) {
        this.errors.push('OpenAI API key not configured')
        this.setPlayingState(PlayingState.Stopped)
      }
    })
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
