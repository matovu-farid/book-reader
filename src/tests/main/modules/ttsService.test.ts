import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import { createEventTester } from '../../utils/test-helpers'

// Mock TTS Cache
const mockTtsCache = {
  getCachedAudio: vi.fn(),
  saveCachedAudio: vi.fn().mockResolvedValue('http://localhost:3000/test-audio.mp3'),
  clearBookCache: vi.fn(),
  getBookCacheSize: vi.fn().mockResolvedValue(1024)
}
vi.mock('../../../main/modules/ttsCache', () => ({
  ttsCache: mockTtsCache
}))

// Mock TTS Queue
const mockTtsQueue = new EventEmitter()
mockTtsQueue.requestAudio = vi.fn()
mockTtsQueue.hasApiKey = vi.fn().mockReturnValue(true)
mockTtsQueue.getQueueStatus = vi.fn().mockReturnValue({
  pending: 0,
  isProcessing: false,
  active: 0
})
mockTtsQueue.cancelRequest = vi.fn().mockReturnValue(true)
mockTtsQueue.clearQueue = vi.fn()

vi.mock('../../../main/modules/ttsQueue', () => ({
  ttsQueue: mockTtsQueue
}))

// Import after mocking
import { TTSService } from '../../../main/modules/ttsService'

describe('TTSService', () => {
  let ttsService: TTSService
  let eventTester: ReturnType<typeof createEventTester>

  beforeEach(() => {
    vi.clearAllMocks()
    ttsService = new TTSService()
    eventTester = createEventTester(ttsService)
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  describe('Request handling', () => {
    it('should return cached audio immediately', async () => {
      const bookId = 'test-book'
      const cfiRange = 'test-cfi'
      const text = 'test text'
      const cachedUrl = 'http://localhost:3000/cached-audio.mp3'

      mockTtsCache.getCachedAudio.mockResolvedValueOnce({
        exists: true,
        url: cachedUrl,
        filePath: '/path/to/cached/audio.mp3'
      })

      const result = await ttsService.requestAudio(bookId, cfiRange, text)

      expect(result).toBe(cachedUrl)
      expect(mockTtsCache.getCachedAudio).toHaveBeenCalledWith(bookId, cfiRange)
      expect(mockTtsQueue.requestAudio).not.toHaveBeenCalled()
    })

    it('should queue non-cached requests', async () => {
      const bookId = 'test-book'
      const cfiRange = 'test-cfi'
      const text = 'test text'

      mockTtsCache.getCachedAudio.mockResolvedValueOnce({
        exists: false,
        url: null,
        filePath: null
      })

      mockTtsQueue.requestAudio.mockResolvedValueOnce('http://localhost:3000/new-audio.mp3')

      const result = await ttsService.requestAudio(bookId, cfiRange, text)

      expect(result).toBe('http://localhost:3000/new-audio.mp3')
      expect(mockTtsQueue.requestAudio).toHaveBeenCalledWith(bookId, cfiRange, text, 0)
    })

    it('should handle duplicate active requests', async () => {
      const bookId = 'test-book'
      const cfiRange = 'test-cfi'
      const text = 'test text'

      mockTtsCache.getCachedAudio.mockResolvedValueOnce({
        exists: false,
        url: null,
        filePath: null
      })

      // Make first request
      const firstRequest = ttsService.requestAudio(bookId, cfiRange, text)

      // Make duplicate request while first is active
      const duplicateRequest = ttsService.requestAudio(bookId, cfiRange, text)

      // Simulate audio ready event
      setTimeout(() => {
        ttsService.emit('audio-ready', {
          bookId,
          cfiRange,
          audioPath: 'http://localhost:3000/audio.mp3'
        })
      }, 100)

      const [result1, result2] = await Promise.all([firstRequest, duplicateRequest])

      expect(result1).toBe('http://localhost:3000/audio.mp3')
      expect(result2).toBe('http://localhost:3000/audio.mp3')
    })

    it('should cleanup event listeners properly', async () => {
      const bookId = 'test-book'
      const cfiRange = 'test-cfi'
      const text = 'test text'

      mockTtsCache.getCachedAudio.mockResolvedValueOnce({
        exists: false,
        url: null,
        filePath: null
      })

      // Make duplicate request
      const duplicateRequest = ttsService.requestAudio(bookId, cfiRange, text)

      // Simulate timeout
      vi.useFakeTimers()
      vi.advanceTimersByTime(61000) // 61 seconds

      await expect(duplicateRequest).rejects.toThrow('Request timeout')

      vi.useRealTimers()
    })
  })

  describe('Event emission', () => {
    it('should emit audio-ready events', async () => {
      const bookId = 'test-book'
      const cfiRange = 'test-cfi'
      const text = 'test text'

      mockTtsCache.getCachedAudio.mockResolvedValueOnce({
        exists: false,
        url: null,
        filePath: null
      })

      mockTtsQueue.requestAudio.mockResolvedValueOnce('http://localhost:3000/audio.mp3')

      const emitSpy = vi.spyOn(ttsService, 'emit')

      await ttsService.requestAudio(bookId, cfiRange, text)

      expect(emitSpy).toHaveBeenCalledWith('audio-ready', {
        bookId,
        cfiRange,
        audioPath: 'http://localhost:3000/audio.mp3'
      })
    })

    it('should emit error events', async () => {
      const bookId = 'test-book'
      const cfiRange = 'test-cfi'
      const text = 'test text'

      mockTtsCache.getCachedAudio.mockResolvedValueOnce({
        exists: false,
        url: null,
        filePath: null
      })

      mockTtsQueue.requestAudio.mockRejectedValueOnce(new Error('API error'))

      const emitSpy = vi.spyOn(ttsService, 'emit')

      await expect(ttsService.requestAudio(bookId, cfiRange, text)).rejects.toThrow('API error')

      expect(emitSpy).toHaveBeenCalledWith('error', {
        bookId,
        cfiRange,
        error: 'API error'
      })
    })
  })

  describe('Request management', () => {
    it('should cancel requests correctly', () => {
      const bookId = 'test-book'
      const cfiRange = 'test-cfi'

      const result = ttsService.cancelRequest(bookId, cfiRange)

      expect(result).toBe(true)
      expect(mockTtsQueue.cancelRequest).toHaveBeenCalledWith(`${bookId}-${cfiRange}`)
    })

    it('should cancel all book requests', () => {
      const bookId = 'test-book'

      // Add some active requests for the book
      ;(ttsService as any).activeRequests.add(`${bookId}-cfi1`)
      ;(ttsService as any).activeRequests.add(`${bookId}-cfi2`)
      ;(ttsService as any).activeRequests.add('other-book-cfi1')

      ttsService.cancelBookRequests(bookId)

      expect(mockTtsQueue.cancelRequest).toHaveBeenCalledWith(`${bookId}-cfi1`)
      expect(mockTtsQueue.cancelRequest).toHaveBeenCalledWith(`${bookId}-cfi2`)
      expect(mockTtsQueue.cancelRequest).not.toHaveBeenCalledWith('other-book-cfi1')

      // Should clear active requests for the book
      expect((ttsService as any).activeRequests.has(`${bookId}-cfi1`)).toBe(false)
      expect((ttsService as any).activeRequests.has(`${bookId}-cfi2`)).toBe(false)
      expect((ttsService as any).activeRequests.has('other-book-cfi1')).toBe(true)
    })

    it('should clear queue', () => {
      // Add some pending listeners
      ;(ttsService as any).pendingListeners.set('req1', {
        timeout: setTimeout(() => {}, 1000),
        listeners: {
          onAudioReady: vi.fn(),
          onError: vi.fn()
        }
      })

      ttsService.clearQueue()

      expect(mockTtsQueue.clearQueue).toHaveBeenCalled()
      expect((ttsService as any).activeRequests.size).toBe(0)
      expect((ttsService as any).pendingListeners.size).toBe(0)
    })
  })

  describe('Cache operations', () => {
    it('should get audio path if cached', async () => {
      const bookId = 'test-book'
      const cfiRange = 'test-cfi'
      const cachedUrl = 'http://localhost:3000/cached-audio.mp3'

      mockTtsCache.getCachedAudio.mockResolvedValueOnce({
        exists: true,
        url: cachedUrl,
        filePath: '/path/to/cached/audio.mp3'
      })

      const result = await ttsService.getAudioPath(bookId, cfiRange)

      expect(result).toBe(cachedUrl)
      expect(mockTtsCache.getCachedAudio).toHaveBeenCalledWith(bookId, cfiRange)
    })

    it('should return null if not cached', async () => {
      const bookId = 'test-book'
      const cfiRange = 'test-cfi'

      mockTtsCache.getCachedAudio.mockResolvedValueOnce({
        exists: false,
        url: null,
        filePath: null
      })

      const result = await ttsService.getAudioPath(bookId, cfiRange)

      expect(result).toBeNull()
    })

    it('should clear book cache', async () => {
      const bookId = 'test-book'

      await ttsService.clearBookCache(bookId)

      expect(mockTtsCache.clearBookCache).toHaveBeenCalledWith(bookId)
    })

    it('should get book cache size', async () => {
      const bookId = 'test-book'

      const result = await ttsService.getBookCacheSize(bookId)

      expect(result).toBe(1024)
      expect(mockTtsCache.getBookCacheSize).toHaveBeenCalledWith(bookId)
    })
  })

  describe('API key status', () => {
    it('should check API key status', () => {
      const result = ttsService.hasApiKey()

      expect(result).toBe(true)
      expect(mockTtsQueue.hasApiKey).toHaveBeenCalled()
    })
  })

  describe('Queue status', () => {
    it('should get queue status', () => {
      const result = ttsService.getQueueStatus()

      expect(result).toEqual({
        pending: 0,
        isProcessing: false,
        active: 0
      })
      expect(mockTtsQueue.getQueueStatus).toHaveBeenCalled()
    })
  })

  describe('Error handling', () => {
    it('should handle cache errors', async () => {
      const bookId = 'test-book'
      const cfiRange = 'test-cfi'
      const text = 'test text'

      mockTtsCache.getCachedAudio.mockRejectedValueOnce(new Error('Cache error'))

      await expect(ttsService.requestAudio(bookId, cfiRange, text)).rejects.toThrow('Cache error')
    })

    it('should handle queue errors', async () => {
      const bookId = 'test-book'
      const cfiRange = 'test-cfi'
      const text = 'test text'

      mockTtsCache.getCachedAudio.mockResolvedValueOnce({
        exists: false,
        url: null,
        filePath: null
      })

      mockTtsQueue.requestAudio.mockRejectedValueOnce(new Error('Queue error'))

      await expect(ttsService.requestAudio(bookId, cfiRange, text)).rejects.toThrow('Queue error')
    })

    it('should cleanup active requests on error', async () => {
      const bookId = 'test-book'
      const cfiRange = 'test-cfi'
      const text = 'test text'

      mockTtsCache.getCachedAudio.mockResolvedValueOnce({
        exists: false,
        url: null,
        filePath: null
      })

      mockTtsQueue.requestAudio.mockRejectedValueOnce(new Error('Request failed'))

      await expect(ttsService.requestAudio(bookId, cfiRange, text)).rejects.toThrow(
        'Request failed'
      )

      // Should not have active request after error
      expect((ttsService as any).activeRequests.has(`${bookId}-${cfiRange}`)).toBe(false)
    })
  })
})
