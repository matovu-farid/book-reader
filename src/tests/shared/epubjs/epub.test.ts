import { describe, it, expect, vi } from 'vitest'
import ePub from '@epubjs'

// Mock the Book class to avoid actual file loading
vi.mock('@epubjs/book', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      open: vi.fn().mockResolvedValue(undefined),
      loaded: Promise.resolve(),
      ready: Promise.resolve(),
      opened: Promise.resolve(),
      metadata: {},
      packaging: {},
      navigation: {},
      pageList: {},
      locations: {
        length: () => 100
      },
      spine: {
        items: []
      },
      coverUrl: vi.fn().mockResolvedValue(''),
      load: vi.fn().mockResolvedValue(''),
      destroy: vi.fn()
    }))
  }
})

describe('ePub', () => {
  describe('ePub function', () => {
    it('should create a new Book instance', () => {
      const book = ePub('/path/to/book.epub')
      expect(book).toBeDefined()
      expect(typeof book.open).toBe('function')
      expect(typeof book.loaded).toBe('object') // Promise
    })

    it('should accept ArrayBuffer', () => {
      const buffer = new ArrayBuffer(1024)
      const book = ePub(buffer)
      expect(book).toBeDefined()
    })

    it('should accept options', () => {
      const options = {
        openAs: 'epub',
        encoding: 'binary'
      }
      const book = ePub('/path/to/book.epub', options)
      expect(book).toBeDefined()
    })
  })

  describe('ePub static properties', () => {
    it('should have VERSION property', () => {
      expect(ePub.VERSION).toBeDefined()
      expect(typeof ePub.VERSION).toBe('string')
    })

    it('should have Book property', () => {
      expect(ePub.Book).toBeDefined()
      expect(typeof ePub.Book).toBe('function')
    })

    it('should have Rendition property', () => {
      expect(ePub.Rendition).toBeDefined()
      expect(typeof ePub.Rendition).toBe('function')
    })

    it('should have Contents property', () => {
      expect(ePub.Contents).toBeDefined()
      expect(typeof ePub.Contents).toBe('function')
    })

    it('should have CFI property', () => {
      expect(ePub.CFI).toBeDefined()
      expect(typeof ePub.CFI).toBe('function')
    })

    it('should have utils property', () => {
      expect(ePub.utils).toBeDefined()
      expect(typeof ePub.utils).toBe('object')
    })
  })

  describe('global EPUBJS_VERSION', () => {
    it('should set global EPUBJS_VERSION', () => {
      // Check if global is available (in browser environment)
      if (typeof global !== 'undefined') {
        expect((global as any).EPUBJS_VERSION).toBeDefined()
        expect(typeof (global as any).EPUBJS_VERSION).toBe('string')
      }
    })
  })
})
