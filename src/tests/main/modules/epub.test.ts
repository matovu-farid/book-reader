import type { ManifestAttr } from 'src/shared/types'
import { classifyAssets } from 'src/main/modules/classifyAssets'
import { describe, expect, it } from 'vitest'

describe('classify assets', () => {
  it('should classify non css, xml and font items to other', () => {
    const manifest: ManifestAttr[] = [
      {
        id: 'id',
        href: 'href',
        'media-type': 'media-type'
      }
    ]
    const classifiedAssets = classifyAssets(manifest)
    expect(classifiedAssets).toEqual({
      css: [],
      font: [],
      xml: [],
      other: [
        {
          id: 'id',
          href: 'href',
          'media-type': 'media-type'
        }
      ]
    })
    // Test case
  })
  it('should classify css items to css', () => {
    const manifest: ManifestAttr[] = [
      {
        id: 'id',
        href: 'href',
        'media-type': 'text/css'
      }
    ]
    const classifiedAssets = classifyAssets(manifest)
    expect(classifiedAssets).toEqual({
      css: [
        {
          id: 'id',
          href: 'href',
          'media-type': 'text/css'
        }
      ],
      font: [],
      xml: [],
      other: []
    })
    //   // Test case
  }),
    it('should classify font items to font', () => {
      const manifest: ManifestAttr[] = [
        {
          id: 'id',
          href: 'href',
          'media-type': 'application/x-font-ttf'
        }
      ]
      const classifiedAssets = classifyAssets(manifest)
      expect(classifiedAssets).toEqual({
        css: [],
        font: [
          {
            id: 'id',
            href: 'href',
            'media-type': 'application/x-font-ttf'
          }
        ],
        xml: [],
        other: []
      })
      //   // Test case
    })
})
