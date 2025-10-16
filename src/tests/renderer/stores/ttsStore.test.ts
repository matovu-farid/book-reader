import { describe, it, expect, beforeEach } from 'vitest'
import { createTestParagraphs } from '../../utils/test-helpers'
import { useTTSStore } from '../../../renderer/src/stores/ttsStore'

describe('TTSStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useTTSStore.getState().reset()
  })

  describe('State management', () => {
    it('should initialize with default state', () => {
      const state = useTTSStore.getState()

      expect(state.isPlaying).toBe(false)
      expect(state.isPaused).toBe(false)
      expect(state.isLoading).toBe(false)
      expect(state.hasApiKey).toBe(false)
      expect(state.currentParagraphIndex).toBe(0)
      expect(state.paragraphs).toEqual([])
      expect(state.currentBookId).toBe('')
      expect(state.currentPage).toBe('')
      expect(state.audioCache.size).toBe(0)
      expect(state.error).toBeNull()
    })

    it('should update playback states correctly', () => {
      const { setPlaying, setPaused, setLoading, setHasApiKey, setError } = useTTSStore.getState()

      setPlaying(true)
      expect(useTTSStore.getState().isPlaying).toBe(true)

      setPaused(true)
      expect(useTTSStore.getState().isPaused).toBe(true)

      setLoading(true)
      expect(useTTSStore.getState().isLoading).toBe(true)

      setHasApiKey(true)
      expect(useTTSStore.getState().hasApiKey).toBe(true)

      setError('Test error')
      expect(useTTSStore.getState().error).toBe('Test error')

      setError(null)
      expect(useTTSStore.getState().error).toBeNull()
    })

    it('should validate paragraph index bounds', () => {
      const { setParagraphs, setCurrentParagraphIndex } = useTTSStore.getState()
      const paragraphs = createTestParagraphs(5)

      setParagraphs(paragraphs)

      // Valid index
      setCurrentParagraphIndex(3)
      expect(useTTSStore.getState().currentParagraphIndex).toBe(3)

      // Invalid negative index
      setCurrentParagraphIndex(-1)
      expect(useTTSStore.getState().currentParagraphIndex).toBe(3) // Should remain unchanged

      // Invalid index beyond bounds
      setCurrentParagraphIndex(10)
      expect(useTTSStore.getState().currentParagraphIndex).toBe(3) // Should remain unchanged

      // Valid boundary indices
      setCurrentParagraphIndex(0)
      expect(useTTSStore.getState().currentParagraphIndex).toBe(0)

      setCurrentParagraphIndex(4)
      expect(useTTSStore.getState().currentParagraphIndex).toBe(4)
    })

    it('should clear cache when switching books', () => {
      const { setCurrentBookId, addToAudioCache } = useTTSStore.getState()

      // Add some cache entries
      addToAudioCache('cfi1', 'audio1.mp3')
      addToAudioCache('cfi2', 'audio2.mp3')

      expect(useTTSStore.getState().audioCache.size).toBe(2)

      // Switch to different book
      setCurrentBookId('new-book')
      const state = useTTSStore.getState()

      expect(state.currentBookId).toBe('new-book')
      expect(state.audioCache.size).toBe(0)
      expect(state.currentParagraphIndex).toBe(0)
      expect(state.isPlaying).toBe(false)
      expect(state.isPaused).toBe(false)
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
    })

    it('should not clear cache when setting same book ID', () => {
      const { setCurrentBookId, addToAudioCache } = useTTSStore.getState()

      // Set initial book
      setCurrentBookId('book1')
      addToAudioCache('cfi1', 'audio1.mp3')

      expect(useTTSStore.getState().audioCache.size).toBe(1)

      // Set same book ID again
      setCurrentBookId('book1')

      expect(useTTSStore.getState().audioCache.size).toBe(1)
      expect(useTTSStore.getState().currentBookId).toBe('book1')
    })
  })

  describe('Cache operations', () => {
    it('should add items to audio cache', () => {
      const { addToAudioCache } = useTTSStore.getState()

      addToAudioCache('cfi1', 'audio1.mp3')
      addToAudioCache('cfi2', 'audio2.mp3')

      const state = useTTSStore.getState()
      expect(state.audioCache.size).toBe(2)
      expect(state.audioCache.get('cfi1')).toBe('audio1.mp3')
      expect(state.audioCache.get('cfi2')).toBe('audio2.mp3')
    })

    it('should remove items from audio cache', () => {
      const { addToAudioCache, removeFromAudioCache } = useTTSStore.getState()

      addToAudioCache('cfi1', 'audio1.mp3')
      addToAudioCache('cfi2', 'audio2.mp3')

      expect(useTTSStore.getState().audioCache.size).toBe(2)

      removeFromAudioCache('cfi1')

      const state = useTTSStore.getState()
      expect(state.audioCache.size).toBe(1)
      expect(state.audioCache.has('cfi1')).toBe(false)
      expect(state.audioCache.has('cfi2')).toBe(true)
    })

    it('should handle removing non-existent cache entries', () => {
      const { removeFromAudioCache } = useTTSStore.getState()

      // Should not throw error
      expect(() => removeFromAudioCache('non-existent')).not.toThrow()
      expect(useTTSStore.getState().audioCache.size).toBe(0)
    })
  })

  describe('Paragraph management', () => {
    it('should set paragraphs and reset state', () => {
      const { setParagraphs, setPlaying, setPaused, setLoading, setError } = useTTSStore.getState()
      const paragraphs = createTestParagraphs(3)

      // Set some state first
      setPlaying(true)
      setPaused(true)
      setLoading(true)
      setError('Some error')

      // Set new paragraphs
      setParagraphs(paragraphs)

      const state = useTTSStore.getState()
      expect(state.paragraphs).toEqual(paragraphs)
      expect(state.currentParagraphIndex).toBe(0)
      expect(state.isPlaying).toBe(false)
      expect(state.isPaused).toBe(false)
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
    })

    it('should handle empty paragraphs array', () => {
      const { setParagraphs } = useTTSStore.getState()

      setParagraphs([])

      const state = useTTSStore.getState()
      expect(state.paragraphs).toEqual([])
      expect(state.currentParagraphIndex).toBe(0)
    })
  })

  describe('Page management', () => {
    it('should set current page', () => {
      const { setCurrentPage } = useTTSStore.getState()

      setCurrentPage('epubcfi(/6/4[chapter01]/2/1:0)')

      expect(useTTSStore.getState().currentPage).toBe('epubcfi(/6/4[chapter01]/2/1:0)')
    })

    it('should not update page if same value', () => {
      const { setCurrentPage } = useTTSStore.getState()

      setCurrentPage('epubcfi(/6/4[chapter01]/2/1:0)')
      const firstCall = useTTSStore.getState().currentPage

      setCurrentPage('epubcfi(/6/4[chapter01]/2/1:0)')
      const secondCall = useTTSStore.getState().currentPage

      expect(firstCall).toBe(secondCall)
    })
  })

  describe('Reset functionality', () => {
    it('should reset all state correctly', () => {
      const {
        setPlaying,
        setPaused,
        setLoading,
        setCurrentParagraphIndex,
        setParagraphs,
        setCurrentBookId,
        setCurrentPage,
        addToAudioCache,
        setError,
        reset
      } = useTTSStore.getState()

      // Set various states
      setPlaying(true)
      setPaused(true)
      setLoading(true)
      setCurrentParagraphIndex(5)
      setParagraphs(createTestParagraphs(3))
      setCurrentBookId('test-book')
      setCurrentPage('test-page')
      addToAudioCache('cfi1', 'audio1.mp3')
      setError('test error')

      // Reset
      reset()

      const state = useTTSStore.getState()
      expect(state.isPlaying).toBe(false)
      expect(state.isPaused).toBe(false)
      expect(state.isLoading).toBe(false)
      expect(state.currentParagraphIndex).toBe(0)
      expect(state.currentBookId).toBe('')
      expect(state.currentPage).toBe('')
      expect(state.audioCache.size).toBe(0)
      expect(state.error).toBeNull()
      // paragraphs should remain as they were set
      expect(state.paragraphs.length).toBe(3)
    })
  })

  describe('Error handling', () => {
    it('should handle error state correctly', () => {
      const { setError } = useTTSStore.getState()

      // Set error
      setError('Network error')
      expect(useTTSStore.getState().error).toBe('Network error')

      // Clear error
      setError(null)
      expect(useTTSStore.getState().error).toBeNull()

      // Set another error
      setError('API error')
      expect(useTTSStore.getState().error).toBe('API error')
    })
  })

  describe('State immutability', () => {
    it('should not mutate original state objects', () => {
      const { setParagraphs } = useTTSStore.getState()
      const originalParagraphs = createTestParagraphs(2)

      setParagraphs(originalParagraphs)

      // Modifying original array should not affect store
      originalParagraphs.push(createTestParagraphs(1)[0])

      expect(useTTSStore.getState().paragraphs.length).toBe(2)
      expect(originalParagraphs.length).toBe(3)
    })

    it('should create new cache instances', () => {
      const { addToAudioCache } = useTTSStore.getState()

      addToAudioCache('cfi1', 'audio1.mp3')
      const firstCache = useTTSStore.getState().audioCache

      addToAudioCache('cfi2', 'audio2.mp3')
      const secondCache = useTTSStore.getState().audioCache

      // Should be different instances
      expect(firstCache).not.toBe(secondCache)
      expect(firstCache.size).toBe(1)
      expect(secondCache.size).toBe(2)
    })
  })
})
