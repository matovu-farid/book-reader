import path from 'path-webpack'

interface ParsedPath {
  root: string
  dir: string
  base: string
  ext: string
  name: string
}

/**
 * Creates a Path object for parsing and manipulation of a path strings
 *
 * Uses a polyfill for Nodejs path: https://nodejs.org/api/path.html
 * @param	{string} pathString	a url string (relative or absolute)
 * @class
 */
class Path {
  public path: string
  public directory: string
  public filename: string
  public extension: string
  private splitPathRe: RegExp

  constructor(pathString: string) {
    const protocol = pathString.indexOf('://')
    if (protocol > -1) {
      pathString = new URL(pathString).pathname
    }

    const parsed = this.parse(pathString)

    this.path = pathString

    if (this.isDirectory(pathString)) {
      this.directory = pathString
    } else {
      this.directory = parsed.dir + '/'
    }

    this.filename = parsed.base
    this.extension = parsed.ext.slice(1)

    // Initialize regex for splitPath method
    this.splitPathRe = /^(.+)\/([^/]*)$/
  }

  /**
   * Parse the path: https://nodejs.org/api/path.html#path_path_parse_path
   * @param	{string} what
   * @returns {object}
   */
  parse(what: string): ParsedPath {
    return path.parse(what)
  }

  /**
   * @param	{string} what
   * @returns {boolean}
   */
  isAbsolute(what?: string): boolean {
    return path.isAbsolute(what || this.path)
  }

  /**
   * Check if path ends with a directory
   * @param	{string} what
   * @returns {boolean}
   */
  isDirectory(what: string): boolean {
    return what.charAt(what.length - 1) === '/'
  }

  /**
   * Resolve a path against the directory of the Path
   *
   * https://nodejs.org/api/path.html#path_path_resolve_paths
   * @param	{string} what
   * @returns {string} resolved
   */
  resolve(what: string): string {
    return path.resolve(this.directory, what)
  }

  /**
   * Resolve a path relative to the directory of the Path
   *
   * https://nodejs.org/api/path.html#path_path_relative_from_to
   * @param	{string} what
   * @returns {string} relative
   */
  relative(what: string): string {
    const isAbsolute = what && what.indexOf('://') > -1

    if (isAbsolute) {
      return what
    }

    return path.relative(this.directory, what)
  }

  splitPath(filename: string): string[] {
    const match = this.splitPathRe.exec(filename)
    return match ? match.slice(1) : [filename, '']
  }

  /**
   * Return the path string
   * @returns {string} path
   */
  toString(): string {
    return this.path
  }
}

export default Path
