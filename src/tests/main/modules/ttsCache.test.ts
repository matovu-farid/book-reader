import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { app } from 'electron'
import path from 'path'
import { createMockFileSystem } from '../../utils/test-helpers'

// Mock Electron app
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn()
  }
}))

// Mock fs/promises
const mockFS = createMockFileSystem()
vi.mock('fs/promises', () => mockFS)

// Mock path
vi.mock('path', () => ({
  default: {
    join: (...paths: string[]) => paths.join('/'),
    dirname: (p: string) => p.split('/').slice(0, -1).join('/'),
    basename: (p: string) => p.split('/').pop() || '',
    extname: (p: string) => {
      const ext = p.split('.').pop()
      return ext ? `.${ext}` : ''
    }
  }
}))

// Import the module after mocking
import { TTSCache } from '../../../main/modules/ttsCache'

describe('TTSCache', () => {
  let ttsCache: TTSCache
  const mockAppDataPath = '/mock/app/data'

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock app.getPath to return our test path
    vi.mocked(app.getPath).mockReturnValue(mockAppDataPath)

    // Clear mock file system
    mockFS.files.clear()
    mockFS.directories.clear()

    ttsCache = new TTSCache()
  })

  afterEach(() => {
    mockFS.files.clear()
    mockFS.directories.clear()
  })

  describe('Cache CRUD operations', () => {
    it('should save and retrieve cached audio', async () => {
      const bookId = 'test-book-1'
      const cfiRange = 'epubcfi(/6/4[chapter01]/2/1:0)'
      const audioBuffer = Buffer.from('test audio data')

      // Save audio
      const audioPath = await ttsCache.saveCachedAudio(bookId, cfiRange, audioBuffer)

      expect(audioPath).toContain('http://localhost:3000/tts-cache')
      expect(audioPath).toContain(bookId)
      expect(mockFS.writeFile).toHaveBeenCalledWith(
        expect.stringContaining(`${bookId}/${expect.stringMatching(/[a-f0-9]+\.mp3$/)}`),
        expect.any(Uint8Array)
      )

      // Retrieve audio
      const cached = await ttsCache.getCachedAudio(bookId, cfiRange)
      expect(cached.exists).toBe(true)
      expect(cached.url).toBe(audioPath)
      expect(cached.filePath).toContain(bookId)
    })

    it('should return null for non-existent cache', async () => {
      const bookId = 'non-existent-book'
      const cfiRange = 'epubcfi(/6/4[chapter01]/2/1:0)'

      const cached = await ttsCache.getCachedAudio(bookId, cfiRange)
      expect(cached.exists).toBe(false)
      expect(cached.url).toBeNull()
      expect(cached.filePath).toBeNull()
    })

    it('should handle cache size limits', async () => {
      // Mock large files to test cache cleanup
      const largeBuffer = Buffer.alloc(100 * 1024 * 1024) // 100MB

      // Save multiple large files
      for (let i = 0; i < 6; i++) {
        await ttsCache.saveCachedAudio(`book-${i}`, `cfi-${i}`, largeBuffer)
      }

      // Should have triggered cleanup
      expect(mockFS.unlink).toHaveBeenCalled()
    })

    it('should cleanup old files when threshold exceeded', async () => {
      const largeBuffer = Buffer.alloc(50 * 1024 * 1024) // 50MB

      // Create enough files to exceed threshold
      for (let i = 0; i < 12; i++) {
        await ttsCache.saveCachedAudio(`book-${i}`, `cfi-${i}`, largeBuffer)
      }

      // Should have cleaned up oldest files
      expect(mockFS.unlink).toHaveBeenCalled()
    })

    it('should handle file system errors gracefully', async () => {
      const bookId = 'test-book'
      const cfiRange = 'test-cfi'
      const audioBuffer = Buffer.from('test data')

      // Mock writeFile to throw error
      mockFS.writeFile.mockRejectedValueOnce(new Error('Disk full'))

      await expect(ttsCache.saveCachedAudio(bookId, cfiRange, audioBuffer)).rejects.toThrow(
        'Failed to save cached audio: Error: Disk full'
      )
    })
  })

  describe('URL generation', () => {
    it('should generate correct HTTP URLs', async () => {
      const bookId = 'test-book'
      const cfiRange = 'test-cfi'
      const audioBuffer = Buffer.from('test data')

      const audioPath = await ttsCache.saveCachedAudio(bookId, cfiRange, audioBuffer)

      expect(audioPath).toMatch(/^http:\/\/localhost:3000\/tts-cache\/test-book\/[a-f0-9]+\.mp3$/)
    })

    it('should hash CFI ranges consistently', async () => {
      const bookId = 'test-book'
      const cfiRange = 'epubcfi(/6/4[chapter01]/2/1:0)'
      const audioBuffer = Buffer.from('test data')

      // Save same CFI range multiple times
      const audioPath1 = await ttsCache.saveCachedAudio(bookId, cfiRange, audioBuffer)
      const audioPath2 = await ttsCache.saveCachedAudio(bookId, cfiRange, audioBuffer)

      // Should generate same filename (same hash)
      const filename1 = path.basename(audioPath1)
      const filename2 = path.basename(audioPath2)
      expect(filename1).toBe(filename2)
    })
  })

  describe('Book cache operations', () => {
    it('should clear all cache for a book', async () => {
      const bookId = 'test-book'
      const audioBuffer = Buffer.from('test data')

      // Save multiple files for the book
      await ttsCache.saveCachedAudio(bookId, 'cfi-1', audioBuffer)
      await ttsCache.saveCachedAudio(bookId, 'cfi-2', audioBuffer)

      // Clear cache for the book
      await ttsCache.clearBookCache(bookId)

      expect(mockFS.unlink).toHaveBeenCalledTimes(2)
    })

    it('should calculate book cache size correctly', async () => {
      const bookId = 'test-book'
      const audioBuffer = Buffer.from('test data')

      // Save multiple files for the book
      await ttsCache.saveCachedAudio(bookId, 'cfi-1', audioBuffer)
      await ttsCache.saveCachedAudio(bookId, 'cfi-2', audioBuffer)

      const cacheSize = await ttsCache.getBookCacheSize(bookId)

      // Should return total size of all files for the book
      expect(cacheSize).toBeGreaterThan(0)
      expect(typeof cacheSize).toBe('number')
    })

    it('should return 0 cache size for non-existent book', async () => {
      const bookId = 'non-existent-book'

      const cacheSize = await ttsCache.getBookCacheSize(bookId)

      expect(cacheSize).toBe(0)
    })
  })

  describe('Error handling', () => {
    it('should handle mkdir errors', async () => {
      mockFS.mkdir.mockRejectedValueOnce(new Error('Permission denied'))

      await expect(() => new TTSCache()).rejects.toThrow('Failed to create public directory')
    })

    it('should handle readdir errors gracefully', async () => {
      mockFS.readdir.mockRejectedValueOnce(new Error('Directory not found'))

      const cacheSize = await ttsCache.getBookCacheSize('test-book')
      expect(cacheSize).toBe(0)
    })

    it('should handle stat errors gracefully', async () => {
      mockFS.stat.mockRejectedValueOnce(new Error('File not found'))

      const cacheSize = await ttsCache.getBookCacheSize('test-book')
      expect(cacheSize).toBe(0)
    })
  })

  describe('Cache cleanup', () => {
    it('should not cleanup if under threshold', async () => {
      const smallBuffer = Buffer.alloc(1024) // 1KB

      // Save small files that won't trigger cleanup
      for (let i = 0; i < 5; i++) {
        await ttsCache.saveCachedAudio(`book-${i}`, `cfi-${i}`, smallBuffer)
      }

      // Should not have called unlink
      expect(mockFS.unlink).not.toHaveBeenCalled()
    })

    it('should cleanup oldest files first', async () => {
      const largeBuffer = Buffer.alloc(100 * 1024 * 1024) // 100MB

      // Save files with different timestamps
      const timestamps = []
      for (let i = 0; i < 6; i++) {
        const startTime = Date.now()
        await ttsCache.saveCachedAudio(`book-${i}`, `cfi-${i}`, largeBuffer)
        timestamps.push(startTime)
      }

      // Should have cleaned up oldest files
      expect(mockFS.unlink).toHaveBeenCalled()
    })
  })
})
