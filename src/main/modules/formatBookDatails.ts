import path from 'path'
import type { ManifestAttr, OPFFileObj } from '../../shared/types'
import { routeFromPath } from './routeFromPath'
import { PORT } from './PORT'

export function formatBookDatails(
  manifest: ManifestAttr[],
  opfFileObj: OPFFileObj,
  opfFilePath: string,
  absoluteBookPath: string
) {
  const manifestMap: Map<string, ManifestAttr> = new Map()
  manifest.forEach((item: ManifestAttr) => {
    manifestMap.set(item.id, item)
  })
  const metadata = opfFileObj.metadata
  const title = metadata['dc:title']._text
  const opfDir = path.dirname(opfFilePath)

  const spine = opfFileObj.spine.itemref
    .map((item) => item._attributes)
    .map((item) => {
      const manifestItem = manifestMap.get(item.idref)
      if (!manifestItem) {
        return {
          idref: item.idref,
          route: '',
          mediaType: ''
        }
      }
      const regex = /public\/(.*)$/
      return {
        idref: item.idref,
        route:
          routeFromPath(path.join(absoluteBookPath, opfDir, manifestItem.href), PORT, regex) || '',
        mediaType: manifestItem['media-type']
      }
    })
  return { spine, title }
}
