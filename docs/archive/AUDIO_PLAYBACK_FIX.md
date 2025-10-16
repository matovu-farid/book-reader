# Audio Playback Fix - TTS URL Resolution

## Problem

The TTS feature was failing to play audio with the error:

```
Failed to load because no supported source was found.
```

## Root Cause

The audio files were being stored as local file system paths (e.g., `/Users/username/Library/Application Support/app/tts-cache/book123/abc123.mp3`) but the HTML Audio element couldn't access them directly. The Audio element requires either:

1. HTTP URLs (recommended for Electron)
2. Proper `file://` URLs with correct encoding

## Solution

Modified the TTS cache system to serve audio files through the existing Express server, converting local file paths to HTTP URLs.

## Changes Made

### 1. **Updated TTS Cache (`ttsCache.ts`)**

- **Cache Directory**: Changed from `userData/tts-cache/` to `userData/public/tts-cache/`
- **URL Generation**: Added `getAudioUrl()` method to generate HTTP URLs
- **Interface Update**: `CachedAudioInfo` now includes both `filePath` and `url`

```typescript
// Before
private cacheDir = path.join(app.getPath('userData'), 'tts-cache')

// After
private cacheDir = path.join(app.getPath('userData'), 'public', 'tts-cache')

private getAudioUrl(bookId: string, cfiRange: string): string {
  const hashedCfi = md5(cfiRange)
  return `http://localhost:${PORT}/tts-cache/${bookId}/${hashedCfi}.mp3`
}
```

### 2. **Updated TTS Service (`ttsService.ts`)**

- **Return URLs**: Both `requestAudio()` and `getAudioPath()` now return HTTP URLs instead of file paths

```typescript
// Before
return cached.filePath

// After
return cached.url
```

### 3. **Updated TTS Hook (`useTTS.ts`)**

- **Removed file:// conversion**: Audio paths are now already proper HTTP URLs
- **Simplified audio playback**: Direct assignment of URL to `audioRef.current.src`

```typescript
// Before
const audioUrl = audioPath.startsWith('file://') ? audioPath : `file://${audioPath}`
audioRef.current.src = audioUrl

// After
audioRef.current.src = audioPath // Already HTTP URL
```

## How It Works

1. **Audio Generation**: OpenAI TTS generates audio buffer
2. **File Storage**: Audio saved to `userData/public/tts-cache/bookId/hash.mp3`
3. **URL Generation**: HTTP URL created: `http://localhost:PORT/tts-cache/bookId/hash.mp3`
4. **Express Serving**: Existing Express server serves files from `public` directory
5. **Audio Playback**: Audio element uses HTTP URL for playback

## Benefits

- **✅ Proper URL Resolution**: Audio files accessible via HTTP
- **✅ Consistent with Project**: Uses existing Express server pattern
- **✅ Cross-Platform**: Works on all platforms (Windows, macOS, Linux)
- **✅ No Security Issues**: Avoids direct file system access from renderer
- **✅ Better Performance**: HTTP caching and streaming support

## Testing

The fix should resolve the audio playback error. To test:

1. Open a book with TTS enabled
2. Click play on any paragraph
3. Audio should now play successfully
4. Check browser console for "Playing audio from: http://localhost:..." logs

## Files Modified

- `src/main/modules/ttsCache.ts` - Cache directory and URL generation
- `src/main/modules/ttsService.ts` - Return URLs instead of file paths
- `src/renderer/src/hooks/useTTS.ts` - Simplified audio playback
- `AUDIO_PLAYBACK_FIX.md` - This documentation

The TTS feature should now work correctly with proper audio playback! 🎉
