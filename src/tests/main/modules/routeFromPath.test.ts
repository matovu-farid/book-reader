import { routeFromPath } from 'src/main/modules/routeFromPath'
import { describe, it, expect } from 'vitest'

describe('routeFromPath', () => {
  it('should return a route from a path', () => {
    const path = 'public/cover.jpg'
    const port = 3000
    const regex = /public\/(.*)$/
    const result = routeFromPath(path, port, regex)
    expect(result).toBe('http://localhost:3000/cover.jpg')
  })
  it('should return null if the path does not match the regex', () => {
    const path = 'cover.jpg'
    const port = 3000
    const regex = /public\/(.*)$/
    const result = routeFromPath(path, port, regex)
    expect(result).toBe(null)
  })
})
