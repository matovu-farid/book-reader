import path from 'path'
import AdmZip from 'adm-zip'
import { app } from 'electron'
import { PORT } from './express'
import md5 from 'md5'
import convert from 'xml-js'
import fs from 'fs/promises'
import type { Book, ManifestAttr, OPF, Container, Store, Asset } from '../../shared/types'
import { filetypename } from 'magic-bytes.js'

export function getBookPath(): string {
  try {
    const bookPath = path.join(app.getPath('appData'), 'public', 'books')
    fs.access(bookPath).catch(() => fs.mkdir(bookPath, { recursive: true }))
    return bookPath
  } catch (e) {
    console.log(e)
    return ''
  }
}

async function getEpubCover(bookFolder: string) {
  const { opfFileObj } = await getManifestFiles(bookFolder)
  // Try to find the cover by checking the 'properties' attribute or the id
  const coverItem = opfFileObj.manifest.item.find(
    (item) =>
      (item._attributes['media-type'] === 'image/jpeg' ||
        item._attributes['media-type'] === 'image/png') &&
      (item._attributes.properties?.['cover-image'] ||
        item._attributes.id.toLowerCase().includes('cover'))
  )

  if (coverItem) {
    return coverItem._attributes.href
  }

  // No cover found with specific properties or id hints, checking by file name
  const likelyCover = opfFileObj.manifest.item.find(
    (item) =>
      item._attributes.href.toLowerCase().includes('cover') &&
      (item._attributes['media-type'] === 'image/jpeg' ||
        item._attributes['media-type'] === 'image/png')
  )

  return likelyCover ? likelyCover._attributes.href : ''
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
      return saveBookStore({ currentBookId: 0, epubUrl: '' }, bookFolder).then(() =>
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
  try {
    const assets = await getAssets(bookFolder)

    const store = await getBookStore(bookFolder).catch(() => ({ currentBookId: 0, epubUrl: '' }))

    const absoluteBookPath = path.join(getBookPath(), bookFolder)
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

    return {
      currentBookId: store.currentBookId,
      id: md5(absoluteBookPath),
      cover: (await getCoverRoute(bookFolder)) || '',
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
      currentBookId: 0,
      id: '',
      cover: '',
      spine: [],
      title: '',
      internalFolderName: bookFolder,
      assets: {},
      epubUrl: ''
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

export async function getCoverRoute(bookFolder: string): Promise<string | null> {
  try {
    const cover = await getEpubCover(bookFolder)

    if (!cover) return ''
    const { workingFolder } = await getManifestFiles(bookFolder)
    const coverHref = getRouteFromRelativePath(workingFolder, cover)
    return coverHref
  } catch (error) {
    console.log('Failed to get cover image', error)
    return null
  }
}
export default async function getCoverImage(filePath: string): Promise<string | null> {
  try {
    const outDir = md5(filePath)
    const file = await fs.readFile(filePath)
    const types = filetypename(file)
    const isEpub = types.some((type) => type === 'epub')
    if (!isEpub) return null
    await unzipEpub(filePath, outDir)

    return getCoverRoute(outDir)
  } catch (e) {
    console.log(e)
    return null
  }
}

// function to delete a book from a book folder
export async function deleteBook(bookFolder: string): Promise<void> {
  const bookPath = path.join(getBookPath(), bookFolder)
  await fs.rmdir(bookPath, { recursive: true })
}

export async function getBooks(): Promise<Book[]> {
  const booksPaths = await fs.readdir(getBookPath())
  // await fs.chown(getBookPath(), 1000, 1000)
  // await fs.rmdir(getBookPath())

  return Promise.all(booksPaths.map(async (bookPath) => parseEpub(bookPath)))
}
