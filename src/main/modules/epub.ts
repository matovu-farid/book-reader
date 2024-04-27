import path from 'path'
import getEpubCover from 'get-epub-cover'
import AdmZip from 'adm-zip'
import { app } from 'electron'
import { PORT } from './express'
import md5 from 'md5'
import convert from 'xml-js'
import fs from 'fs/promises'
import type { Book, ManifestAttr, OPF, Container, Store } from '../../shared/types'

export function getBookPath(): string {
  const bookPath = path.join(app.getPath('appData'), 'public', 'books')
  fs.access(bookPath).catch(() => fs.mkdir(bookPath, { recursive: true }))
  return bookPath
}

export async function saveBookStore(data: Store, outputDir: string): Promise<string> {
  const jsonString = JSON.stringify(data)
  const bookStorePath = path.join(getBookPath(), outputDir, 'store.json')
  await fs.writeFile(bookStorePath, jsonString)
  return bookStorePath
}

export function fetchBookStoreData(bookStorePath: string): Promise<Store> {
  return fs
    .readFile(bookStorePath)
    .then((data) => JSON.parse(data.toString()))
    .catch(() => ({ currentBookId: 0 }))
}

export async function getBookStore(bookFolder: string): Promise<Store> {
  const bookStorePath = path.join(getBookPath(), bookFolder, 'store.json')
  return fs
    .access(bookStorePath)
    .then(() => fetchBookStoreData(bookStorePath))
    .catch(() => {
      return saveBookStore({ currentBookId: 0 }, bookFolder).then(() =>
        fetchBookStoreData(bookStorePath)
      )
    })
}

export function updateCurrentBookId(bookFolder: string, currentBookId: number): Promise<string> {
  return getBookStore(bookFolder).then((store) => {
    store.currentBookId = currentBookId
    return saveBookStore(store, bookFolder)
  })
}

function unzipEpub(filePath: string, outDir: string): string {
  const outputDirUrl = path.join(getBookPath(), outDir) // Crea

  const zip = new AdmZip(filePath)
  zip.extractAllTo(outputDirUrl, true)
  return outputDirUrl
}

async function parseEpub(outputDir: string): Promise<Book> {
  const outputDirUrl = path.join(getBookPath(), outputDir)
  try {
    const containerPath = path.join(outputDirUrl, 'META-INF', 'container.xml')

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
    const store = await getBookStore(outputDir)

    return {
      currentBookId: store.currentBookId,
      id: md5(outputDirUrl),
      cover: (await getCoverRoute(outputDirUrl)) || '',
      spine,
      title,
      internalFolderName: outputDir
    }
  } catch (e) {
    if (e instanceof Error) {
      console.log({ messege: 'Failed to parse epub', error: e.message })
    }
    console.log({ messege: 'Failed to parse epub', error: e })
    return {
      currentBookId: 0,
      id: md5(outputDirUrl),
      cover: '',
      spine: [],
      title: '',
      internalFolderName: outputDir
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
