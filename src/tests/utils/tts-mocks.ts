import { vi } from 'vitest'
import type { ParagraphWithCFI } from '../../shared/types'

// Mock Audio element
export const createMockAudio = () => ({
  play: vi.fn().mockResolvedValue(undefined),
  pause: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  src: '',
  currentTime: 0,
  paused: true,
  ended: false,
  error: null,
  duration: 10,
  volume: 1,
  load: vi.fn(),
  canPlayType: vi.fn().mockReturnValue('probably')
})

// Mock IPC functions
export const createMockIPC = () => ({
  requestTTSAudio: vi.fn(),
  getTTSAudioPath: vi.fn(),
  getTTSApiKeyStatus: vi.fn(),
  getTTSQueueStatus: vi.fn(),
  clearTTSCache: vi.fn(),
  getTTSCacheSize: vi.fn(),
  cancelTTSRequest: vi.fn(),
  onTTSAudioReady: vi.fn(),
  removeTTSAudioReadyListener: vi.fn(),
  onTTSError: vi.fn(),
  removeTTSErrorListener: vi.fn()
})

// Mock Rendition
export const createMockRendition = () => ({
  highlightRange: vi.fn(),
  removeHighlight: vi.fn(),
  location: { start: { cfi: 'test-cfi' } },
  prev: vi.fn(),
  next: vi.fn(),
  currentLocation: vi.fn().mockReturnValue({ start: { cfi: 'test-cfi' } }),
  on: vi.fn(),
  off: vi.fn()
})

// Mock file system operations
export const createMockFS = () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(Buffer.from('test audio data')),
  unlink: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn().mockResolvedValue({
    size: 1024,
    mtime: new Date(),
    isFile: () => true,
    isDirectory: () => false
  }),
  readdir: vi.fn().mockResolvedValue(['audio1.mp3', 'audio2.mp3'])
})

// Mock OpenAI client
export const createMockOpenAI = () => ({
  audio: {
    speech: {
      create: vi.fn().mockResolvedValue({
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(1024))
      })
    }
  }
})

// Test data
export const createMockParagraph = (index: number): ParagraphWithCFI => ({
  cfiRange: `epubcfi(/6/4[chapter01]/2/1:0)`,
  text: `This is paragraph ${index} with some text content.`,
  element: document.createElement('p')
})

export const createMockParagraphs = (count: number): ParagraphWithCFI[] =>
  Array.from({ length: count }, (_, index) => createMockParagraph(index))

// Mock Express app
export const createMockExpressApp = () => ({
  use: vi.fn(),
  get: vi.fn(),
  listen: vi.fn(),
  static: vi.fn()
})

// Mock path module
export const createMockPath = () => ({
  join: vi.fn((...paths: string[]) => paths.join('/')),
  dirname: vi.fn((path: string) => path.split('/').slice(0, -1).join('/')),
  basename: vi.fn((path: string) => path.split('/').pop() || ''),
  extname: vi.fn((path: string) => {
    const ext = path.split('.').pop()
    return ext ? `.${ext}` : ''
  })
})

// Mock crypto
export const createMockCrypto = () => ({
  createHash: vi.fn().mockReturnValue({
    update: vi.fn().mockReturnThis(),
    digest: vi.fn().mockReturnValue('mock-hash')
  })
})

// Utility functions for tests
export const waitFor = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const createMockEvent = (type: string, data: any = {}) => ({
  type,
  ...data
})

export const mockConsole = () => {
  const originalConsole = { ...console }

  return {
    restore: () => {
      Object.assign(console, originalConsole)
    },
    mock: {
      log: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn()
    }
  }
}
