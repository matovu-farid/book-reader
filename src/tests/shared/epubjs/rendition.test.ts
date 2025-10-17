import { describe, it, expect, beforeEach, vi } from 'vitest'
import Rendition from '@epubjs/rendition'
import Book from '@epubjs/book'

describe('Rendition', () => {
  let mockBook: Book
  let rendition: Rendition

  beforeEach(() => {
    // Create a mock Book instance
    mockBook = {
      opened: Promise.resolve(),
      loaded: Promise.resolve(),
      ready: Promise.resolve(),
      locations: {
        length: () => 100
      },
      spine: {
        items: []
      }
    } as any

    rendition = new Rendition(mockBook)
  })

  describe('constructor', () => {
    it('should create a new Rendition instance', () => {
      expect(rendition).toBeInstanceOf(Rendition)
      expect(rendition.book).toBe(mockBook)
    })

    it('should accept options', () => {
      const options = {
        width: 800,
        height: 600,
        manager: 'default'
      }
      const renditionWithOptions = new Rendition(mockBook, options)
      expect(renditionWithOptions).toBeInstanceOf(Rendition)
    })
  })

  describe('start', () => {
    it('should return a promise', () => {
      const result = rendition.start()
      expect(result).toBeInstanceOf(Promise)
    })
  })

  describe('display', () => {
    it('should return a promise', () => {
      const result = rendition.display('chapter1.xhtml')
      expect(result).toBeInstanceOf(Promise)
    })

    it('should accept CFI string', () => {
      const result = rendition.display('epubcfi(/6/1:0)')
      expect(result).toBeInstanceOf(Promise)
    })
  })

  describe('attachTo', () => {
    it('should attach to DOM element', () => {
      const mockElement = document.createElement('div')
      const result = rendition.attachTo(mockElement)
      expect(result).toBeInstanceOf(Promise)
    })
  })

  describe('resize', () => {
    it('should resize rendition', () => {
      rendition.resize(800, 600)
      // No return value to test, just ensure no error
      expect(true).toBe(true)
    })
  })

  describe('clear', () => {
    it('should clear rendition', () => {
      rendition.clear()
      // No return value to test, just ensure no error
      expect(true).toBe(true)
    })
  })

  describe('themes', () => {
    it('should have themes property', () => {
      expect(rendition.themes).toBeDefined()
    })
  })

  describe('annotations', () => {
    it('should have annotations property', () => {
      expect(rendition.annotations).toBeDefined()
    })
  })

  describe('location', () => {
    it('should return current location', () => {
      const location = rendition.location
      expect(location).toBeDefined()
    })
  })

  describe('settings', () => {
    it('should have settings property', () => {
      expect(rendition.settings).toBeDefined()
    })

    it('should allow setting properties', () => {
      rendition.settings.width = 800
      rendition.settings.height = 600
      expect(rendition.settings.width).toBe(800)
      expect(rendition.settings.height).toBe(600)
    })
  })

  describe('manager', () => {
    it('should have manager property', () => {
      expect(rendition.manager).toBeDefined()
    })
  })

  describe('hooks', () => {
    it('should have hooks property', () => {
      expect(rendition.hooks).toBeDefined()
    })
  })

  describe('next', () => {
    it('should navigate to next section', () => {
      const result = rendition.next()
      expect(result).toBeInstanceOf(Promise)
    })
  })

  describe('prev', () => {
    it('should navigate to previous section', () => {
      const result = rendition.prev()
      expect(result).toBeInstanceOf(Promise)
    })
  })

  describe('destroy', () => {
    it('should clean up rendition', () => {
      rendition.destroy()
      // No return value to test, just ensure no error
      expect(true).toBe(true)
    })
  })
})
