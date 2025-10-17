import Path from './path'
import path from 'path-webpack'

/**
 * creates a Url object for parsing and manipulation of a url string
 * @param	{string} urlString	a url string (relative or absolute)
 * @param	{string} [baseString] optional base for the url,
 * default to window.location.href
 */
class Url {
  public Url: URL | undefined
  public href: string
  public protocol: string
  public origin: string
  public hash: string
  public search: string
  public base: string | false
  public directory: string
  public filename: string
  public extension: string
  private Path: Path

  constructor(urlString: string, baseString?: string | false) {
    const absolute = urlString.indexOf('://') > -1
    let pathname = urlString
    let basePath: Path

    this.Url = undefined
    this.href = urlString
    this.protocol = ''
    this.origin = ''
    this.hash = ''
    this.search = ''
    this.base = baseString || false

    if (
      !absolute &&
      baseString !== false &&
      typeof baseString !== 'string' &&
      typeof window !== 'undefined' &&
      window.location
    ) {
      this.base = window.location.href
    }

    // URL Polyfill doesn't throw an error if base is empty
    if (absolute || this.base) {
      try {
        if (this.base) {
          // Safari doesn't like an undefined base
          this.Url = new URL(urlString, this.base as string)
        } else {
          this.Url = new URL(urlString)
        }
        this.href = this.Url.href

        this.protocol = this.Url.protocol
        this.origin = this.Url.origin
        this.hash = this.Url.hash
        this.search = this.Url.search

        pathname = this.Url.pathname + (this.Url.search ? this.Url.search : '')
      } catch (e) {
        // Skip URL parsing
        this.Url = undefined
        // resolve the pathname from the base
        if (this.base) {
          basePath = new Path(this.base as string)
          pathname = basePath.resolve(pathname)
        }
      }
    }

    this.Path = new Path(pathname)

    this.directory = this.Path.directory
    this.filename = this.Path.filename
    this.extension = this.Path.extension
  }

  /**
   * @returns {Path}
   */
  path(): Path {
    return this.Path
  }

  /**
   * Resolves a relative path to a absolute url
   * @param {string} what
   * @returns {string} url
   */
  resolve(what: string): string {
    const isAbsolute = what.indexOf('://') > -1
    let fullpath: string

    if (isAbsolute) {
      return what
    }

    fullpath = path.resolve(this.directory, what)
    return this.origin + fullpath
  }

  /**
   * Resolve a path relative to the url
   * @param {string} what
   * @returns {string} path
   */
  relative(what: string): string {
    return path.relative(what, this.directory)
  }

  /**
   * @returns {string}
   */
  toString(): string {
    return this.href
  }
}

export default Url
