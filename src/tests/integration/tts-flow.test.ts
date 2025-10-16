import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'
import { setupTestEnvironment, createTestParagraphs, simulateAudioEvent } from '../utils/test-helpers'
import { useTTS } from '../../renderer/src/hooks/useTTS'
import { useTTSStore } from '../../renderer/src/stores/ttsStore'

// Mock all dependencies
vi.mock('../../renderer/src/stores/ttsStore', () => ({
  useTTSStore: vi.fn()
}))

vi.mock('../../renderer/src/hooks/useTTSQueries', () => ({
  useTTSApiKeyStatus: vi.fn().mockReturnValue({ data: true }),
  useTTSQueueStatus: vi.fn().mockReturnValue({ data: { pending: 0, isProcessing: false, active: 0 } }),
  useRequestTTSAudio: vi.fn().mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue('http://localhost:3000/audio.mp3')
  })
}))

// Mock window.functions for integration
const mockWindowFunctions = {
  getTTSAudioPath: vi.fn(),
  onTTSAudioReady: vi.fn(),
  removeTTSAudioReadyListener: vi.fn()
}

// Test wrapper
const createTestWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  })

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}

describe('TTS Integration Tests', () => {
  let mockStoreState: any
  let mockStoreActions: any
  let mockAudioElement: HTMLAudioElement
  let mockRendition: any

  beforeEach(() => {
    setupTestEnvironment()

    // Setup mock store
    mockStoreState = {
      isPlaying: false,
      isPaused: false,
      isLoading: false,
      hasApiKey: true,
      currentParagraphIndex: 0,
      paragraphs: [],
      audioCache: new Map(),
      error: null
    }

    mockStoreActions = {
      setPlaying: vi.fn(),
      setPaused: vi.fn(),
      setLoading: vi.fn(),
      setHasApiKey: vi.fn(),
      setError: vi.fn(),
      setCurrentParagraphIndex: vi.fn(),
      setParagraphs: vi.fn(),
      setCurrentBookId: vi.fn(),
      setCurrentPage: vi.fn(),
      addToAudioCache: vi.fn()
    }

    vi.mocked(useTTSStore).mockImplementation((selector) => {
      const state = { ...mockStoreState, ...mockStoreActions }
      return typeof selector === 'function' ? selector(state) : state
    })

    // Setup mock audio element
    mockAudioElement = new Audio()
    vi.spyOn(window, 'Audio').mockImplementation(() => mockAudioElement)

    // Setup mock rendition
    mockRendition = {
      highlightRange: vi.fn(),
      removeHighlight: vi.fn(),
      location: { start: { cfi: 'epubcfi(/6/4[chapter01]/2/1:0)' } },
      prev: vi.fn(),
      next: vi.fn()
    }

    // Setup window functions
    Object.assign(window, { functions: mockWindowFunctions })

    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Complete playback flow', () => {
    it('should complete full playback flow from start to finish', async () => {
      const paragraphs = createTestParagraphs(3)
      mockStoreState.paragraphs = paragraphs

      const mockOnNavigateToNextPage = vi.fn()

      const { result } = renderHook(
        () => useTTS({
          bookId: 'test-book',
          rendition: mockRendition,
          onNavigateToPreviousPage: vi.fn(),
          onNavigateToNextPage: mockOnNavigateToNextPage
        }),
        { wrapper: createTestWrapper() }
      )

      // Start playback
      await act(async () => {
        await result.current.play()
      })

      // Verify initial state
      expect(mockStoreActions.setPlaying).toHaveBeenCalledWith(true)
      expect(mockStoreActions.setLoading).toHaveBeenCalledWith(true)
      expect(mockRendition.highlightRange).toHaveBeenCalledWith(paragraphs[0].cfiRange)

      // Simulate audio ready and start playing
      act(() => {
        mockStoreActions.setLoading.mockImplementation((loading: boolean) => {
          mockStoreState.isLoading = loading
        })
        mockStoreActions.setLoading(false)
      })

      // Move to next paragraph
      await act(async () => {
        await result.current.next()
      })

      expect(mockStoreActions.setCurrentParagraphIndex).toHaveBeenCalledWith(1)
      expect(mockRendition.highlightRange).toHaveBeenCalledWith(paragraphs[1].cfiRange)

      // Move to last paragraph
      await act(async () => {
        await result.current.next()
      })

      expect(mockStoreActions.setCurrentParagraphIndex).toHaveBeenCalledWith(2)

      // Move beyond last paragraph (should navigate to next page)
      await act(async () => {
        await result.current.next()
      })

      expect(mockOnNavigateToNextPage).toHaveBeenCalled()
    })

    it('should handle page navigation during playback', async () => {
      const paragraphs = createTestParagraphs(2)
      mockStoreState.paragraphs = paragraphs
      mockStoreState.isPlaying = true
      mockStoreState.currentParagraphIndex = 1

      const { result } = renderHook(
        () => useTTS({
          bookId: 'test-book',
          rendition: mockRendition,
          onNavigateToPreviousPage: vi.fn(),
          onNavigateToNextPage: vi.fn()
        }),
        { wrapper: createTestWrapper() }
      )

      // Simulate page change
      const newParagraphs = createTestParagraphs(3)
      mockStoreState.paragraphs = newParagraphs

      // Set new paragraphs (simulating page change)
      await act(async () => {
        result.current.setParagraphs(newParagraphs)
      })

      expect(mockStoreActions.setParagraphs).toHaveBeenCalledWith(newParagraphs)
      expect(mockStoreActions.setCurrentParagraphIndex).toHaveBeenCalledWith(0)

      // Should prefetch new paragraphs
      const { useRequestTTSAudio } = await import('../../renderer/src/hooks/useTTSQueries')
      expect(useRequestTTSAudio().mutateAsync).toHaveBeenCalled()
    })

    it('should recover from errors and continue', async () => {
      const paragraphs = createTestParagraphs(2)
      mockStoreState.paragraphs = paragraphs

      // Mock initial error
      const { useRequestTTSAudio } = await import('../../renderer/src/hooks/useTTSQueries')
      useRequestTTSAudio().mutateAsync
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce('http://localhost:3000/audio.mp3')

      const { result } = renderHook(
        () => useTTS({
          bookId: 'test-book',
          rendition: mockRendition,
          onNavigateToPreviousPage: vi.fn(),
          onNavigateToNextPage: vi.fn()
        }),
        { wrapper: createTestWrapper() }
      )

      // First attempt should fail
      await act(async () => {
        await result.current.play()
      })

      expect(mockStoreActions.setError).toHaveBeenCalledWith(
        expect.stringContaining('Network error')
      )
      expect(mockStoreActions.setPlaying).toHaveBeenCalledWith(false)

      // Clear error and retry
      mockStoreActions.setError.mockImplementation((error: string | null) => {
        mockStoreState.error = error
      })
      mockStoreActions.setError(null)

      // Second attempt should succeed
      await act(async () => {
        await result.current.play()
      })

      expect(mockAudioElement.src).toBe('http://localhost:3000/audio.mp3')
      expect(mockAudioElement.play).toHaveBeenCalled()
    })

    it('should respect cache across sessions', async () => {
      const paragraphs = createTestParagraphs(1)
      const cachedUrl = 'http://localhost:3000/cached-audio.mp3'
      
      // Simulate cached audio
      mockStoreState.paragraphs = paragraphs
      mockStoreState.audioCache = new Map([[paragraphs[0].cfiRange, cachedUrl]])
      mockWindowFunctions.getTTSAudioPath.mockResolvedValueOnce(cachedUrl)

      const { result } = renderHook(
        () => useTTS({
          bookId: 'test-book',
          rendition: mockRendition,
          onNavigateToPreviousPage: vi.fn(),
          onNavigateToNextPage: vi.fn()
        }),
        { wrapper: createTestWrapper() }
      )

      await act(async () => {
        await result.current.play()
      })

      // Should use cached audio without requesting new
      const { useRequestTTSAudio } = await import('../../renderer/src/hooks/useTTSQueries')
      expect(useRequestTTSAudio().mutateAsync).not.toHaveBeenCalled()
      expect(mockAudioElement.src).toBe(cachedUrl)
    })
  })

  describe('Complex scenarios', () => {
    it('should handle rapid navigation during playback', async () => {
      const paragraphs = createTestParagraphs(5)
      mockStoreState.paragraphs = paragraphs
      mockStoreState.isPlaying = true

      const { result } = renderHook(
        () => useTTS({
          bookId: 'test-book',
          rendition: mockRendition,
          onNavigateToPreviousPage: vi.fn(),
          onNavigateToNextPage: vi.fn()
        }),
        { wrapper: createTestWrapper() }
      )

      // Rapid navigation
      await act(async () => {
        await result.current.next()
        await result.current.next()
        await result.current.prev()
        await result.current.next()
      })

      expect(mockStoreActions.setCurrentParagraphIndex).toHaveBeenCalledTimes(4)
      expect(mockRendition.highlightRange).toHaveBeenCalled()
      expect(mockRendition.removeHighlight).toHaveBeenCalled()
    })

    it('should handle audio element errors gracefully', async () => {
      const paragraphs = createTestParagraphs(1)
      mockStoreState.paragraphs = paragraphs

      const { result } = renderHook(
        () => useTTS({
          bookId: 'test-book',
          rendition: mockRendition,
          onNavigateToPreviousPage: vi.fn(),
          onNavigateToNextPage: vi.fn()
        }),
        { wrapper: createTestWrapper() }
      )

      await act(async () => {
        await result.current.play()
      })

      // Simulate audio error
      const errorHandler = mockAudioElement.addEventListener.mock.calls.find(
        call => call[0] === 'error'
      )?.[1]

      act(() => {
        errorHandler!({} as Event)
      })

      expect(mockStoreActions.setError).toHaveBeenCalledWith('Audio playback failed')
      expect(mockStoreActions.setPlaying).toHaveBeenCalledWith(false)
      expect(mockStoreActions.setLoading).toHaveBeenCalledWith(false)
    })

    it('should handle book switching during playback', async () => {
      const paragraphs1 = createTestParagraphs(2)
      const paragraphs2 = createTestParagraphs(3)
      
      mockStoreState.paragraphs = paragraphs1
      mockStoreState.currentBookId = 'book1'
      mockStoreState.isPlaying = true

      const { result } = renderHook(
        () => useTTS({
          bookId: 'book2', // Different book ID
          rendition: mockRendition,
          onNavigateToPreviousPage: vi.fn(),
          onNavigateToNextPage: vi.fn()
        }),
        { wrapper: createTestWrapper() }
      )

      // Switch books (simulated by setting new paragraphs)
      await act(async () => {
        result.current.setParagraphs(paragraphs2)
      })

      // Should reset state for new book
      expect(mockStoreActions.setParagraphs).toHaveBeenCalledWith(paragraphs2)
      expect(mockStoreActions.setCurrentParagraphIndex).toHaveBeenCalledWith(0)
    })

    it('should handle concurrent audio requests', async () => {
      const paragraphs = createTestParagraphs(3)
      mockStoreState.paragraphs = paragraphs

      const { result } = renderHook(
        () => useTTS({
          bookId: 'test-book',
          rendition: mockRendition,
          onNavigateToPreviousPage: vi.fn(),
          onNavigateToNextPage: vi.fn()
        }),
        { wrapper: createTestWrapper() }
      )

      // Start multiple concurrent requests
      const playPromise = result.current.play()
      const nextPromise = result.current.next()

      await act(async () => {
        await Promise.all([playPromise, nextPromise])
      })

      // Should handle both requests without conflicts
      expect(mockStoreActions.setPlaying).toHaveBeenCalled()
      expect(mockStoreActions.setCurrentParagraphIndex).toHaveBeenCalled()
    })

    it('should handle prefetch failures gracefully', async () => {
      const paragraphs = createTestParagraphs(5)
      mockStoreState.paragraphs = paragraphs

      // Mock prefetch failures
      const { useRequestTTSAudio } = await import('../../renderer/src/hooks/useTTSQueries')
      useRequestTTSAudio().mutateAsync
        .mockResolvedValueOnce('http://localhost:3000/audio.mp3') // Main request succeeds
        .mockRejectedValue(new Error('Prefetch failed')) // Prefetch requests fail

      const { result } = renderHook(
        () => useTTS({
          bookId: 'test-book',
          rendition: mockRendition,
          onNavigateToPreviousPage: vi.fn(),
          onNavigateToNextPage: vi.fn()
        }),
        { wrapper: createTestWrapper() }
      )

      // Should not fail even if prefetch fails
      await act(async () => {
        await result.current.play()
      })

      expect(mockAudioElement.src).toBe('http://localhost:3000/audio.mp3')
      expect(mockAudioElement.play).toHaveBeenCalled()
    })
  })

  describe('State consistency', () => {
    it('should maintain consistent state during complex operations', async () => {
      const paragraphs = createTestParagraphs(3)
      mockStoreState.paragraphs = paragraphs

      const { result } = renderHook(
        () => useTTS({
          bookId: 'test-book',
          rendition: mockRendition,
          onNavigateToPreviousPage: vi.fn(),
          onNavigateToNextPage: vi.fn()
        }),
        { wrapper: createTestWrapper() }
      )

      // Complex sequence: play -> pause -> resume -> next -> pause -> stop
      await act(async () => {
        await result.current.play()
      })

      await act(async () => {
        result.current.pause()
      })

      await act(async () => {
        result.current.resume()
      })

      await act(async () => {
        await result.current.next()
      })

      await act(async () => {
        result.current.pause()
      })

      await act(async () => {
        result.current.stop()
      })

      // Verify final state
      expect(mockStoreActions.setPlaying).toHaveBeenCalledWith(false)
      expect(mockStoreActions.setPaused).toHaveBeenCalledWith(false)
      expect(mockStoreActions.setLoading).toHaveBeenCalledWith(false)
      expect(mockStoreActions.setError).toHaveBeenCalledWith(null)
    })

    it('should handle audio ended event correctly', async () => {
      const paragraphs = createTestParagraphs(2)
      mockStoreState.paragraphs = paragraphs
      mockStoreState.currentParagraphIndex = 0
      mockStoreState.isPlaying = true

      const { result } = renderHook(
        () => useTTS({
          bookId: 'test-book',
          rendition: mockRendition,
          onNavigateToPreviousPage: vi.fn(),
          onNavigateToNextPage: vi.fn()
        }),
        { wrapper: createTestWrapper() }
      )

      // Get the ended event handler
      const endedHandler = mockAudioElement.addEventListener.mock.calls.find(
        call => call[0] === 'ended'
      )?.[1]

      // Simulate audio ended
      act(() => {
        endedHandler!()
      })

      expect(mockStoreActions.setPlaying).toHaveBeenCalledWith(false)
      expect(mockStoreActions.setPaused).toHaveBeenCalledWith(false)
    })
  })
})
