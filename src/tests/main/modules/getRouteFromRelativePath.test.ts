import { BOOKS } from 'src/main/modules/epub_constants'
import { getRouteFromRelativePath } from 'src/main/modules/getRouteFromRelativePath'
import { PORT } from 'src/main/modules/PORT'
import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => 'appData')
  }
}))
vi.mock('fs/promises', async () => ({
  ...(await vi.importActual('fs/promises')),
  mkdir: vi.fn(),
  access: vi.fn()
}))
describe('getRouteFromRelativePath', () => {
  it('should return the route from a relative path', () => {
    const path = getRouteFromRelativePath('bookFolder', 'relativePath')

    expect(path).toBe(`http://localhost:${PORT}/${BOOKS}/bookFolder/relativePath`)
  })
  it('should return the book folder with an empty path', () => {
    const path = getRouteFromRelativePath('bookFolder', '')

    expect(path).toBe(`http://localhost:${PORT}/${BOOKS}/bookFolder`)
  })

  it('should return create a route to the parent directory when ".." is a prefix to the path', () => {
    const path = getRouteFromRelativePath('bookFolder', '../relativePath')

    expect(path).toBe(`http://localhost:${PORT}/${BOOKS}/relativePath`)
    const path2 = getRouteFromRelativePath('bookFolder', '../../relativePath')
    expect(path2).toBe(`http://localhost:${PORT}/relativePath`)
  })
})
