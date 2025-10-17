import { describe, it, expect, beforeEach, vi } from 'vitest'
import Book from '@epubjs/book'

describe('Book', () => {
  let book: Book

  beforeEach(() => {
    // Mock the Book constructor to avoid actual file loading
    vi.spyOn(Book.prototype, 'open').mockResolvedValue(undefined)
    book = new Book('/path/to/test.epub')
  })

  describe('constructor', () => {
    it('should create a new Book instance', () => {
      expect(book).toBeInstanceOf(Book)
    })

    it('should accept URL or ArrayBuffer', () => {
      const bookFromUrl = new Book('/path/to/book.epub')
      const bookFromBuffer = new Book(new ArrayBuffer(1024))

      expect(bookFromUrl).toBeInstanceOf(Book)
      expect(bookFromBuffer).toBeInstanceOf(Book)
    })
  })

  describe('open', () => {
    it('should return a promise', () => {
      const result = book.open()
      expect(result).toBeInstanceOf(Promise)
    })
  })

  describe('loaded', () => {
    it('should return a promise', () => {
      const result = book.loaded
      expect(result).toBeInstanceOf(Promise)
    })
  })

  describe('ready', () => {
    it('should return a promise', () => {
      const result = book.ready
      expect(result).toBeInstanceOf(Promise)
    })
  })

  describe('opened', () => {
    it('should return a promise', () => {
      const result = book.opened
      expect(result).toBeInstanceOf(Promise)
    })
  })

  describe('metadata', () => {
    it('should have metadata property', () => {
      expect(book.metadata).toBeDefined()
    })
  })

  describe('packaging', () => {
    it('should have packaging property', () => {
      expect(book.packaging).toBeDefined()
    })
  })

  describe('navigation', () => {
    it('should have navigation property', () => {
      expect(book.navigation).toBeDefined()
    })
  })

  describe('pageList', () => {
    it('should have pageList property', () => {
      expect(book.pageList).toBeDefined()
    })
  })

  describe('locations', () => {
    it('should have locations property', () => {
      expect(book.locations).toBeDefined()
    })
  })

  describe('coverUrl', () => {
    it('should return a promise', () => {
      const result = book.coverUrl()
      expect(result).toBeInstanceOf(Promise)
    })
  })

  describe('load', () => {
    it('should load a resource', () => {
      const result = book.load('path/to/resource')
      expect(result).toBeInstanceOf(Promise)
    })
  })

  describe('destroy', () => {
    it('should clean up resources', () => {
      book.destroy()
      // No return value to test, just ensure no error
      expect(true).toBe(true)
    })
  })
})
