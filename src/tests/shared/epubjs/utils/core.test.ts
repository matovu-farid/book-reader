import { describe, it, expect } from 'vitest'
import { uuid, isNumber, isFloat, bounds, extend } from '@epubjs/utils/core'

describe('Core Utils', () => {
  describe('uuid', () => {
    it('should generate a valid UUID', () => {
      const id = uuid()
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    })

    it('should generate unique UUIDs', () => {
      const id1 = uuid()
      const id2 = uuid()
      expect(id1).not.toBe(id2)
    })
  })

  describe('isNumber', () => {
    it('should return true for valid numbers', () => {
      expect(isNumber(42)).toBe(true)
      expect(isNumber(0)).toBe(true)
      expect(isNumber(-42)).toBe(true)
      expect(isNumber(3.14)).toBe(true)
    })

    it('should return false for non-numbers', () => {
      expect(isNumber('42')).toBe(false)
      expect(isNumber(null)).toBe(false)
      expect(isNumber(undefined)).toBe(false)
      expect(isNumber(NaN)).toBe(false)
      expect(isNumber([])).toBe(false)
      expect(isNumber({})).toBe(false)
    })
  })

  describe('isFloat', () => {
    it('should return true for valid floats', () => {
      expect(isFloat(3.14)).toBe(true)
      expect(isFloat(0.5)).toBe(true)
      expect(isFloat(-3.14)).toBe(true)
    })

    it('should return false for integers', () => {
      expect(isFloat(42)).toBe(false)
      expect(isFloat(0)).toBe(false)
      expect(isFloat(-42)).toBe(false)
    })

    it('should return false for non-numbers', () => {
      expect(isFloat('3.14')).toBe(false)
      expect(isFloat(null)).toBe(false)
      expect(isFloat(undefined)).toBe(false)
    })
  })

  describe('bounds', () => {
    it('should return correct bounds for element', () => {
      // Create a mock element
      const mockElement = {
        getBoundingClientRect: () => ({
          top: 10,
          left: 20,
          bottom: 50,
          right: 80,
          width: 60,
          height: 40
        })
      } as any

      const result = bounds(mockElement)
      expect(result).toEqual({
        top: 10,
        left: 20,
        bottom: 50,
        right: 80,
        width: 60,
        height: 40
      })
    })
  })

  describe('extend', () => {
    it('should extend objects correctly', () => {
      const target = { a: 1, b: 2 }
      const source = { b: 3, c: 4 }

      const result = extend(target, source)
      expect(result).toEqual({ a: 1, b: 3, c: 4 })
    })

    it('should handle empty objects', () => {
      const target = {}
      const source = { a: 1, b: 2 }

      const result = extend(target, source)
      expect(result).toEqual({ a: 1, b: 2 })
    })

    it('should handle multiple source objects', () => {
      const target = { a: 1 }
      const source1 = { b: 2 }
      const source2 = { c: 3 }

      const result = extend(target, source1, source2)
      expect(result).toEqual({ a: 1, b: 2, c: 3 })
    })
  })
})
