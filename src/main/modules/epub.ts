import path from 'path'
import getEpubCover from 'get-epub-cover'
import AdmZip from 'adm-zip'
import { app } from 'electron'
import { PORT } from './express'
import md5 from 'md5'
import convert from 'xml-js'
import fs from 'fs/promises'

function unzipEpub(filePath: string, outDir: string): string {
  const outputDirUrl = path.join(app.getPath('appData'), 'public', outDir) // Crea
  const zip = new AdmZip(filePath)
  zip.extractAllTo(outputDirUrl, true)
  return outputDirUrl
}
async function parseEpub(outputDir: string): Promise<void> {
  try {
    const containerPath = path.join(outputDir, 'META-INF', 'container.xml')

    const containerData = await fs.readFile(containerPath, 'utf8')
    const containerObj = convert.xml2js(containerData, { compact: true })
    const opfFilePath = containerObj.container.rootfiles.rootfile._attributes['full-path']
    const opfFileData = await fs.readFile(path.join(outputDir, opfFilePath), 'utf8')
    const opfFileObj = convert.xml2js(opfFileData, { compact: true }).package
    const manifest = opfFileObj.manifest.item.map((item: any) => item._attributes)
    interface ManifestAttr {
      id: string
      href: string
      mediaType: string
    }
    const manifestMap: Map<string, ManifestAttr> = new Map()
    manifest.forEach((item: ManifestAttr) => {
      manifestMap.set(item.id, { ...item, mediaType: item['media-type'] })
    })
    const opfDir = path.dirname(opfFilePath)

    // console.log({ manifest })
    const spine = opfFileObj.spine.itemref
      .map((item: any) => item._attributes)
      .map((item: any) => {
        const manifestItem = manifestMap.get(item.idref)
        if (!manifestItem) {
          return {}
        }
        return {
          idref: item.idref,
          route: routeFromPath(path.join(outputDir, opfDir, manifestItem.href)),
          mediaType: manifestItem.mediaType
        }
      })
    console.log({ spine })
  } catch (e) {
    if (e instanceof Error) {
      console.log({ messege: 'Failed to parse epub', error: e.message })
    }
    console.log({ messege: 'Failed to parse epub', error: e })
  }
}
export function routeFromPath(path: string): string | null {
  const regex = /public\/(.*)$/
  const match = path.match(regex)
  if (!match) {
    return null
  }

  const strippedFileUrl = match[1]
  const route = `http://localhost:${PORT}/${strippedFileUrl}`
  return route
}
export default async function getCoverImage(filePath: string): Promise<string | null> {
  const outDir = md5(filePath)
  const outDirUrl = unzipEpub(filePath, outDir)

  parseEpub(outDirUrl)
  return getEpubCover(outDirUrl)
    .then((path) => {
      return routeFromPath(path)
    })
    .catch((err) => {
      console.log('Failed to get cover image', err)
      return null
    })
}
