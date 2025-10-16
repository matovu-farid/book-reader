import { vi, beforeEach, afterEach } from 'vitest'
import type { RenderHookResult } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import type { ParagraphWithCFI } from '../../shared/types'

// Global test setup and teardown
export const setupTestEnvironment = () => {
  beforeEach(() => {
    // Mock global objects
    global.HTMLAudioElement = class MockAudioElement {
      play = vi.fn().mockResolvedValue(undefined)
      pause = vi.fn()
      addEventListener = vi.fn()
      removeEventListener = vi.fn()
      src = ''
      currentTime = 0
      paused = true
      ended = false
      error = null
      duration = 10
      volume = 1
      load = vi.fn()
      canPlayType = vi.fn().mockReturnValue('probably')
    } as any

    // Mock window.functions
    global.window = {
      ...global.window,
      functions: {
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
      }
    } as any
  })

  afterEach(() => {
    vi.clearAllMocks()
  })
}

// Helper to create mock paragraphs for testing
export const createTestParagraphs = (count: number): ParagraphWithCFI[] =>
  Array.from({ length: count }, (_, index) => ({
    cfiRange: `epubcfi(/6/4[chapter01]/2/${index}:0)`,
    text: `This is test paragraph ${index + 1} with some sample text content for testing purposes.`,
    element: document.createElement('p')
  }))

// Helper to create mock book data
export const createTestBook = (id: string = 'test-book-1') => ({
  id,
  title: 'Test Book',
  epubUrl: 'http://localhost:3000/test-book.epub',
  currentBookId: 'epubcfi(/6/4[chapter01]/2/1:0)',
  assets: []
})

// Helper for testing async operations with timeouts
export const waitForAsync = async (fn: () => Promise<any>, timeout = 5000) => {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      await fn()
      return
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }
  throw new Error(`Operation timed out after ${timeout}ms`)
}

// Helper to test hook state changes
export const expectHookStateChange = <T>(
  result: RenderHookResult<T, any>,
  expectedState: Partial<T>,
  timeout = 1000
) => {
  return new Promise<void>((resolve, reject) => {
    const start = Date.now()
    const checkState = () => {
      const currentState = result.result.current
      const matches = Object.entries(expectedState).every(([key, value]) => {
        return (currentState as any)[key] === value
      })

      if (matches) {
        resolve()
      } else if (Date.now() - start > timeout) {
        reject(new Error(`State did not match expected values within ${timeout}ms`))
      } else {
        setTimeout(checkState, 10)
      }
    }
    checkState()
  })
}

// Helper to simulate audio events
export const simulateAudioEvent = (
  audioElement: HTMLAudioElement,
  eventType: 'ended' | 'error' | 'loadstart' | 'canplay',
  eventData?: any
) => {
  const event = new Event(eventType)
  if (eventData) {
    Object.assign(event, eventData)
  }
  audioElement.dispatchEvent(event)
}

// Helper to create mock file system for Node.js tests
export const createMockFileSystem = () => {
  const files = new Map<string, Buffer>()
  const directories = new Set<string>()

  return {
    files,
    directories,
    mkdir: vi.fn().mockImplementation((path: string) => {
      directories.add(path)
      return Promise.resolve()
    }),
    writeFile: vi.fn().mockImplementation((path: string, data: Buffer) => {
      files.set(path, data)
      return Promise.resolve()
    }),
    readFile: vi.fn().mockImplementation((path: string) => {
      const data = files.get(path)
      if (!data) {
        throw new Error(`File not found: ${path}`)
      }
      return Promise.resolve(data)
    }),
    unlink: vi.fn().mockImplementation((path: string) => {
      files.delete(path)
      return Promise.resolve()
    }),
    stat: vi.fn().mockImplementation((path: string) => {
      const isDir = directories.has(path)
      const isFile = files.has(path)

      if (!isDir && !isFile) {
        throw new Error(`Path not found: ${path}`)
      }

      return Promise.resolve({
        size: isFile ? files.get(path)!.length : 0,
        mtime: new Date(),
        isFile: () => isFile,
        isDirectory: () => isDir
      })
    }),
    readdir: vi.fn().mockImplementation((path: string) => {
      const filesInDir = Array.from(files.keys())
        .filter((filePath) => filePath.startsWith(path))
        .map((filePath) => filePath.replace(path + '/', ''))
      return Promise.resolve(filesInDir)
    })
  }
}

// Helper for testing event emission
export const createEventTester = <T extends (...args: any[]) => void>(emitter: {
  on: (event: string, listener: T) => void
  emit: (event: string, ...args: any[]) => void
}) => {
  const listeners = new Map<string, T[]>()

  return {
    on: (event: string, listener: T) => {
      if (!listeners.has(event)) {
        listeners.set(event, [])
      }
      listeners.get(event)!.push(listener)
      emitter.on(event, listener)
    },
    emit: (event: string, ...args: any[]) => {
      emitter.emit(event, ...args)
    },
    getListeners: (event: string) => listeners.get(event) || [],
    removeAllListeners: () => {
      listeners.clear()
    }
  }
}
