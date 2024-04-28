import path from 'path'
import getEpubCover from 'get-epub-cover'
import AdmZip from 'adm-zip'
import { app } from 'electron'
import { PORT } from './express'
import md5 from 'md5'
import convert from 'xml-js'
import fs from 'fs/promises'
import type { Book, ManifestAttr, OPF, Container, Store, Asset } from '../../shared/types'

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

async function updateBookStore(data: Partial<Store>, outputDir: string): Promise<string> {
  const store = await getBookStore(outputDir)
  const updatedStore = { ...store, ...data }
  return saveBookStore(updatedStore, outputDir)
}

function fetchBookStoreData(bookStorePath: string): Promise<Store> {
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
      return saveBookStore({ currentBookId: '', epubUrl: '' }, bookFolder).then(() =>
        fetchBookStoreData(bookStorePath)
      )
    })
}

export function updateCurrentBookId(bookFolder: string, currentBookId: string): Promise<string> {
  return getBookStore(bookFolder).then((store) => {
    store.currentBookId = currentBookId
    return saveBookStore(store, bookFolder)
  })
}

async function unzipEpub(filePath: string, outDir: string): Promise<string> {
  const outputDirUrl = path.join(getBookPath(), outDir) // Crea

  const zip = new AdmZip(filePath)

  zip.extractAllTo(outputDirUrl, true)

  const newZipFilePath = path.join(outputDirUrl, path.basename(filePath))
  fs.copyFile(filePath, newZipFilePath).then(() => {
    console.log('File was copied to destination', newZipFilePath)
    const epubUrl = getRouteFromRelativePath(outDir, path.basename(filePath))

    updateBookStore({ epubUrl }, outDir)
  })
  return outputDirUrl
}
export function getRouteFromRelativePath(bookFolder: string, relativePath: string) {
  const filePath = path.resolve(getBookPath(), bookFolder, relativePath)
  return routeFromPath(filePath) || ''
}

async function getManifestFiles(bookFolder: string) {
  const absoluteBookPath = path.join(getBookPath(), bookFolder)
  const containerPath = path.join(absoluteBookPath, 'META-INF', 'container.xml')
  const containerData = await fs.readFile(containerPath, 'utf8')
  const containerObj = convert.xml2js(containerData, { compact: true }) as Container
  const opfFilePath = containerObj.container.rootfiles.rootfile._attributes['full-path']
  const workingFolder = path.join(absoluteBookPath, path.dirname(opfFilePath))
  const opfFileData = await fs.readFile(path.join(absoluteBookPath, opfFilePath), 'utf8')
  const opf: OPF = convert.xml2js(opfFileData, { compact: true }) as OPF

  const opfFileObj = opf.package
  const manifest: ManifestAttr[] = opfFileObj.manifest.item.map((item) => item._attributes)
  return { manifest, opfFileObj, opfFilePath, workingFolder }
}
async function getAssets(bookFolder: string) {
  const { manifest, workingFolder } = await getManifestFiles(bookFolder)

  const assetTypes: Record<string, Asset> = {
    'text/css': 'css',
    'application/x-font-ttf': 'font',
    'application/x-font-truetype': 'font',
    'application/x-font-opentype': 'font',
    'application/font-woff': 'font',
    'application/font-woff2': 'font',
    'application/vnd.ms-fontobject': 'font',
    'application/font-sfnt': 'font',
    'application/xhtml+xml': 'xml'
  }
  const assets = Object.groupBy(manifest, (item) => {
    if (!assetTypes[item['media-type']]) {
      return 'other'
    }
    return assetTypes[item['media-type']]
  })
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
async function parseEpub(bookFolder: string): Promise<Book> {
  const assets = await getAssets(bookFolder)

  const store = await getBookStore(bookFolder).catch(() => ({ currentBookId: 0, epubUrl: '' }))

  const absoluteBookPath = path.join(getBookPath(), bookFolder)
  try {
    const { manifest, opfFileObj, opfFilePath } = await getManifestFiles(bookFolder)

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
          route: routeFromPath(path.join(absoluteBookPath, opfDir, manifestItem.href)) || '',
          mediaType: manifestItem['media-type']
        }
      })
    // await updateSpineImageUrls(spine, bookFolder)

    const store = await getBookStore(bookFolder)
    return {
      currentBookId: store.currentBookId,
      id: md5(absoluteBookPath),
      cover: (await getCoverRoute(absoluteBookPath)) || '',
      spine,
      title,
      internalFolderName: bookFolder,
      assets,
      epubUrl: store.epubUrl
    }
  } catch (e) {
    if (e instanceof Error) {
      console.log({ messege: 'Failed to parse epub', error: e.message })
    }
    console.log({ messege: 'Failed to parse epub', error: e })
    return {
      currentBookId: '',
      id: md5(absoluteBookPath),
      cover: '',
      spine: [],
      title: '',
      internalFolderName: bookFolder,
      assets,
      epubUrl: store.epubUrl
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
  const outDirUrl = await unzipEpub(filePath, outDir)

  return getCoverRoute(outDirUrl)
}

export async function getBooks(): Promise<Book[]> {
  const booksPaths = await fs.readdir(getBookPath())
  // await fs.chown(getBookPath(), 1000, 1000)
  // await fs.rmdir(getBookPath())

  return Promise.all(booksPaths.map(async (bookPath) => parseEpub(bookPath)))
}
