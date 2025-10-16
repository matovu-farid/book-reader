# TTS Audio Playback Debug Instructions

## Problem

Audio files are returning 404 errors when trying to play TTS audio. The URL `http://localhost:3495/tts-cache/8193489ddab94b8ad9b6d31c3522dc8e/904434a9de06438659a918d42e54b0ee.mp3` is not found.

## Debug Changes Made

### 1. **Fixed Path Consistency**

- Changed TTS cache from `userData/public/tts-cache` to `appData/public/tts-cache` to match Express server
- Added automatic creation of public directory

### 2. **Added Comprehensive Logging**

- **TTS Cache**: Logs file paths, URLs, and directory locations when saving audio
- **Express Server**: Logs all HTTP requests and server configuration
- **File Verification**: Confirms audio files are created successfully

### 3. **Added Test Endpoint**

- `/test` endpoint to verify Express server is running and show configuration

## How to Debug

### Step 1: Run the Application

```bash
pnpm run dev
```

### Step 2: Check Console Output

Look for these log messages in the main process console:

1. **Express Server Startup**:

   ```
   Server running on http://localhost:3495
   Serving files from: /path/to/appData/public
   ```

2. **TTS Audio Generation**:

   ```
   Saving TTS audio:
     Book ID: 8193489ddab94b8ad9b6d31c3522dc8e
     CFI Range: [cfi-range]
     File Path: /path/to/appData/public/tts-cache/bookId/hash.mp3
     URL: http://localhost:3495/tts-cache/bookId/hash.mp3
     Cache Dir: /path/to/appData/public/tts-cache
   ```

3. **File Creation Confirmation**:

   ```
   File created successfully: {
     path: '/path/to/appData/public/tts-cache/bookId/hash.mp3',
     size: 12345,
     url: 'http://localhost:3495/tts-cache/bookId/hash.mp3'
   }
   ```

4. **HTTP Requests**:
   ```
   Express: GET /tts-cache/bookId/hash.mp3
   ```

### Step 3: Test Express Server

Open browser and visit: `http://localhost:3495/test`

Expected response:

```json
{
  "message": "Express server is running",
  "publicDir": "/path/to/appData/public",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Step 4: Test TTS Audio

1. Open a book with TTS enabled
2. Click play on any paragraph
3. Check console for:
   - File creation logs
   - HTTP request logs
   - Any error messages

## Expected Behavior

1. **File Creation**: Audio files should be created in `appData/public/tts-cache/`
2. **URL Generation**: URLs should be `http://localhost:PORT/tts-cache/bookId/hash.mp3`
3. **HTTP Serving**: Express should serve files from `appData/public/`
4. **Audio Playback**: Audio element should successfully load and play

## Troubleshooting

### If files aren't being created:

- Check if `appData/public` directory exists
- Verify TTS cache logs show correct paths
- Check for file system permission errors

### If files exist but 404 errors persist:

- Verify Express server is serving from correct directory
- Check URL path matches file structure
- Test with `/test` endpoint to verify server configuration

### If audio plays but with errors:

- Check browser network tab for actual HTTP requests
- Verify audio file format and size
- Check for CORS issues

## Files Modified

- `src/main/modules/ttsCache.ts` - Path consistency and debugging
- `src/main/modules/express.ts` - Request logging and test endpoint
- `TTS_DEBUG_INSTRUCTIONS.md` - This documentation

Run the application and check the console output to identify where the issue is occurring!
