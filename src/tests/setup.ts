import '@testing-library/jest-dom'

// Mock global objects that are not available in jsdom
global.HTMLAudioElement = class MockAudioElement {
  play = () => Promise.resolve()
  pause = () => {}
  addEventListener = () => {}
  removeEventListener = () => {}
  src = ''
  currentTime = 0
  paused = true
  ended = false
  error = null
  duration = 10
  volume = 1
  load = () => {}
  canPlayType = () => 'probably'
} as any

// Mock window.functions for all tests
global.window = {
  ...global.window,
  functions: {
    requestTTSAudio: () => Promise.resolve('http://localhost:3000/audio.mp3'),
    getTTSAudioPath: () => Promise.resolve(null),
    getTTSApiKeyStatus: () => Promise.resolve(true),
    getTTSQueueStatus: () => Promise.resolve({ pending: 0, isProcessing: false, active: 0 }),
    clearTTSCache: () => Promise.resolve(),
    getTTSCacheSize: () => Promise.resolve(0),
    cancelTTSRequest: () => Promise.resolve(true),
    onTTSAudioReady: () => {},
    removeTTSAudioReadyListener: () => {},
    onTTSError: () => {},
    removeTTSErrorListener: () => {}
  }
} as any
