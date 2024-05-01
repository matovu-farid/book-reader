import type { ManifestAttr } from 'src/shared/types'
import { classifyAssets } from 'src/main/modules/classifyAssets'
import { describe, expect, it } from 'vitest'

describe('classify assets', () => {
  it('should classify non css, xml and font items to other', () => {
    const item = {
      id: 'id',
      href: 'href',
      'media-type': 'media-type'
    }
    const manifest: ManifestAttr[] = [item]
    const classifiedAssets = classifyAssets(manifest)
    expect(classifiedAssets).toMatchObject({
      other: [item]
    })
    // Test case
  })

  it.each(
    Array.from(
      Object.entries({
        'text/css': 'css',
        'application/x-font-ttf': 'font',
        'application/x-font-truetype': 'font',
        'application/x-font-opentype': 'font',
        'application/font-woff': 'font',
        'application/font-woff2': 'font',
        'application/vnd.ms-fontobject': 'font',
        'application/font-sfnt': 'font',
        'application/xhtml+xml': 'xml'
      })
    ).map(([mediaType, type]) => ({ mediaType, type }))
  )('should classify $mediaType to $type', ({ mediaType, type }) => {
    const item = {
      id: 'id',
      href: 'href',
      'media-type': mediaType
    }
    const manifest: ManifestAttr[] = [item]
    const classifiedAssets = classifyAssets(manifest)
    expect(classifiedAssets).toMatchObject({
      [type]: [item]
    })
  })
})
