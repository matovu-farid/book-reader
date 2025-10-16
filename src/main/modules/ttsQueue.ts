import OpenAI from 'openai'
import { EventEmitter } from 'events'
import PriorityQueue from 'priorityqueuejs'
import type { TTSRequest } from '../../shared/types'
import { ttsCache } from './ttsCache'

export interface QueueItem extends TTSRequest {
  priority: number
  resolve: (audioPath: string) => void
  reject: (error: Error) => void
  requestId: string
  timestamp: number
  retryCount: number
}

interface DuplicateRequest {
  resolve: (audioPath: string) => void
  reject: (error: Error) => void
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
  private readonly requestDeduplication = new Map<string, QueueItem>()
  private readonly duplicateRequests = new Map<string, DuplicateRequest[]>()
  private readonly pendingTimeouts = new Set<NodeJS.Timeout>()
  private readonly MAX_RETRIES = 3
  private readonly RETRY_DELAY_MS = 1000
  private readonly REQUEST_TIMEOUT_MS = 30000

  constructor() {
    super()
    // Initialize priority queue with custom comparator (higher priority first)
    this.queue = new PriorityQueue((a: QueueItem, b: QueueItem) => b.priority - a.priority)
    this.initializeOpenAI()
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
    priority = 0
  ): Promise<string> {
    if (!this.hasApiKey()) {
      throw new Error('OpenAI API key not configured')
    }

    // Create unique request ID for deduplication
    const requestId = `${bookId}-${cfiRange}`

    // Check for duplicate request
    if (this.requestDeduplication.has(requestId)) {
      console.log(`Duplicate request detected, queuing duplicate: ${requestId}`)
      return new Promise((resolve, reject) => {
        // Store duplicate request callbacks
        if (!this.duplicateRequests.has(requestId)) {
          this.duplicateRequests.set(requestId, [])
        }
        this.duplicateRequests.get(requestId)!.push({ resolve, reject })
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

      // Store in deduplication map
      this.requestDeduplication.set(requestId, queueItem)

      // Add item to priority queue (automatically sorted by priority)
      this.queue.enq(queueItem)

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
        this.requestDeduplication.delete(item.requestId)
        item.reject(new Error('Request timeout'))
        continue
      }

      // Track active request
      this.activeRequests.set(item.requestId, item)

      try {
        const audioBuffer = await this.generateAudio(item)

        // Save directly to cache
        const audioPath = await ttsCache.saveCachedAudio(item.bookId, item.cfiRange, audioBuffer)

        // Clean up tracking
        this.requestDeduplication.delete(item.requestId)
        this.activeRequests.delete(item.requestId)

        // Resolve the promise and emit event
        item.resolve(audioPath)

        // Resolve all duplicate requests
        const duplicates = this.duplicateRequests.get(item.requestId) || []
        duplicates.forEach(({ resolve: duplicateResolve }) => {
          duplicateResolve(audioPath)
        })
        this.duplicateRequests.delete(item.requestId)

        this.emit('audio-ready', {
          bookId: item.bookId,
          cfiRange: item.cfiRange,
          audioPath
        })
      } catch (error) {
        // Clean up tracking
        this.requestDeduplication.delete(item.requestId)
        this.activeRequests.delete(item.requestId)

        // Handle retry logic
        if (item.retryCount < this.MAX_RETRIES && this.isRetryableError(error)) {
          console.log(`Retrying request ${item.requestId} (attempt ${item.retryCount + 1})`)
          item.retryCount++

          // Add back to queue with delay
          const timeout = setTimeout(
            () => {
              this.queue.enq(item)
              this.requestDeduplication.set(item.requestId, item)
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

          // Reject all duplicate requests
          const duplicates = this.duplicateRequests.get(item.requestId) || []
          duplicates.forEach(({ reject: duplicateReject }) => {
            duplicateReject(error as Error)
          })
          this.duplicateRequests.delete(item.requestId)

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
      this.requestDeduplication.delete(item.requestId)
      item.reject(new Error('Queue cleared'))
    }

    // Clear active requests
    for (const [requestId, item] of this.activeRequests) {
      this.requestDeduplication.delete(requestId)
      item.reject(new Error('Request cancelled'))
    }
    this.activeRequests.clear()

    // Clear duplicate requests
    for (const [, duplicates] of this.duplicateRequests) {
      duplicates.forEach(({ reject }) => {
        reject(new Error('Queue cleared'))
      })
    }
    this.duplicateRequests.clear()

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
      this.requestDeduplication.delete(requestId)
      item.reject(new Error('Request cancelled'))
      return true
    }

    // Check deduplication map
    if (this.requestDeduplication.has(requestId)) {
      const item = this.requestDeduplication.get(requestId)!
      this.requestDeduplication.delete(requestId)
      item.reject(new Error('Request cancelled'))
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
