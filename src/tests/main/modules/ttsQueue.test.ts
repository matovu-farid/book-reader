import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import { createMockOpenAI, createMockFileSystem } from '../../utils/test-helpers'

// Mock OpenAI
const mockOpenAI = createMockOpenAI()
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => mockOpenAI)
}))

// Mock fs/promises
const mockFS = createMockFileSystem()
vi.mock('fs/promises', () => mockFS)

// Mock TTS Cache
vi.mock('../../../main/modules/ttsCache', () => ({
  ttsCache: {
    saveCachedAudio: vi.fn().mockResolvedValue('http://localhost:3000/test-audio.mp3')
  }
}))

// Mock PriorityQueue
vi.mock('priorityqueuejs', () => ({
  default: vi.fn().mockImplementation(() => ({
    enq: vi.fn(),
    deq: vi.fn().mockReturnValue(null),
    isEmpty: vi.fn().mockReturnValue(true),
    size: vi.fn().mockReturnValue(0)
  }))
}))

// Set up environment variable
process.env.OPENAI_API_KEY = 'test-api-key'

// Import after mocking
import { TTSQueue } from '../../../main/modules/ttsQueue'

describe('TTSQueue', () => {
  let ttsQueue: TTSQueue

  beforeEach(() => {
    vi.clearAllMocks()
    ttsQueue = new TTSQueue()
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  describe('Basic functionality', () => {
    it('should initialize correctly', () => {
      expect(ttsQueue).toBeInstanceOf(TTSQueue)
      expect(ttsQueue.hasApiKey()).toBe(true)
    })

    it('should return false when API key is not configured', () => {
      delete process.env.OPENAI_API_KEY
      const newQueue = new TTSQueue()
      expect(newQueue.hasApiKey()).toBe(false)
    })

    it('should return correct queue status', () => {
      const status = ttsQueue.getQueueStatus()
      expect(status).toEqual({
        pending: 0,
        isProcessing: false,
        active: 0
      })
    })
  })

  describe('Request handling', () => {
    it('should handle request audio calls', async () => {
      const bookId = 'test-book'
      const cfiRange = 'test-cfi'
      const text = 'test text'

      // Mock successful audio generation
      mockOpenAI.audio.speech.create.mockResolvedValueOnce({
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(1024))
      })

      // Create a simple mock queue for this test
      const mockQueue = {
        enq: vi.fn(),
        deq: vi.fn().mockReturnValue(null),
        isEmpty: vi.fn().mockReturnValue(true),
        size: vi.fn().mockReturnValue(0)
      }
      ;(ttsQueue as any).queue = mockQueue

      const result = await ttsQueue.requestAudio(bookId, cfiRange, text)

      expect(mockQueue.enq).toHaveBeenCalled()
      expect(typeof result).toBe('string')
    })

    it('should handle API key validation', () => {
      expect(ttsQueue.hasApiKey()).toBe(true)
    })
  })

  describe('Error handling', () => {
    it('should handle OpenAI API errors', async () => {
      const bookId = 'test-book'
      const cfiRange = 'test-cfi'
      const text = 'test text'

      // Mock API error
      mockOpenAI.audio.speech.create.mockRejectedValueOnce(new Error('Rate limit exceeded'))

      // Create a simple mock queue for this test
      const mockQueue = {
        enq: vi.fn(),
        deq: vi.fn().mockReturnValue(null),
        isEmpty: vi.fn().mockReturnValue(true),
        size: vi.fn().mockReturnValue(0)
      }
      ;(ttsQueue as any).queue = mockQueue

      await expect(ttsQueue.requestAudio(bookId, cfiRange, text)).rejects.toThrow()
    })
  })

  describe('Queue management', () => {
    it('should clear queue', () => {
      // Should not throw
      expect(() => ttsQueue.clearQueue()).not.toThrow()
    })

    it('should cancel requests', () => {
      const result = ttsQueue.cancelRequest('non-existent-request')
      expect(result).toBe(false) // Should return false for non-existent request
    })
  })
})
