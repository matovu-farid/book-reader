export function routeFromPath(path: string, port: number, regex:RegExp): string | null {
  const match = path.match(regex)
  if (!match) {
    return null
  }

  const strippedFileUrl = match[1]
  const route = `http://localhost:${port}/${strippedFileUrl}`
  return route
}
