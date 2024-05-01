import fs from 'fs/promises'
import type { Store } from '../../shared/types'

export async function fetchBookStoreData(bookStorePath: string): Promise<Store> {
  try {
    const data = await fs.readFile(bookStorePath)
    return JSON.parse(data.toString())
  } catch {
    return { currentBookId: 0, epubUrl: '' }
  }
}
