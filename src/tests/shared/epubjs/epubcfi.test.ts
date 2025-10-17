import { describe, it, expect } from 'vitest'
import EpubCFI from '@epubjs/epubcfi'

describe('EpubCFI', () => {
  let epubcfi: EpubCFI

  beforeEach(() => {
    epubcfi = new EpubCFI()
  })

  describe('constructor', () => {
    it('should create a new EpubCFI instance', () => {
      expect(epubcfi).toBeInstanceOf(EpubCFI)
    })
  })

  describe('isCfiString', () => {
    it('should return true for valid CFI strings', () => {
      expect(epubcfi.isCfiString('epubcfi(/6/14[chap01ref]!/4/2/1:0)')).toBe(true)
      expect(epubcfi.isCfiString('epubcfi(/6/4[body01]/10[para05]/3:10)')).toBe(true)
    })

    it('should return false for invalid CFI strings', () => {
      expect(epubcfi.isCfiString('not-a-cfi')).toBe(false)
      expect(epubcfi.isCfiString('')).toBe(false)
      expect(epubcfi.isCfiString('epubcfi(invalid)')).toBe(false)
    })

    it('should return false for non-string inputs', () => {
      expect(epubcfi.isCfiString(null as any)).toBe(false)
      expect(epubcfi.isCfiString(undefined as any)).toBe(false)
      expect(epubcfi.isCfiString(123 as any)).toBe(false)
    })
  })

  describe('parse', () => {
    it('should parse valid CFI strings', () => {
      const result = epubcfi.parse('epubcfi(/6/14[chap01ref]!/4/2/1:0)')
      expect(result).toBeDefined()
      expect(result).toHaveProperty('steps')
      expect(result).toHaveProperty('range')
    })

    it('should return null for invalid CFI strings', () => {
      const result = epubcfi.parse('invalid-cfi')
      expect(result).toBeNull()
    })
  })

  describe('pathToStepArray', () => {
    it('should convert path to step array', () => {
      const steps = epubcfi.pathToStepArray('/6/14[chap01ref]!/4/2/1')
      expect(steps).toEqual(['6', '14[chap01ref]', '!', '4', '2', '1'])
    })

    it('should handle empty path', () => {
      const steps = epubcfi.pathToStepArray('')
      expect(steps).toEqual([])
    })
  })

  describe('stepToNode', () => {
    it('should handle node steps', () => {
      const result = epubcfi.stepToNode('6')
      expect(result).toBeDefined()
      expect(result).toHaveProperty('type', 'node')
      expect(result).toHaveProperty('value', 6)
    })

    it('should handle idref steps', () => {
      const result = epubcfi.stepToNode('14[chap01ref]')
      expect(result).toBeDefined()
      expect(result).toHaveProperty('type', 'idref')
      expect(result).toHaveProperty('value', '14')
      expect(result).toHaveProperty('idref', 'chap01ref')
    })

    it('should handle character steps', () => {
      const result = epubcfi.stepToNode('1:0')
      expect(result).toBeDefined()
      expect(result).toHaveProperty('type', 'text')
      expect(result).toHaveProperty('value', '1')
      expect(result).toHaveProperty('offset', 0)
    })
  })

  describe('createCFI', () => {
    it('should create CFI from range', () => {
      // Mock DOM elements
      const mockElement = {
        tagName: 'p',
        childNodes: [
          { nodeType: 3, textContent: 'Hello World' } // Text node
        ]
      } as any

      const mockRange = {
        startContainer: mockElement.childNodes[0],
        startOffset: 0,
        endContainer: mockElement.childNodes[0],
        endOffset: 5
      } as any

      // Mock document structure
      const mockDocument = {
        body: mockElement,
        getElementById: () => mockElement
      } as any

      const result = epubcfi.createCFI(mockRange, mockDocument)
      expect(result).toBeDefined()
      expect(typeof result).toBe('string')
      expect(result).toMatch(/^epubcfi\(/)
    })
  })

  describe('range', () => {
    it('should create range from CFI', () => {
      // Mock document
      const mockDocument = {
        createRange: () => ({
          setStart: () => {},
          setEnd: () => {},
          collapse: () => {}
        }),
        body: {
          childNodes: [{ nodeType: 1, tagName: 'p' }]
        }
      } as any

      const result = epubcfi.range('epubcfi(/6/1:0)', mockDocument)
      expect(result).toBeDefined()
    })

    it('should return null for invalid CFI', () => {
      const mockDocument = {} as any
      const result = epubcfi.range('invalid-cfi', mockDocument)
      expect(result).toBeNull()
    })
  })

  describe('compare', () => {
    it('should compare CFI strings correctly', () => {
      const cfi1 = 'epubcfi(/6/1:0)'
      const cfi2 = 'epubcfi(/6/2:0)'

      const result = epubcfi.compare(cfi1, cfi2)
      expect(typeof result).toBe('number')
    })
  })
})
