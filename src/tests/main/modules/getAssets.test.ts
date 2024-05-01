import { PUBLIC } from 'src/main/modules/epub_constants'
import { getAssets } from 'src/main/modules/getAssets'
import { PORT } from 'src/main/modules/PORT'
import { describe, it, expect } from 'vitest'

describe('getAssets', () => {
  it('should return assets', async () => {
    const manifest = [
      {
        id: 'id',
        href: `${PUBLIC}/href`,
        'media-type': 'text/css'
      }
    ]
    const workingFolder = 'workingFolder'
    const assets = await getAssets(manifest, workingFolder)

    expect(assets).toMatchObject({
      css: [
        {
          id: 'id',
          href: `http://localhost:${PORT}/href`,
          'media-type': 'text/css',
          properties: {}
        }
      ]
    })
  })
})
