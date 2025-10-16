import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTTSStore } from '../stores/ttsStore'

// Query keys
export const ttsKeys = {
  all: ['tts'] as const,
  apiKeyStatus: () => [...ttsKeys.all, 'apiKeyStatus'] as const,
  queueStatus: () => [...ttsKeys.all, 'queueStatus'] as const,
  audioPath: (bookId: string, cfiRange: string) =>
    [...ttsKeys.all, 'audioPath', bookId, cfiRange] as const,
  cacheSize: (bookId: string) => [...ttsKeys.all, 'cacheSize', bookId] as const
}

// Hook to check API key status
export function useTTSApiKeyStatus() {
  return useQuery({
    queryKey: ttsKeys.apiKeyStatus(),
    queryFn: async () => {
      return await window.functions.getTTSApiKeyStatus()
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false
  })
}

// Hook to get queue status
export function useTTSQueueStatus() {
  return useQuery({
    queryKey: ttsKeys.queueStatus(),
    queryFn: async () => {
      return await window.functions.getTTSQueueStatus()
    },
    refetchInterval: (query) => {
      // Only poll when there are active requests or processing
      const data = query.state.data
      if (data?.isProcessing || (data as any)?.active > 0 || (data as any)?.pending > 0) {
        return 1000 // Poll every second when active
      }
      return false // Stop polling when idle
    },
    refetchOnWindowFocus: false
  })
}

// Hook to check if audio is cached
export function useTTSAudioPath(bookId: string, cfiRange: string, enabled = true) {
  return useQuery({
    queryKey: ttsKeys.audioPath(bookId, cfiRange),
    queryFn: async () => {
      return await window.functions.getTTSAudioPath(bookId, cfiRange)
    },
    enabled: enabled && !!bookId && !!cfiRange,
    staleTime: Infinity, // Audio files don't change
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false
  })
}

// Hook to get cache size
export function useTTSCacheSize(bookId: string) {
  return useQuery({
    queryKey: ttsKeys.cacheSize(bookId),
    queryFn: async () => {
      return await window.functions.getTTSCacheSize(bookId)
    },
    enabled: !!bookId,
    staleTime: 30 * 1000, // 30 seconds
    refetchOnWindowFocus: false
  })
}

// Mutation to request TTS audio
export function useRequestTTSAudio() {
  const queryClient = useQueryClient()
  const { addToAudioCache, setError } = useTTSStore()

  return useMutation({
    mutationFn: async ({
      bookId,
      cfiRange,
      text,
      priority = 0
    }: {
      bookId: string
      cfiRange: string
      text: string
      priority?: number
    }) => {
      try {
        const audioPath = await window.functions.requestTTSAudio(bookId, cfiRange, text, priority)

        // Update cache
        addToAudioCache(cfiRange, audioPath)

        // Invalidate and refetch audio path query
        queryClient.invalidateQueries({ queryKey: ttsKeys.audioPath(bookId, cfiRange) })

        return audioPath
      } catch (error) {
        console.error('TTS request failed:', error)
        throw error
      }
    },
    onError: (error) => {
      console.error('TTS request failed:', error)
      setError(`Failed to generate audio for paragraph: ${error.message}`)
    },
    retry: (failureCount, error) => {
      // Retry up to 2 times for network errors
      if (failureCount < 2) {
        const errorMessage = error.message.toLowerCase()
        return (
          errorMessage.includes('timeout') ||
          errorMessage.includes('network') ||
          errorMessage.includes('rate limit')
        )
      }
      return false
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000) // Exponential backoff
  })
}

// Mutation to clear TTS cache
export function useClearTTSCache() {
  const queryClient = useQueryClient()
  const { reset } = useTTSStore()

  return useMutation({
    mutationFn: async (bookId: string) => {
      await window.functions.clearTTSCache(bookId)
    },
    onSuccess: (_, bookId) => {
      // Invalidate all cache-related queries
      queryClient.invalidateQueries({ queryKey: ttsKeys.cacheSize(bookId) })
      queryClient.invalidateQueries({ queryKey: ttsKeys.all })

      // Reset local cache
      reset()
    },
    onError: (error) => {
      console.error('Failed to clear TTS cache:', error)
    }
  })
}

// Hook to cancel TTS requests (for cleanup)
export function useCancelTTSRequests() {
  return useMutation({
    mutationFn: async (bookId: string) => {
      // This would need to be implemented in the main process
      // For now, we'll just clear the local cache
      return bookId
    },
    onSuccess: () => {
      // Clear any pending queries
      console.log('TTS requests cancelled')
    }
  })
}
