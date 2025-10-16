import path from 'path'
import fs from 'fs/promises'
import { app } from 'electron'
import md5 from 'md5'
import { PORT } from './PORT'

export interface CachedAudioInfo {
  filePath: string
  url: string
  exists: boolean
}

/**
 * TTS Cache Manager
 * Handles caching of generated audio files for text-to-speech functionality
 */
export class TTSCache {
  private cacheDir: string
  private readonly MAX_CACHE_SIZE_MB = 500 // 500MB limit
  private readonly CACHE_CLEANUP_THRESHOLD = 0.8 // Cleanup when 80% full

  constructor() {
    this.cacheDir = path.join(app.getPath('appData'), 'public', 'tts-cache')
    this.ensurePublicDir()
  }

  /**
   * Ensure the public directory exists for Express server
   */
  private async ensurePublicDir(): Promise<void> {
    const publicDir = path.join(app.getPath('appData'), 'public')
    try {
      await fs.mkdir(publicDir, { recursive: true })
      console.log('Public directory ensured at:', publicDir)
    } catch (error) {
      console.error('Failed to create public directory:', error)
      throw new Error(`Failed to create public directory: ${error}`)
    }
  }

  /**
   * Get the cache directory path for a specific book
   */
  private getBookCacheDir(bookId: string): string {
    return path.join(this.cacheDir, bookId)
  }

  /**
   * Get the file path for a cached audio file
   */
  private getAudioFilePath(bookId: string, cfiRange: string): string {
    const bookCacheDir = this.getBookCacheDir(bookId)
    const hashedCfi = md5(cfiRange)
    return path.join(bookCacheDir, `${hashedCfi}.mp3`)
  }

  /**
   * Get the HTTP URL for a cached audio file
   */
  private getAudioUrl(bookId: string, cfiRange: string): string {
    const hashedCfi = md5(cfiRange)
    return `http://localhost:${PORT}/tts-cache/${bookId}/${hashedCfi}.mp3`
  }

  /**
   * Check if audio is cached for a given CFI range
   */
  async getCachedAudio(bookId: string, cfiRange: string): Promise<CachedAudioInfo> {
    const filePath = this.getAudioFilePath(bookId, cfiRange)
    const url = this.getAudioUrl(bookId, cfiRange)

    try {
      await fs.access(filePath)
      return { filePath, url, exists: true }
    } catch {
      return { filePath, url, exists: false }
    }
  }

  /**
   * Save generated audio to cache
   */
  async saveCachedAudio(bookId: string, cfiRange: string, audioBuffer: Buffer): Promise<string> {
    try {
      const filePath = this.getAudioFilePath(bookId, cfiRange)
      const bookCacheDir = this.getBookCacheDir(bookId)
      const url = this.getAudioUrl(bookId, cfiRange)

      console.log('Saving TTS audio:')
      console.log('  Book ID:', bookId)
      console.log('  CFI Range:', cfiRange)
      console.log('  File Path:', filePath)
      console.log('  URL:', url)
      console.log('  Cache Dir:', this.cacheDir)

      // Ensure book cache directory exists
      await fs.mkdir(bookCacheDir, { recursive: true })

      // Check cache size before saving
      await this.checkAndCleanupCache()

      // Save audio buffer to file
      await fs.writeFile(filePath, new Uint8Array(audioBuffer))

      // Verify file was created
      const stats = await fs.stat(filePath)
      console.log('File created successfully:', {
        path: filePath,
        size: stats.size,
        url: url
      })

      return url
    } catch (error) {
      console.error('Failed to save cached audio:', error)
      throw new Error(`Failed to save cached audio: ${error}`)
    }
  }

  /**
   * Remove cached audio for a specific CFI range
   */
  async removeCachedAudio(bookId: string, cfiRange: string): Promise<void> {
    const filePath = this.getAudioFilePath(bookId, cfiRange)

    try {
      await fs.unlink(filePath)
    } catch (error) {
      // File doesn't exist or couldn't be deleted - ignore
      console.warn(`Could not remove cached audio: ${error}`)
    }
  }

