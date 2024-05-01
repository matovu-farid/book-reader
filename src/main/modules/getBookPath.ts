import path from 'path'
import { app } from 'electron'
import fs from 'fs/promises'
import { BOOKS, PUBLIC } from './epub_constants'

export function getBookPath(): string {
  try {
    const bookPath = path.join(app.getPath('appData'), PUBLIC, BOOKS)
    fs.access(bookPath).catch(() => fs.mkdir(bookPath, { recursive: true }))
    return bookPath
  } catch (e) {
    console.log(e)
    return ''
  }
}
