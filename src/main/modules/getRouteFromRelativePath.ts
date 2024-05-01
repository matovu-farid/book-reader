import path from 'path'
import { routeFromPath } from './routeFromPath'
import { PORT } from './PORT'
import { getBookPath } from './epub'

export function getRouteFromRelativePath(
  bookFolder: string,
  relativePath: string,
  regex = /public\/(.*)$/
) {
  const filePath = path.resolve(getBookPath(), bookFolder, relativePath)

  return routeFromPath(filePath, PORT, regex) || ''
}