  /**
   * Clear all cached audio for a book
   */
  async clearBookCache(bookId: string): Promise<void> {
    const bookCacheDir = this.getBookCacheDir(bookId)

    try {
      await fs.rm(bookCacheDir, { recursive: true, force: true })
    } catch (error) {
      console.warn(`Could not clear book cache: ${error}`)
    }
  }

  /**
   * Get cache size for a book (in bytes)
   */
  async getBookCacheSize(bookId: string): Promise<number> {
    const bookCacheDir = this.getBookCacheDir(bookId)

    try {
      const files = await fs.readdir(bookCacheDir)
      let totalSize = 0

      for (const file of files) {
        const filePath = path.join(bookCacheDir, file)
        const stats = await fs.stat(filePath)
        totalSize += stats.size
      }

      return totalSize
    } catch {
      return 0
    }
  }

  /**
   * Get total cache size (in bytes)
   */
  async getTotalCacheSize(): Promise<number> {
    try {
      let totalSize = 0
      const entries = await fs.readdir(this.cacheDir)

      for (const entry of entries) {
        const entryPath = path.join(this.cacheDir, entry)
        const stats = await fs.stat(entryPath)

        if (stats.isDirectory()) {
          totalSize += await this.getBookCacheSize(entry)
        }
      }

      return totalSize
    } catch {
      return 0
    }
  }

  /**
   * Check cache size and cleanup if necessary
   */
  private async checkAndCleanupCache(): Promise<void> {
    try {
      const totalSizeBytes = await this.getTotalCacheSize()
      const totalSizeMB = totalSizeBytes / (1024 * 1024)

      if (totalSizeMB > this.MAX_CACHE_SIZE_MB * this.CACHE_CLEANUP_THRESHOLD) {
        console.log(`Cache size (${totalSizeMB.toFixed(2)}MB) exceeds threshold, cleaning up...`)
        await this.cleanupOldestFiles()
      }
    } catch (error) {
      console.error('Failed to check cache size:', error)
    }
  }

  /**
   * Clean up oldest files to free space
   */
  private async cleanupOldestFiles(): Promise<void> {
    try {
      const entries = await fs.readdir(this.cacheDir)
      const fileStats: Array<{ path: string; mtime: Date }> = []

      // Collect all files with their modification times
      for (const entry of entries) {
        const entryPath = path.join(this.cacheDir, entry)
        const stats = await fs.stat(entryPath)

        if (stats.isDirectory()) {
          const bookFiles = await fs.readdir(entryPath)
          for (const file of bookFiles) {
            const filePath = path.join(entryPath, file)
            const fileStats_info = await fs.stat(filePath)
            fileStats.push({ path: filePath, mtime: fileStats_info.mtime })
          }
        }
      }

      // Sort by modification time (oldest first)
      fileStats.sort((a, b) => a.mtime.getTime() - b.mtime.getTime())

      // Remove oldest files until we're under the threshold
      const targetSizeBytes = this.MAX_CACHE_SIZE_MB * this.CACHE_CLEANUP_THRESHOLD * 1024 * 1024
      let currentSize = await this.getTotalCacheSize()

      for (const fileStat of fileStats) {
        if (currentSize <= targetSizeBytes) break

        try {
          const fileSize = (await fs.stat(fileStat.path)).size
          await fs.unlink(fileStat.path)
          currentSize -= fileSize
          console.log(`Removed old cache file: ${fileStat.path}`)
        } catch (error) {
          console.warn(`Failed to remove cache file ${fileStat.path}:`, error)
        }
      }
    } catch (error) {
      console.error('Failed to cleanup cache files:', error)
    }
  }
}

// Export singleton instance
export const ttsCache = new TTSCache()
