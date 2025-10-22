import OpenAI from 'openai'
import { EventEmitter } from 'events'
import PriorityQueue from 'priorityqueuejs'
import type { TTSRequest } from '../../shared/types'
import { ttsCache } from './ttsCache'

export enum TTSQueueEvents {
  REQUEST_AUDIO = 'request-audio',
  AUDIO_READY = 'audio-ready',
  AUDIO_ERROR = 'audio-error'
}

export interface QueueItem extends TTSRequest {
  priority: number
  resolve: (audioPath: string) => void
  reject: (error: Error) => void
  requestId: string
  timestamp: number
  retryCount: number
}

/**
 * TTS Queue Manager
 * Handles queuing and processing of text-to-speech requests with OpenAI API
 */
export class TTSQueue extends EventEmitter {
  private queue: PriorityQueue<QueueItem>
  private isProcessing = false
  private openai: OpenAI | null = null
  private apiKey: string | null = null
  private readonly activeRequests = new Map<string, QueueItem>()
  private readonly pendingRequests = new Map<string, QueueItem>()
  private readonly pendingTimeouts = new Set<NodeJS.Timeout>()
  private readonly MAX_RETRIES = 3
  private readonly RETRY_DELAY_MS = 1000
  private readonly REQUEST_TIMEOUT_MS = 30000
  private readonly MAX_QUEUE_SIZE = 15

  constructor() {
    super()

    // Priority queue comparator: higher priority first
    /**
     * Initialize priority queue with custom comparator (higher priority first)
     */
    this.queue = new PriorityQueue((a: QueueItem, b: QueueItem) => b.priority - a.priority)
    this.initializeOpenAI()
    this.on(TTSQueueEvents.REQUEST_AUDIO, this.maintainQueueSize)
  }

  private maintainQueueSize(): void {
    setInterval(() => {
      while (this.queue.size() >= this.MAX_QUEUE_SIZE) {
        this.queue.deq()
      }
    }, 10)
  }

  /**
   * Initialize OpenAI client with API key from environment
   */
  private initializeOpenAI(): void {
    this.apiKey = process.env.OPENAI_API_KEY || null

    if (this.apiKey) {
      this.openai = new OpenAI({
        apiKey: this.apiKey
      })
    }
  }

  /**
   * Check if OpenAI API key is configured
   */
  hasApiKey(): boolean {
    return !!this.apiKey && !!this.openai
  }

  /**
   * Add a TTS request to the queue (cache check should be done by caller)
   */
  async requestAudio(
    bookId: string,
    cfiRange: string,
    text: string,
    priority = 0 // 0 is normal priority, 1 is high priority, 2 is highest priority
  ): Promise<string> {
    if (!this.hasApiKey()) {
      throw new Error('OpenAI API key not configured')
    }
    this.emit(TTSQueueEvents.REQUEST_AUDIO, { bookId, cfiRange, text, priority })

    // Create unique request ID for deduplication
    const requestId = `${bookId}-${cfiRange}`

    // Check for duplicate request
    if (this.pendingRequests.has(requestId)) {
      console.log(`Duplicate request detected, listening for: ${requestId}`)
      return new Promise((resolve, reject) => {
        // Listen for audio-ready events and filter by requestId
        const handleAudioReady = (data: {
          bookId: string
          cfiRange: string
          audioPath: string
          requestId: string
        }) => {
          if (data.requestId === requestId) {
            this.off(TTSQueueEvents.AUDIO_READY, handleAudioReady)
            this.off(TTSQueueEvents.AUDIO_ERROR, handleAudioError)
            resolve(data.audioPath)
          }
        }

        const handleAudioError = (data: {
          bookId: string
          cfiRange: string
          error: Error
          requestId: string
        }) => {
          if (data.requestId === requestId) {
            this.off(TTSQueueEvents.AUDIO_READY, handleAudioReady)
            this.off(TTSQueueEvents.AUDIO_ERROR, handleAudioError)
            reject(data.error)
          }
        }

        this.on(TTSQueueEvents.AUDIO_READY, handleAudioReady)
        this.on(TTSQueueEvents.AUDIO_ERROR, handleAudioError)
      })
    }

    // Return a promise that resolves when the audio is generated
    return new Promise<string>((resolve, reject) => {
      const queueItem: QueueItem = {
        bookId,
        cfiRange,
        text,
        priority,
        resolve,
        reject,
        requestId,
        timestamp: Date.now(),
        retryCount: 0
      }

      // Add item to priority queue (automatically sorted by priority)
      this.queue.enq(queueItem)
      // Store in pending requests map
      this.pendingRequests.set(requestId, queueItem)

      // Start processing if not already running
      if (!this.isProcessing) {
        this.processQueue()
      }
    })
  }

