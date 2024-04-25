import path from 'path'
import getEpubCover from 'get-epub-cover'
import AdmZip from 'adm-zip'
import { app } from 'electron'
import { PORT } from './express'
import md5 from 'md5'
import convert from 'xml-js'
import fs from 'fs/promises'

interface ManifestAttr {
  id: string
  href: string
  'media-type': string
  properties?: string
}

interface OPF {
  package: {
    metadata: { 'dc:title': { _text: string } }
    manifest: { item: { _attributes: ManifestAttr }[] }
    spine: { itemref: { _attributes: { idref: string } }[] }
    guide: unknown
  }
}

interface Container {
  container: {
    rootfiles: {
      rootfile: { _attributes: { 'full-path': string } }
    }
  }
}

interface Book {
  cover: string
  spine: { idref: string; route: string; mediaType: string }[]
  title: string
}

export function getBookPath(): string {
  const bookPath = path.join(app.getPath('appData'), 'public', 'books')
  fs.access(bookPath).catch(() => fs.mkdir(bookPath, { recursive: true }))
  return bookPath
}

function unzipEpub(filePath: string, outDir: string): string {
  const outputDirUrl = path.join(getBookPath(), outDir) // Crea
  const zip = new AdmZip(filePath)
  zip.extractAllTo(outputDirUrl, true)
  return outputDirUrl
}
async function parseEpub(outputDir: string): Promise<Book> {
  try {
    const outputDirUrl = path.join(getBookPath(), outputDir)
    const containerPath = path.join(outputDirUrl, 'META-INF', 'container.xml')
    console.log({ containerPath })

    const containerData = await fs.readFile(containerPath, 'utf8')
    const containerObj = convert.xml2js(containerData, { compact: true }) as Container
    const opfFilePath = containerObj.container.rootfiles.rootfile._attributes['full-path']
    const opfFileData = await fs.readFile(path.join(outputDirUrl, opfFilePath), 'utf8')
    const opf: OPF = convert.xml2js(opfFileData, { compact: true }) as OPF

    const opfFileObj = opf.package
    const manifest: ManifestAttr[] = opfFileObj.manifest.item.map((item) => item._attributes)

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
        return {
          idref: item.idref,
          route: routeFromPath(path.join(outputDirUrl, opfDir, manifestItem.href)) || '',
          mediaType: manifestItem['media-type']
        }
      })
    return {
      cover: (await getCoverRoute(outputDirUrl)) || '',
      spine,
      title
    }
  } catch (e) {
    if (e instanceof Error) {
      console.log({ messege: 'Failed to parse epub', error: e.message })
    }
    console.log({ messege: 'Failed to parse epub', error: e })
    return {
      cover: '',
      spine: [],
      title: ''
    }
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
export function getCoverRoute(outDirUrl: string): Promise<string | null> {
  return getEpubCover(outDirUrl)
    .then((path) => {
      return routeFromPath(path)
    })
    .catch((err) => {
      console.log('Failed to get cover image', err)
      return null
    })
}
export default async function getCoverImage(filePath: string): Promise<string | null> {
  const outDir = md5(filePath)
  const outDirUrl = unzipEpub(filePath, outDir)

  return getCoverRoute(outDirUrl)
}

export async function getBooks(): Promise<Book[]> {
  const booksPaths = await fs.readdir(getBookPath())
  return Promise.all(booksPaths.map(async (bookPath) => parseEpub(bookPath)))
}
