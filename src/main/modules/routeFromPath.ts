export function routeFromPath(path: string, port: number): string | null {
  const regex = /public\/(.*)$/
  const match = path.match(regex)
  if (!match) {
    return null
  }

  const strippedFileUrl = match[1]
  const route = `http://localhost:${port}/${strippedFileUrl}`
  return route
}
