import { app } from 'electron'
import { BOOKS } from 'src/main/modules/epub_constants'
import { getAssets } from 'src/main/modules/getAssets'
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

describe('getAssets', () => {
  it('should return assets', async () => {
    vi.mocked(app.getPath).mockReturnValue('appData')
    const manifest = [
      {
        id: 'id',
        href: `href`,
        'media-type': 'text/css'
      }
    ]
    const workingFolder = 'workingFolder'
    const assets = await getAssets(manifest, workingFolder)

    expect(assets).toMatchObject({
      css: [
        {
          id: 'id',
          href: `http://localhost:${PORT}/${BOOKS}/${workingFolder}/href`,
          'media-type': 'text/css',
          properties: {}
        }
      ]
    })
  })
})
