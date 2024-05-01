import path from 'path'
import md5 from 'md5'
import fs from 'fs/promises'
import type { Book } from '../../shared/types'
import { getAssets } from './getAssets'
import { getRouteFromRelativePath } from './getRouteFromRelativePath'
import { getEpubCover } from './getEpubCover'
import { getManifestFiles } from './getManifestFiles'
import { getBookPath } from './getBookPath'
import { formatBookDatails } from './formatBookDatails'
import { getBookStore, saveBookStore } from './getBookStore'

export async function updateCurrentBookId(
  bookFolder: string,
  currentBookId: string
): Promise<string> {
  const store = await getBookStore(bookFolder)
  store.currentBookId = currentBookId
  return saveBookStore(store, bookFolder)
}
// function to delete a book from a book folder
export async function deleteBook(bookFolder: string): Promise<void> {
  const bookPath = path.join(getBookPath(), bookFolder)
  await fs.rmdir(bookPath, { recursive: true })
}

export async function getBooks(): Promise<Book[]> {
  const booksPaths = await fs.readdir(getBookPath())
  return Promise.all(booksPaths.map(async (bookPath) => parseEpub(bookPath)))
}

async function parseEpub(bookFolder: string): Promise<Book> {
  try {
    const { manifest, workingFolder, opfFileObj, opfFilePath } = await getManifestFiles(bookFolder)
    const assets = await getAssets(manifest, workingFolder)

    const store = await getBookStore(bookFolder).catch(() => ({ currentBookId: 0, epubUrl: '' }))

    const absoluteBookPath = path.join(getBookPath(), bookFolder)

    const { spine, title } = formatBookDatails(manifest, opfFileObj, opfFilePath, absoluteBookPath)
    // await updateSpineImageUrls(spine, bookFolder)

    const cover = await getEpubCover(opfFileObj)
    return {
      currentBookId: store.currentBookId,
      id: md5(absoluteBookPath),
      cover: getRouteFromRelativePath(workingFolder, cover) || '',
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
