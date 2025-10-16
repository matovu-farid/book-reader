# TTS Hook Bug Fixes and Memory Leak Prevention

## Issues Found and Fixed

### 1. **Critical: Rules of Hooks Violation**

- **Problem**: `useTTSAudioPath` hook was being called inside a callback function (`requestAudio`)
- **Impact**: This violates React's Rules of Hooks and can cause runtime errors
- **Fix**: Replaced with direct API call to `window.functions.getTTSAudioPath()`

### 2. **Memory Leak: Audio Element Cleanup**

- **Problem**: Audio element event listeners were never removed, causing memory leaks
- **Impact**: Memory usage would grow over time, especially with frequent audio playback
- **Fix**: Added proper cleanup in `useEffect` with event listener removal

### 3. **Circular Dependency in useCallback**

- **Problem**: `handleAudioEnded` called `next()`, but `next()` depended on `handleAudioEnded`
- **Impact**: Infinite re-renders and potential stack overflow
- **Fix**: Used `useRef` pattern to break the circular dependency

### 4. **Missing Dependencies in useCallback**

- **Problem**: Several `useCallback` hooks were missing dependencies
- **Impact**: Stale closures, functions not updating when dependencies changed
- **Fix**: Added all missing dependencies to dependency arrays

### 5. **Variable Declaration Order**

- **Problem**: Event handlers were used before being declared
- **Impact**: Runtime errors due to hoisting issues
- **Fix**: Moved event handler definitions before their usage

## Code Changes Made

### Before (Problematic):

```typescript
// Rules of Hooks violation
const requestAudio = useCallback(async (paragraph) => {
  const audioPathQuery = useTTSAudioPath(bookId, paragraph.cfiRange) // ❌ Hook in callback
  // ...
}, [])

// Missing cleanup
const playAudio = useCallback((audioPath) => {
  if (!audioRef.current) {
    audioRef.current = new Audio()
    audioRef.current.addEventListener('ended', handleAudioEnded) // ❌ Never removed
    // ...
  }
}, [])

// Circular dependency
const handleAudioEnded = useCallback(() => {
  next() // ❌ next() depends on handleAudioEnded
}, [next])
```

### After (Fixed):

```typescript
// Direct API call instead of hook
const requestAudio = useCallback(
  async (paragraph) => {
    const cachedAudioPath = await window.functions.getTTSAudioPath(bookId, paragraph.cfiRange) // ✅ Direct call
    // ...
  },
  [bookId, audioCache, pendingRequests, addToAudioCache, requestAudioMutation]
)

// Proper cleanup
useEffect(() => {
  return () => {
    if (audioRef.current) {
      audioRef.current.removeEventListener('ended', handleAudioEnded) // ✅ Proper cleanup
      audioRef.current.removeEventListener('error', handleAudioError)
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
  }
}, [handleAudioEnded, handleAudioError])

// Breaking circular dependency with ref
const nextRef = useRef<() => void>(() => {})
const handleAudioEnded = useCallback(() => {
  nextRef.current() // ✅ Using ref to avoid circular dependency
}, [setPlaying, setPaused])

useEffect(() => {
  nextRef.current = next // ✅ Update ref when next changes
}, [next])
```

## Performance Improvements

1. **Memory Management**: Audio elements are now properly cleaned up
2. **Event Listener Cleanup**: No more memory leaks from orphaned listeners
3. **Stable References**: All callbacks have correct dependencies
4. **Reduced Re-renders**: Eliminated circular dependencies that caused unnecessary re-renders

## Testing Recommendations

1. **Memory Testing**: Monitor memory usage during extended TTS sessions
2. **Navigation Testing**: Test rapid paragraph navigation to ensure no memory leaks
3. **Component Unmounting**: Verify cleanup works when navigating away from book view
4. **Error Scenarios**: Test audio playback errors to ensure proper cleanup

## Additional Benefits

- **Better Error Handling**: Improved error boundaries and cleanup
- **Cleaner Code**: Removed redundant event handler definitions
- **Type Safety**: Better TypeScript support with proper dependency arrays
- **Maintainability**: Easier to debug and extend with proper separation of concerns
