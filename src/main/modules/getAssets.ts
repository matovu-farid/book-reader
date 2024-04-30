import path from 'path'
import type { ManifestAttr } from '../../shared/types'
import { classifyAssets } from './classifyAssets'
import { getRouteFromRelativePath } from './getRouteFromRelativePath'

export async function getAssets(manifest: ManifestAttr[], workingFolder: string) {
  const assets = classifyAssets(manifest)
  delete assets['other']

  Object.entries(assets).forEach(([key, value]) => {
    value.forEach((file) => {
      file.href = getRouteFromRelativePath(workingFolder, file.href)
      if (!file.properties) {
        file.properties = {}
      }
      if (key === 'font') file.properties['name'] = path.basename(file.href)
    })
  })

  return assets
}
