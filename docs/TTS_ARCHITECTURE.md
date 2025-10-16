# TTS Audio Feature Architecture

## Overview

The Text-to-Speech (TTS) feature in this book reader application provides audio playback of book content using OpenAI's TTS API. The system is designed with a clean separation of concerns, proper error handling, and efficient caching mechanisms.

## Architecture Components

### Backend Services (Main Process)

#### 1. TTSCache (`src/main/modules/ttsCache.ts`)

- **Purpose**: Manages local file system caching of generated audio files
- **Key Features**:
  - Automatic cache size management (500MB limit)
  - LRU-based cleanup when cache exceeds threshold
  - HTTP URL generation for audio files
  - File system error handling
- **Cache Structure**:
  ```
  appData/public/tts-cache/
  ├── bookId1/
  │   ├── hash1.mp3
  │   └── hash2.mp3
  └── bookId2/
      └── hash3.mp3
  ```

#### 2. TTSQueue (`src/main/modules/ttsQueue.ts`)

- **Purpose**: Manages queuing and processing of TTS requests
- **Key Features**:
  - Priority-based queue (higher priority requests processed first)
  - Request deduplication (prevents duplicate API calls)
  - Automatic retry with exponential backoff
  - Request timeout handling (30 seconds)
  - OpenAI API integration with rate limiting support
- **Queue Processing**:
  - Sequential processing to respect API rate limits
  - Automatic error recovery for network issues
  - Request cancellation support

#### 3. TTSService (`src/main/modules/ttsService.ts`)

- **Purpose**: Main orchestrator that coordinates cache and queue operations
- **Key Features**:
  - Unified API for audio requests
  - Event emission for audio-ready and error states
  - Request tracking and management
  - Integration with cache and queue systems

### Frontend State Management (Renderer Process)

#### 1. Zustand Store (`src/renderer/src/stores/ttsStore.ts`)

- **Purpose**: Client-side state management for TTS functionality
- **State Structure**:
  ```typescript
  interface TTSState {
    // Playback control
    isPlaying: boolean
    isPaused: boolean
    isLoading: boolean
    hasApiKey: boolean

    // Navigation state
    currentParagraphIndex: number
    paragraphs: ParagraphWithCFI[]

    // Book context
    currentBookId: string
    currentPage: string // CFI of current page

    // Cache management
    audioCache: Map<string, string>

    // Error handling
    error: string | null
  }
  ```

#### 2. React Query Hooks (`src/renderer/src/hooks/useTTSQueries.ts`)

- **Purpose**: Server state management and API communication
- **Key Hooks**:
  - `useTTSApiKeyStatus()`: Checks if OpenAI API key is configured
  - `useTTSQueueStatus()`: Monitors queue status with intelligent polling
  - `useTTSAudioPath()`: Checks if audio is cached on disk
  - `useRequestTTSAudio()`: Mutation for requesting new audio
  - `useClearTTSCache()`: Mutation for clearing cache

#### 3. Main TTS Hook (`src/renderer/src/hooks/useTTS.ts`)

- **Purpose**: Orchestrates TTS functionality and provides control interface
- **Key Features**:
  - Audio element management with proper cleanup
  - Page navigation integration
  - Auto-advance functionality
  - Error handling and recovery
  - Prefetching for smooth playback

### UI Components

#### 1. TTSControls (`src/renderer/src/components/TTSControls.tsx`)

- **Purpose**: User interface for TTS controls
- **Features**:
  - Play/Pause/Stop/Next/Previous controls
  - Progress indicator
  - Error display with snackbar notifications
  - Loading states
  - Disabled states for invalid conditions

## Data Flow

### Audio Request Flow

1. User clicks play button
2. `useTTS` hook checks cache (Zustand store)
3. If not cached, checks disk cache via `useTTSAudioPath`
4. If still not cached, requests audio via `useRequestTTSAudio`
5. Request goes through IPC to main process
6. `TTSService` checks cache again
7. If not cached, adds to `TTSQueue`
8. Queue processes request with OpenAI API
9. Generated audio is saved to cache
10. Audio-ready event is emitted
11. Frontend receives event and starts playback

### Page Navigation Flow

1. User navigates to new page
2. `EpubView` extracts paragraphs from new page
3. `onPageParagraphsExtracted` callback updates TTS store
4. If audio is playing, TTS system determines navigation direction
5. For forward navigation: resets to first paragraph of new page
6. For backward navigation: pauses audio
7. Audio continues with appropriate paragraph

## Error Handling Strategy

### Backend Error Handling

- **File System Errors**: Graceful fallback with logging
- **API Errors**: Retry with exponential backoff
- **Rate Limiting**: Automatic backoff and retry
- **Network Errors**: Timeout handling and retry logic

### Frontend Error Handling

- **Audio Playback Errors**: User notification with retry option
- **Network Errors**: Automatic retry with user feedback
- **State Errors**: Automatic recovery and state reset
- **API Key Errors**: Clear user messaging

## Performance Optimizations

### Caching Strategy

- **Multi-level Caching**: Memory cache (Zustand) + Disk cache (TTSCache)
- **Cache Size Management**: Automatic cleanup when limits exceeded
- **Prefetching**: Pre-generates audio for upcoming paragraphs

### Request Optimization

- **Deduplication**: Prevents duplicate requests for same content
- **Priority Queue**: High-priority requests (current paragraph) processed first
- **Request Cancellation**: Cancels outdated requests when user navigates

### Memory Management

- **Audio Element Cleanup**: Proper event listener removal
- **Cache Cleanup**: Automatic cleanup on book switching
- **State Reset**: Clean state reset when navigating between books

## Configuration

### Environment Variables

- `OPENAI_API_KEY`: Required for TTS functionality

### Cache Configuration

- Maximum cache size: 500MB
- Cleanup threshold: 80% of max size
- Cache location: `appData/public/tts-cache`

### Queue Configuration

- Maximum retries: 3 attempts
- Retry delay: Exponential backoff (1s, 2s, 4s)
- Request timeout: 30 seconds

## Security Considerations

- **API Key Management**: Stored in environment variables
- **File System Access**: Restricted to app data directory
- **Network Requests**: Only to OpenAI API endpoints
- **Audio File Serving**: Through local Express server only

## Monitoring and Debugging

### Logging

- Comprehensive logging at all levels
- Error tracking with context
- Performance metrics logging

### Debug Features

- Express server test endpoint (`/test`)
- Cache size monitoring
- Queue status tracking
- Audio file verification

## Future Enhancements

### Potential Improvements

1. **Voice Selection**: Multiple voice options
2. **Speed Control**: Adjustable playback speed
3. **Offline Support**: Download audio for offline playback
4. **Background Processing**: Generate audio in background
5. **User Preferences**: Customizable TTS settings
6. **Analytics**: Usage tracking and performance metrics

### Scalability Considerations

- **Distributed Caching**: Redis or similar for multi-instance support
- **CDN Integration**: Serve audio files from CDN
- **Load Balancing**: Multiple API keys for rate limit distribution
- **Database Storage**: Store cache metadata in database