  /**
   * Process the queue sequentially
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.isEmpty()) {
      return
    }

    this.isProcessing = true

    while (!this.queue.isEmpty()) {
      const item = this.queue.deq()

      // Check if request is too old and should be cancelled
      if (Date.now() - item.timestamp > this.REQUEST_TIMEOUT_MS) {
        console.log(`Request timeout, cancelling: ${item.requestId}`)
        this.pendingRequests.delete(item.requestId)
        item.reject(new Error('Request timeout'))
        continue
      }

      // Track active request
      this.activeRequests.set(item.requestId, item)

      try {
        // TODO: Check if this can be optimized as a stream
        const audioBuffer = await this.generateAudio(item)

        // Save directly to cache
        const audioPath = await ttsCache.saveCachedAudio(item.bookId, item.cfiRange, audioBuffer)

        // Clean up tracking
        this.pendingRequests.delete(item.requestId)
        this.activeRequests.delete(item.requestId)

        // Resolve the promise and emit events
        item.resolve(audioPath)

        // Emit audio-ready event with requestId for duplicate listeners
        this.emit(TTSQueueEvents.AUDIO_READY, {
          bookId: item.bookId,
          cfiRange: item.cfiRange,
          audioPath,
          requestId: item.requestId
        })
      } catch (error) {
        // Clean up tracking
        this.pendingRequests.delete(item.requestId)
        this.activeRequests.delete(item.requestId)

        // Handle retry logic
        if (item.retryCount < this.MAX_RETRIES && this.isRetryableError(error)) {
          console.log(`Retrying request ${item.requestId} (attempt ${item.retryCount + 1})`)
          item.retryCount++

          // Add back to queue with delay
          const timeout = setTimeout(
            () => {
              this.queue.enq(item)
              this.pendingRequests.set(item.requestId, item)
              this.pendingTimeouts.delete(timeout)
              if (!this.isProcessing) {
                this.processQueue()
              }
            },
            this.RETRY_DELAY_MS * Math.pow(2, item.retryCount - 1)
          ) // Exponential backoff

          this.pendingTimeouts.add(timeout)
        } else {
          item.reject(error as Error)

          // Emit audio-error event with requestId for duplicate listeners
          this.emit(TTSQueueEvents.AUDIO_ERROR, {
            bookId: item.bookId,
            cfiRange: item.cfiRange,
            error: error as Error,
            requestId: item.requestId
          })

          console.error('TTS generation failed:', error)
        }
      }
    }

    this.isProcessing = false
  }

  /**
   * Generate audio using OpenAI TTS API
   */
  private async generateAudio(item: QueueItem): Promise<Buffer> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized')
    }

    try {
      const response = await this.openai.audio.speech.create({
        model: 'tts-1',
        voice: 'alloy',
        input: item.text,
        response_format: 'mp3',
        speed: 1.0
      })

      // Convert response to buffer
      const audioBuffer = Buffer.from(await response.arrayBuffer())

      return audioBuffer
    } catch (error) {
      throw new Error(`OpenAI TTS API error: ${error}`)
    }
  }

  /**
   * Clear all pending requests
   */
  clearQueue(): void {
    // Clear queue
    while (!this.queue.isEmpty()) {
      const item = this.queue.deq()
      this.pendingRequests.delete(item.requestId)
      item.reject(new Error('Queue cleared'))
    }

    // Clear active requests
    for (const [requestId, item] of this.activeRequests) {
      this.pendingRequests.delete(requestId)
      item.reject(new Error('Request cancelled'))
    }
    this.activeRequests.clear()

    // Emit error events for any pending duplicate listeners
    // (Event listeners will be automatically cleaned up by the event system)

    // Clear pending timeouts
    for (const timeout of this.pendingTimeouts) {
      clearTimeout(timeout)
    }
    this.pendingTimeouts.clear()

    console.log('TTS queue cleared')
  }

  /**
   * Cancel a specific request
   */
  cancelRequest(requestId: string): boolean {
    // Check active requests
    if (this.activeRequests.has(requestId)) {
      const item = this.activeRequests.get(requestId)!
      this.activeRequests.delete(requestId)
      this.pendingRequests.delete(requestId)
      item.reject(new Error('Request cancelled'))
      return true
    }

    // Check pending requests map
    if (this.pendingRequests.has(requestId)) {
      const item = this.pendingRequests.get(requestId)!
      this.pendingRequests.delete(requestId)
      item.reject(new Error('Request cancelled'))
      // Emit error event for any duplicate listeners
      this.emit(TTSQueueEvents.AUDIO_ERROR, {
        bookId: item.bookId,
        cfiRange: item.cfiRange,
        error: new Error('Request cancelled'),
        requestId: requestId
      })
      return true
    }

    return false
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    // Handle all error types more gracefully
    const errorMessage =
      error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()

    return (
      errorMessage.includes('timeout') ||
      errorMessage.includes('network') ||
      errorMessage.includes('rate limit') ||
      errorMessage.includes('server error') ||
      errorMessage.includes('temporary') ||
      errorMessage.includes('connection') ||
      errorMessage.includes('econnreset')
    )
  }

  /**
   * Get current queue status
   */
  getQueueStatus(): { pending: number; isProcessing: boolean; active: number } {
    return {
      pending: this.queue.size(),
      isProcessing: this.isProcessing,
      active: this.activeRequests.size
    }
  }
}

// Export singleton instance
export const ttsQueue = new TTSQueue()
