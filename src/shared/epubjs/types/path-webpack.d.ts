declare module 'path-webpack' {
  export interface ParsedPath {
    root: string
    dir: string
    base: string
    ext: string
    name: string
  }

  interface Path {
    path: string
    dirname: string
    basename: string
    extname: string
    parse(path: string): ParsedPath
    resolve(...paths: string[]): string
    join(...paths: string[]): string
    relative(from: string, to: string): string
    isAbsolute(path: string): boolean
    normalize(path: string): string
    sep: string
    delimiter: string
  }

  const path: Path
  export = path
}
