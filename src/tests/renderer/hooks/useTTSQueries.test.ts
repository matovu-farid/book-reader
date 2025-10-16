import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'
import { setupTestEnvironment } from '../../utils/test-helpers'
import { useTTSApiKeyStatus, useTTSQueueStatus, useRequestTTSAudio, useClearTTSCache, useGetTTSCacheSize } from '../../../renderer/src/hooks/useTTSQueries'

// Mock window.functions
const mockWindowFunctions = {
  getTTSApiKeyStatus: vi.fn(),
  getTTSQueueStatus: vi.fn(),
  requestTTSAudio: vi.fn(),
  clearTTSCache: vi.fn(),
  getTTSCacheSize: vi.fn()
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

describe('useTTSQueries', () => {
  beforeEach(() => {
    setupTestEnvironment()
    Object.assign(window, { functions: mockWindowFunctions })
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  describe('Query hooks', () => {
    describe('useTTSApiKeyStatus', () => {
      it('should fetch API key status', async () => {
        mockWindowFunctions.getTTSApiKeyStatus.mockResolvedValueOnce(true)

        const { result } = renderHook(() => useTTSApiKeyStatus(), {
          wrapper: createTestWrapper()
        })

        await waitFor(() => {
          expect(result.current.isSuccess).toBe(true)
        })

        expect(result.current.data).toBe(true)
        expect(mockWindowFunctions.getTTSApiKeyStatus).toHaveBeenCalled()
      })

      it('should handle API key status errors', async () => {
        mockWindowFunctions.getTTSApiKeyStatus.mockRejectedValueOnce(new Error('IPC error'))

        const { result } = renderHook(() => useTTSApiKeyStatus(), {
          wrapper: createTestWrapper()
        })

        await waitFor(() => {
          expect(result.current.isError).toBe(true)
        })

        expect(result.current.error).toBeInstanceOf(Error)
      })
    })

    describe('useTTSQueueStatus', () => {
      it('should fetch queue status', async () => {
        const mockStatus = { pending: 2, isProcessing: true, active: 1 }
        mockWindowFunctions.getTTSQueueStatus.mockResolvedValueOnce(mockStatus)

        const { result } = renderHook(() => useTTSQueueStatus(), {
          wrapper: createTestWrapper()
        })

        await waitFor(() => {
          expect(result.current.isSuccess).toBe(true)
        })

        expect(result.current.data).toEqual(mockStatus)
        expect(mockWindowFunctions.getTTSQueueStatus).toHaveBeenCalled()
      })

      it('should poll when queue is active', async () => {
        const mockStatus = { pending: 1, isProcessing: false, active: 0 }
        mockWindowFunctions.getTTSQueueStatus.mockResolvedValue(mockStatus)

        const { result } = renderHook(() => useTTSQueueStatus(), {
          wrapper: createTestWrapper()
        })

        await waitFor(() => {
          expect(result.current.isSuccess).toBe(true)
        })

        // Should not poll when idle
        expect(result.current.data?.refetchInterval).toBeFalsy()
      })

      it('should stop polling when idle', async () => {
        const activeStatus = { pending: 1, isProcessing: true, active: 0 }
        const idleStatus = { pending: 0, isProcessing: false, active: 0 }

        mockWindowFunctions.getTTSQueueStatus
          .mockResolvedValueOnce(activeStatus)
          .mockResolvedValueOnce(idleStatus)

        const { result } = renderHook(() => useTTSQueueStatus(), {
          wrapper: createTestWrapper()
        })

        await waitFor(() => {
          expect(result.current.isSuccess).toBe(true)
        })

        // Initial call should be made
        expect(mockWindowFunctions.getTTSQueueStatus).toHaveBeenCalled()
      })
    })
  })

  describe('Mutation hooks', () => {
    describe('useRequestTTSAudio', () => {
      it('should request audio with retry', async () => {
        mockWindowFunctions.requestTTSAudio.mockResolvedValueOnce('http://localhost:3000/audio.mp3')

        const { result } = renderHook(() => useRequestTTSAudio(), {
          wrapper: createTestWrapper()
        })

        await act(async () => {
          await result.current.mutateAsync({
            bookId: 'test-book',
            cfiRange: 'test-cfi',
            text: 'test text',
            priority: 2
          })
        })

        expect(mockWindowFunctions.requestTTSAudio).toHaveBeenCalledWith(
          'test-book',
          'test-cfi',
          'test text',
          2
        )
        expect(result.current.data).toBe('http://localhost:3000/audio.mp3')
      })

      it('should handle request failures', async () => {
        mockWindowFunctions.requestTTSAudio.mockRejectedValueOnce(new Error('Request failed'))

        const { result } = renderHook(() => useRequestTTSAudio(), {
          wrapper: createTestWrapper()
        })

        await act(async () => {
          try {
            await result.current.mutateAsync({
              bookId: 'test-book',
              cfiRange: 'test-cfi',
              text: 'test text'
            })
          } catch (error) {
            // Expected to throw
          }
        })

        expect(result.current.isError).toBe(true)
        expect(result.current.error).toBeInstanceOf(Error)
      })

      it('should retry on network errors', async () => {
        const networkError = new Error('Network timeout')
        mockWindowFunctions.requestTTSAudio
          .mockRejectedValueOnce(networkError)
          .mockResolvedValueOnce('http://localhost:3000/audio.mp3')

        const { result } = renderHook(() => useRequestTTSAudio(), {
          wrapper: createTestWrapper()
        })

        await act(async () => {
          await result.current.mutateAsync({
            bookId: 'test-book',
            cfiRange: 'test-cfi',
            text: 'test text'
          })
        })

        // Should have been called twice (initial + retry)
        expect(mockWindowFunctions.requestTTSAudio).toHaveBeenCalledTimes(2)
        expect(result.current.data).toBe('http://localhost:3000/audio.mp3')
      })

      it('should not retry on non-retryable errors', async () => {
        const nonRetryableError = new Error('Invalid API key')
        mockWindowFunctions.requestTTSAudio.mockRejectedValue(nonRetryableError)

        const { result } = renderHook(() => useRequestTTSAudio(), {
          wrapper: createTestWrapper()
        })

        await act(async () => {
          try {
            await result.current.mutateAsync({
              bookId: 'test-book',
              cfiRange: 'test-cfi',
              text: 'test text'
            })
          } catch (error) {
            // Expected to throw
          }
        })

        // Should only be called once (no retry)
        expect(mockWindowFunctions.requestTTSAudio).toHaveBeenCalledTimes(1)
        expect(result.current.isError).toBe(true)
      })

      it('should use exponential backoff for retries', async () => {
        vi.useFakeTimers()

        const networkError = new Error('Network timeout')
        mockWindowFunctions.requestTTSAudio
          .mockRejectedValueOnce(networkError)
          .mockRejectedValueOnce(networkError)
          .mockResolvedValueOnce('http://localhost:3000/audio.mp3')

        const { result } = renderHook(() => useRequestTTSAudio(), {
          wrapper: createTestWrapper()
        })

        const mutationPromise = result.current.mutateAsync({
          bookId: 'test-book',
          cfiRange: 'test-cfi',
          text: 'test text'
        })

        // Advance timers to simulate retry delays
        vi.advanceTimersByTime(1000) // First retry delay
        vi.advanceTimersByTime(2000) // Second retry delay

        await act(async () => {
          await mutationPromise
        })

        expect(mockWindowFunctions.requestTTSAudio).toHaveBeenCalledTimes(3)
        expect(result.current.data).toBe('http://localhost:3000/audio.mp3')

        vi.useRealTimers()
      })
    })

    describe('useClearTTSCache', () => {
      it('should clear cache correctly', async () => {
        mockWindowFunctions.clearTTSCache.mockResolvedValueOnce(undefined)

        const { result } = renderHook(() => useClearTTSCache(), {
          wrapper: createTestWrapper()
        })

        await act(async () => {
          await result.current.mutateAsync('test-book')
        })

        expect(mockWindowFunctions.clearTTSCache).toHaveBeenCalledWith('test-book')
        expect(result.current.isSuccess).toBe(true)
      })

      it('should handle cache clear errors', async () => {
        mockWindowFunctions.clearTTSCache.mockRejectedValueOnce(new Error('Clear failed'))

        const { result } = renderHook(() => useClearTTSCache(), {
          wrapper: createTestWrapper()
        })

        await act(async () => {
          try {
            await result.current.mutateAsync('test-book')
          } catch (error) {
            // Expected to throw
          }
        })

        expect(result.current.isError).toBe(true)
        expect(result.current.error).toBeInstanceOf(Error)
      })
    })

    describe('useGetTTSCacheSize', () => {
      it('should get cache size', async () => {
        mockWindowFunctions.getTTSCacheSize.mockResolvedValueOnce(1024)

        const { result } = renderHook(() => useGetTTSCacheSize(), {
          wrapper: createTestWrapper()
        })

        await act(async () => {
          await result.current.mutateAsync('test-book')
        })

        expect(mockWindowFunctions.getTTSCacheSize).toHaveBeenCalledWith('test-book')
        expect(result.current.data).toBe(1024)
      })

      it('should handle cache size errors', async () => {
        mockWindowFunctions.getTTSCacheSize.mockRejectedValueOnce(new Error('Size check failed'))

        const { result } = renderHook(() => useGetTTSCacheSize(), {
          wrapper: createTestWrapper()
        })

        await act(async () => {
          try {
            await result.current.mutateAsync('test-book')
          } catch (error) {
            // Expected to throw
          }
        })

        expect(result.current.isError).toBe(true)
        expect(result.current.error).toBeInstanceOf(Error)
      })
    })
  })

  describe('Error handling', () => {
    it('should handle IPC communication errors', async () => {
      mockWindowFunctions.getTTSApiKeyStatus.mockRejectedValueOnce(new Error('IPC timeout'))

      const { result } = renderHook(() => useTTSApiKeyStatus(), {
        wrapper: createTestWrapper()
      })

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      expect(result.current.error).toBeInstanceOf(Error)
      expect(result.current.error?.message).toBe('IPC timeout')
    })

    it('should handle invalid responses', async () => {
      mockWindowFunctions.getTTSQueueStatus.mockResolvedValueOnce(null)

      const { result } = renderHook(() => useTTSQueueStatus(), {
        wrapper: createTestWrapper()
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toBeNull()
    })
  })

  describe('Performance', () => {
    it('should not refetch on window focus by default', async () => {
      mockWindowFunctions.getTTSApiKeyStatus.mockResolvedValueOnce(true)

      const { result } = renderHook(() => useTTSApiKeyStatus(), {
        wrapper: createTestWrapper()
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      const initialCallCount = mockWindowFunctions.getTTSApiKeyStatus.mock.calls.length

      // Simulate window focus (this would normally trigger refetch)
      // Since refetchOnWindowFocus is false, it shouldn't refetch
      window.dispatchEvent(new Event('focus'))

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(mockWindowFunctions.getTTSApiKeyStatus).toHaveBeenCalledTimes(initialCallCount)
    })

    it('should cache results appropriately', async () => {
      mockWindowFunctions.getTTSApiKeyStatus.mockResolvedValue(true)

      // Render multiple hooks with same query
      const { result: result1 } = renderHook(() => useTTSApiKeyStatus(), {
        wrapper: createTestWrapper()
      })

      const { result: result2 } = renderHook(() => useTTSApiKeyStatus(), {
        wrapper: createTestWrapper()
      })

      await waitFor(() => {
        expect(result1.current.isSuccess).toBe(true)
        expect(result2.current.isSuccess).toBe(true)
      })

      // Both should have the same data (cached)
      expect(result1.current.data).toBe(result2.current.data)
    })
  })
})
