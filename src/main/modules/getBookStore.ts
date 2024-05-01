import path from 'path'
import fs from 'fs/promises'
import type { Store } from '../../shared/types'
import { getBookPath } from './getBookPath'

export async function saveBookStore(data: Store, outputDir: string): Promise<string> {
  const jsonString = JSON.stringify(data)
  const bookStorePath = path.join(getBookPath(), outputDir, 'store.json')
  await fs.writeFile(bookStorePath, jsonString)
  return bookStorePath
}
export async function updateBookStore(data: Partial<Store>, outputDir: string): Promise<string> {
  const store = await getBookStore(outputDir)
  const updatedStore = { ...store, ...data }
  return saveBookStore(updatedStore, outputDir)
}

async function fetchBookStoreData(bookStorePath: string): Promise<Store> {
  try {
    const data = await fs.readFile(bookStorePath)
    return JSON.parse(data.toString())
  } catch {
    return { currentBookId: 0, epubUrl: '' }
  }
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
