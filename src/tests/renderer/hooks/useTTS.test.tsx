import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React, { ReactNode } from 'react'
import { setupTestEnvironment, createTestParagraphs, simulateAudioEvent } from '../../utils/test-helpers'
import { useTTS } from '../../../renderer/src/hooks/useTTS'
import { useTTSStore } from '../../../renderer/src/stores/ttsStore'

// Mock the store
vi.mock('../../../renderer/src/stores/ttsStore', () => ({
  useTTSStore: vi.fn()
}))

// Mock React Query hooks
vi.mock('../../../renderer/src/hooks/useTTSQueries', () => ({
  useTTSApiKeyStatus: vi.fn().mockReturnValue({ data: true }),
  useTTSQueueStatus: vi.fn().mockReturnValue({ data: { pending: 0, isProcessing: false, active: 0 } }),
  useRequestTTSAudio: vi.fn().mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue('http://localhost:3000/audio.mp3')
  })
}))

// Mock new custom hooks
vi.mock('../../../renderer/src/hooks/useAudioPlayer', () => ({
  useAudioPlayer: vi.fn().mockReturnValue({
    state: {
      isPlaying: false,
      isPaused: false,
      isStopped: true,
      currentTime: 0,
      duration: 0,
      error: null
    },
    controls: {
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      stop: vi.fn(),
      setCurrentTime: vi.fn(),
      setVolume: vi.fn()
    },
    audioElement: null
  })
}))

vi.mock('../../../renderer/src/hooks/useTTSEventSubscription', () => ({
  useTTSBookEventSubscription: vi.fn().mockReturnValue({
    latestEvent: null,
    isListening: true,
    error: null,
    getLatestEvent: vi.fn().mockReturnValue(null),
    clearLatestEvent: vi.fn()
  })
}))

// Mock window.functions
const mockWindowFunctions = {
  getTTSAudioPath: vi.fn(),
  onTTSAudioReady: vi.fn(),
  removeTTSAudioReadyListener: vi.fn()
}

// Test wrapper with QueryClient
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

