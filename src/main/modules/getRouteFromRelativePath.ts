import path from 'path'
import { routeFromPath } from './routeFromPath'
import { PORT } from './PORT'
import { getBookPath } from './getBookPath'

export function getRouteFromRelativePath(bookFolder: string, relativePath: string) {
  const filePath = path.resolve(getBookPath(), bookFolder, relativePath)
  const regex = /public\/(.*)$/

  return routeFromPath(filePath, PORT, regex) || ''
}
