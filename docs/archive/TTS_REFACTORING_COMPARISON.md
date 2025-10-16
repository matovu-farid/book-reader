# TTS Hook Refactoring: Before vs After

## Overview

Refactored the complex `useTTS` hook to use **React Query** for server state management and **Zustand** for client state management, significantly improving maintainability and performance.

## Key Improvements

### 1. **Separation of Concerns**

- **Before**: All state (client + server) managed in a single hook
- **After**:
  - **Zustand**: Client state (playback controls, UI state)
  - **React Query**: Server state (API calls, caching, background updates)

### 2. **Better Caching Strategy**

- **Before**: Manual cache management with `useRef` and `Map`
- **After**:
  - React Query handles server-side caching automatically
  - Zustand manages client-side cache for immediate access
  - Automatic cache invalidation and background updates

### 3. **Improved Error Handling**

- **Before**: Basic try/catch blocks
- **After**: React Query's built-in error handling, retry logic, and error states

### 4. **Better Performance**

- **Before**: Manual polling and state updates
- **After**:
  - React Query's intelligent background refetching
  - Automatic deduplication of requests
  - Optimistic updates

### 5. **Enhanced Developer Experience**

- **Before**: Complex state logic mixed with side effects
- **After**:
  - Clear separation between queries and mutations
  - Better TypeScript support
  - Easier testing and debugging

## Architecture Comparison

### Before (Monolithic Hook)

```typescript
export function useTTS() {
  const [state, setState] = useState<TTSState>({...})
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioCacheRef = useRef<Map<string, string>>(new Map())
  const pendingRequestsRef = useRef<Set<string>>(new Set())

  // Manual API calls
  const requestAudio = async () => { /* complex logic */ }

  // Manual cache management
  const prefetchAudio = () => { /* cache logic */ }

  // Manual state management
  const play = () => { /* state updates */ }
}
```

### After (Separated Concerns)

```typescript
// Zustand Store (Client State)
export const useTTSStore = create<TTSState>((set, get) => ({
  isPlaying: false,
  // ... other state
  setPlaying: (playing) => set({ isPlaying: playing }),
  // ... other actions
}))

// React Query Hooks (Server State)
export function useRequestTTSAudio() {
  return useMutation({
    mutationFn: async ({ bookId, cfiRange, text, priority }) => {
      return await window.functions.requestTTSAudio(bookId, cfiRange, text, priority)
    },
    onSuccess: (audioPath, { cfiRange }) => {
      // Update cache automatically
    }
  })
}

// Simplified Hook (Orchestration)
export function useTTS() {
  const store = useTTSStore()
  const requestAudioMutation = useRequestTTSAudio()

  // Much cleaner logic
  const play = useCallback(async () => {
    store.setPlaying(true)
    await requestAudioMutation.mutateAsync({...})
  }, [store, requestAudioMutation])
}
```

## Benefits of the New Architecture

### 1. **React Query Benefits**

- **Automatic Background Updates**: Queue status polls automatically
- **Intelligent Caching**: Server responses cached with proper invalidation
- **Request Deduplication**: Multiple requests for same audio are deduplicated
- **Error Recovery**: Built-in retry logic and error states
- **Optimistic Updates**: UI updates immediately while request is in flight

### 2. **Zustand Benefits**

- **Simplified State**: No more complex `useState` and `useRef` management
- **Better Performance**: Selective subscriptions prevent unnecessary re-renders
- **Type Safety**: Full TypeScript support with proper typing
- **DevTools**: Built-in Redux DevTools support for debugging
- **Persistence**: Easy to add persistence if needed

### 3. **Maintainability**

- **Single Responsibility**: Each piece has one clear purpose
- **Testability**: Easier to unit test individual pieces
- **Reusability**: Queries and store can be reused in other components
- **Scalability**: Easy to add new features without affecting existing code

## File Structure

### New Files Created

```
src/renderer/src/
├── stores/
│   └── ttsStore.ts           # Zustand store for client state
├── hooks/
│   ├── useTTSQueries.ts      # React Query hooks for server state
│   └── useTTSRefactored.ts   # Simplified orchestration hook
```

### Modified Files

```
src/renderer/src/routes/
└── books.$id.lazy.tsx        # Updated to use refactored hook
```

## Migration Benefits

1. **Reduced Complexity**: Main hook is now ~200 lines vs ~330 lines
2. **Better Performance**: Automatic optimizations from React Query
3. **Improved UX**: Better loading states and error handling
4. **Future-Proof**: Easy to extend with new features
5. **Debugging**: Better developer tools and error tracking

## Usage Example

```typescript
// In your component
const tts = useTTS({ bookId, rendition, onNavigateToPreviousPage, onNavigateToNextPage })

// Same interface as before, but with better performance
<button onClick={tts.play}>Play</button>
<button onClick={tts.pause}>Pause</button>
```

The refactored solution maintains the same external API while providing significant internal improvements in architecture, performance, and maintainability.