describe('useTTS', () => {
  let mockStoreState: any
  let mockStoreActions: any
  let mockAudioElement: HTMLAudioElement

  beforeEach(() => {
    setupTestEnvironment()

    // Mock store state and actions
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

    // Mock Audio element
    mockAudioElement = new Audio()
    vi.spyOn(window, 'Audio').mockImplementation(() => mockAudioElement)

    // Mock window.functions
    Object.assign(window, { functions: mockWindowFunctions })

    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Playback controls', () => {
    it('should play audio when play is called', async () => {
      const paragraphs = createTestParagraphs(2)
      mockStoreState.paragraphs = paragraphs

      const { result } = renderHook(
        () => useTTS({
          bookId: 'test-book',
          rendition: null,
          onNavigateToPreviousPage: vi.fn(),
          onNavigateToNextPage: vi.fn()
        }),
        { wrapper: createTestWrapper() }
      )

      await act(async () => {
        await result.current.play()
      })

      expect(mockStoreActions.setPlaying).toHaveBeenCalledWith(true)
      expect(mockStoreActions.setPaused).toHaveBeenCalledWith(false)
      expect(mockStoreActions.setLoading).toHaveBeenCalledWith(true)
      expect(mockStoreActions.setError).toHaveBeenCalledWith(null)
      expect(mockAudioElement.src).toBe('http://localhost:3000/audio.mp3')
      expect(mockAudioElement.play).toHaveBeenCalled()
    })

    it('should pause audio correctly', async () => {
      const { result } = renderHook(
        () => useTTS({
          bookId: 'test-book',
          rendition: null,
          onNavigateToPreviousPage: vi.fn(),
          onNavigateToNextPage: vi.fn()
        }),
        { wrapper: createTestWrapper() }
      )

      // Set audio as not paused (playing)
      Object.defineProperty(mockAudioElement, 'paused', { value: false })

      await act(async () => {
        result.current.pause()
      })

      expect(mockAudioElement.pause).toHaveBeenCalled()
      expect(mockStoreActions.setPaused).toHaveBeenCalledWith(true)
    })

    it('should resume paused audio', async () => {
      const { result } = renderHook(
        () => useTTS({
          bookId: 'test-book',
          rendition: null,
          onNavigateToPreviousPage: vi.fn(),
          onNavigateToNextPage: vi.fn()
        }),
        { wrapper: createTestWrapper() }
      )

      // Set audio as paused
      Object.defineProperty(mockAudioElement, 'paused', { value: true })

      await act(async () => {
        result.current.resume()
      })

      expect(mockAudioElement.play).toHaveBeenCalled()
      expect(mockStoreActions.setPaused).toHaveBeenCalledWith(false)
    })

    it('should stop and reset audio', async () => {
      const paragraphs = createTestParagraphs(2)
      mockStoreState.paragraphs = paragraphs
      mockStoreState.currentParagraphIndex = 1

      const mockRendition = {
        removeHighlight: vi.fn()
      }

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
        result.current.stop()
      })

      expect(mockAudioElement.pause).toHaveBeenCalled()
      expect(mockAudioElement.currentTime).toBe(0)
      expect(mockRendition.removeHighlight).toHaveBeenCalledWith(paragraphs[1].cfiRange)
      expect(mockStoreActions.setPlaying).toHaveBeenCalledWith(false)
      expect(mockStoreActions.setPaused).toHaveBeenCalledWith(false)
      expect(mockStoreActions.setLoading).toHaveBeenCalledWith(false)
      expect(mockStoreActions.setError).toHaveBeenCalledWith(null)
    })
  })

  describe('Navigation', () => {
    it('should advance to next paragraph', async () => {
      const paragraphs = createTestParagraphs(3)
      mockStoreState.paragraphs = paragraphs
      mockStoreState.currentParagraphIndex = 1
      mockStoreState.isPlaying = true

      const mockRendition = {
        removeHighlight: vi.fn(),
        highlightRange: vi.fn()
      }

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
        await result.current.next()
      })

      expect(mockRendition.removeHighlight).toHaveBeenCalledWith(paragraphs[1].cfiRange)
      expect(mockStoreActions.setCurrentParagraphIndex).toHaveBeenCalledWith(2)
      expect(mockRendition.highlightRange).toHaveBeenCalledWith(paragraphs[2].cfiRange)
    })

    it('should go to previous paragraph', async () => {
      const paragraphs = createTestParagraphs(3)
      mockStoreState.paragraphs = paragraphs
      mockStoreState.currentParagraphIndex = 2
      mockStoreState.isPlaying = true

      const mockRendition = {
        removeHighlight: vi.fn(),
        highlightRange: vi.fn()
      }

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
        await result.current.prev()
      })

      expect(mockRendition.removeHighlight).toHaveBeenCalledWith(paragraphs[2].cfiRange)
      expect(mockStoreActions.setCurrentParagraphIndex).toHaveBeenCalledWith(1)
      expect(mockRendition.highlightRange).toHaveBeenCalledWith(paragraphs[1].cfiRange)
    })

    it('should navigate to next page at end', async () => {
      const paragraphs = createTestParagraphs(2)
      mockStoreState.paragraphs = paragraphs
      mockStoreState.currentParagraphIndex = 1

      const mockOnNavigateToNextPage = vi.fn()

      const { result } = renderHook(
        () => useTTS({
          bookId: 'test-book',
          rendition: null,
          onNavigateToPreviousPage: vi.fn(),
          onNavigateToNextPage: mockOnNavigateToNextPage
        }),
        { wrapper: createTestWrapper() }
      )

      await act(async () => {
        await result.current.next()
      })

      expect(mockOnNavigateToNextPage).toHaveBeenCalled()
      expect(mockStoreActions.setCurrentParagraphIndex).toHaveBeenCalledWith(0)
    })

    it('should navigate to previous page at start', async () => {
      const paragraphs = createTestParagraphs(2)
      mockStoreState.paragraphs = paragraphs
      mockStoreState.currentParagraphIndex = 0

      const mockOnNavigateToPreviousPage = vi.fn()

      const { result } = renderHook(
        () => useTTS({
          bookId: 'test-book',
          rendition: null,
          onNavigateToPreviousPage: mockOnNavigateToPreviousPage,
          onNavigateToNextPage: vi.fn()
        }),
        { wrapper: createTestWrapper() }
      )

      await act(async () => {
        await result.current.prev()
      })

      expect(mockOnNavigateToPreviousPage).toHaveBeenCalled()
    })
  })

  describe('Audio request flow', () => {
    it('should check cache before requesting', async () => {
      const paragraphs = createTestParagraphs(1)
      mockStoreState.paragraphs = paragraphs
      mockStoreState.audioCache = new Map([['epubcfi(/6/4[chapter01]/2/0:0)', 'cached-audio.mp3']])

      const { result } = renderHook(
        () => useTTS({
          bookId: 'test-book',
          rendition: null,
          onNavigateToPreviousPage: vi.fn(),
          onNavigateToNextPage: vi.fn()
        }),
        { wrapper: createTestWrapper() }
      )

      await act(async () => {
        await result.current.play()
      })

      // Should not call mutateAsync since audio is cached
      const { useRequestTTSAudio } = await import('../../../renderer/src/hooks/useTTSQueries')
      expect(useRequestTTSAudio().mutateAsync).not.toHaveBeenCalled()
    })

    it('should handle request errors', async () => {
      const paragraphs = createTestParagraphs(1)
      mockStoreState.paragraphs = paragraphs

      const { useRequestTTSAudio } = await import('../../../renderer/src/hooks/useTTSQueries')
      useRequestTTSAudio().mutateAsync.mockRejectedValueOnce(new Error('Request failed'))

      const { result } = renderHook(
        () => useTTS({
          bookId: 'test-book',
          rendition: null,
          onNavigateToPreviousPage: vi.fn(),
          onNavigateToNextPage: vi.fn()
        }),
        { wrapper: createTestWrapper() }
      )

      await act(async () => {
        await result.current.play()
      })

      expect(mockStoreActions.setError).toHaveBeenCalledWith(
        expect.stringContaining('Request failed')
      )
      expect(mockStoreActions.setPlaying).toHaveBeenCalledWith(false)
      expect(mockStoreActions.setLoading).toHaveBeenCalledWith(false)
    })

    it('should prefetch upcoming paragraphs', async () => {
      const paragraphs = createTestParagraphs(5)
      mockStoreState.paragraphs = paragraphs
      mockStoreState.currentParagraphIndex = 1

      const { result } = renderHook(
        () => useTTS({
          bookId: 'test-book',
          rendition: null,
          onNavigateToPreviousPage: vi.fn(),
          onNavigateToNextPage: vi.fn()
        }),
        { wrapper: createTestWrapper() }
      )

      await act(async () => {
        await result.current.play()
      })

      // Should prefetch next 3 paragraphs (indices 2, 3, 4)
      const { useRequestTTSAudio } = await import('../../../renderer/src/hooks/useTTSQueries')
      expect(useRequestTTSAudio().mutateAsync).toHaveBeenCalledTimes(4) // 1 for play + 3 for prefetch
    })
  })

  describe('Event handling', () => {
    it('should setup audio event listeners', () => {
      renderHook(
        () => useTTS({
          bookId: 'test-book',
          rendition: null,
          onNavigateToPreviousPage: vi.fn(),
          onNavigateToNextPage: vi.fn()
        }),
        { wrapper: createTestWrapper() }
      )

      expect(mockAudioElement.addEventListener).toHaveBeenCalledWith('ended', expect.any(Function))
      expect(mockAudioElement.addEventListener).toHaveBeenCalledWith('error', expect.any(Function))
    })

    it('should cleanup event listeners on unmount', () => {
      const { unmount } = renderHook(
        () => useTTS({
          bookId: 'test-book',
          rendition: null,
          onNavigateToPreviousPage: vi.fn(),
          onNavigateToNextPage: vi.fn()
        }),
        { wrapper: createTestWrapper() }
      )

      unmount()

      expect(mockAudioElement.removeEventListener).toHaveBeenCalledWith('ended', expect.any(Function))
      expect(mockAudioElement.removeEventListener).toHaveBeenCalledWith('error', expect.any(Function))
    })

    it('should handle audio ended event', async () => {
      const paragraphs = createTestParagraphs(2)
      mockStoreState.paragraphs = paragraphs
      mockStoreState.currentParagraphIndex = 0
      mockStoreState.isPlaying = true

      const { result } = renderHook(
        () => useTTS({
          bookId: 'test-book',
          rendition: null,
          onNavigateToPreviousPage: vi.fn(),
          onNavigateToNextPage: vi.fn()
        }),
        { wrapper: createTestWrapper() }
      )

      // Get the event handler
      const endedHandler = mockAudioElement.addEventListener.mock.calls.find(
        call => call[0] === 'ended'
      )?.[1]

      expect(endedHandler).toBeDefined()

      // Simulate audio ended event
      act(() => {
        endedHandler!()
      })

      expect(mockStoreActions.setPlaying).toHaveBeenCalledWith(false)
      expect(mockStoreActions.setPaused).toHaveBeenCalledWith(false)
    })

    it('should handle audio error event', async () => {
      renderHook(
        () => useTTS({
          bookId: 'test-book',
          rendition: null,
          onNavigateToPreviousPage: vi.fn(),
          onNavigateToNextPage: vi.fn()
        }),
        { wrapper: createTestWrapper() }
      )

      // Get the error handler
      const errorHandler = mockAudioElement.addEventListener.mock.calls.find(
        call => call[0] === 'error'
      )?.[1]

      expect(errorHandler).toBeDefined()

      // Simulate audio error event
      act(() => {
        errorHandler!({} as Event)
      })

      expect(mockStoreActions.setError).toHaveBeenCalledWith('Audio playback failed')
      expect(mockStoreActions.setPlaying).toHaveBeenCalledWith(false)
      expect(mockStoreActions.setLoading).toHaveBeenCalledWith(false)
    })
  })

  describe('Edge cases', () => {
    it('should handle empty paragraphs list', async () => {
      mockStoreState.paragraphs = []

      const { result } = renderHook(
        () => useTTS({
          bookId: 'test-book',
          rendition: null,
          onNavigateToPreviousPage: vi.fn(),
          onNavigateToNextPage: vi.fn()
        }),
        { wrapper: createTestWrapper() }
      )

      await act(async () => {
        await result.current.play()
      })

      expect(mockStoreActions.setError).toHaveBeenCalledWith('No paragraphs available to play')
    })

    it('should handle missing API key', async () => {
      mockStoreState.hasApiKey = false
      const paragraphs = createTestParagraphs(1)
      mockStoreState.paragraphs = paragraphs

      const { result } = renderHook(
        () => useTTS({
          bookId: 'test-book',
          rendition: null,
          onNavigateToPreviousPage: vi.fn(),
          onNavigateToNextPage: vi.fn()
        }),
        { wrapper: createTestWrapper() }
      )

      await act(async () => {
        await result.current.play()
      })

      expect(mockStoreActions.setError).toHaveBeenCalledWith('OpenAI API key not configured')
    })

    it('should handle invalid paragraph index', async () => {
      const paragraphs = createTestParagraphs(2)
      mockStoreState.paragraphs = paragraphs
      mockStoreState.currentParagraphIndex = 5 // Invalid index

      const { result } = renderHook(
        () => useTTS({
          bookId: 'test-book',
          rendition: null,
          onNavigateToPreviousPage: vi.fn(),
          onNavigateToNextPage: vi.fn()
        }),
        { wrapper: createTestWrapper() }
      )

      await act(async () => {
        await result.current.play()
      })

      // Should not crash, but current paragraph would be undefined
      expect(mockStoreActions.setPlaying).not.toHaveBeenCalled()
    })
  })

  describe('State synchronization', () => {
    it('should update API key status in store', async () => {
      const { useTTSApiKeyStatus } = await import('../../../renderer/src/hooks/useTTSQueries')
      useTTSApiKeyStatus().data = false

      renderHook(
        () => useTTS({
          bookId: 'test-book',
          rendition: null,
          onNavigateToPreviousPage: vi.fn(),
          onNavigateToNextPage: vi.fn()
        }),
        { wrapper: createTestWrapper() }
      )

      await waitFor(() => {
        expect(mockStoreActions.setHasApiKey).toHaveBeenCalledWith(false)
      })
    })

    it('should set current book ID when it changes', async () => {
      renderHook(
        () => useTTS({
          bookId: 'new-book-id',
          rendition: null,
          onNavigateToPreviousPage: vi.fn(),
          onNavigateToNextPage: vi.fn()
        }),
        { wrapper: createTestWrapper() }
      )

      await waitFor(() => {
        expect(mockStoreActions.setCurrentBookId).toHaveBeenCalledWith('new-book-id')
      })
    })
  })
})
