import { substitute } from './utils/replacements'
import { createBase64Url, createBlobUrl, blob2base64 } from './utils/core'
import Url from './utils/url'
import mime from './utils/mime'
import Path from './utils/path'
import path from 'path-webpack'

interface ManifestItem {
  href: string
  type: string
  overlay?: string
  properties: string[]
}

interface ResourcesOptions {
  replacements?: string
  archive?: any
  resolver?: (url: string) => string
  request?: (url: string, type: string) => Promise<any>
}

/**
 * Handle Package Resources
 * @class
 * @param {Manifest} manifest
 * @param {object} [options]
 * @param {string} [options.replacements="base64"]
 * @param {Archive} [options.archive]
 * @param {method} [options.resolver]
 */
class Resources {
  private settings: ResourcesOptions & { replacements: string }
  public manifest: { [id: string]: ManifestItem }
  public resources: ManifestItem[]
  public replacementUrls: string[] = []
  public html: ManifestItem[] = []
  public assets: ManifestItem[] = []
  public css: ManifestItem[] = []
  public urls: string[] = []
  public cssUrls: string[] = []

  constructor(manifest: { [id: string]: ManifestItem }, options?: ResourcesOptions) {
    this.settings = {
      replacements: (options && options.replacements) || 'base64',
      archive: options && options.archive,
      resolver: options && options.resolver,
      request: options && options.request
    }

    this.process(manifest)
  }

  /**
   * Process resources
   * @param {Manifest} manifest
   */
  process(manifest: { [id: string]: ManifestItem }): void {
    this.manifest = manifest
    this.resources = Object.keys(manifest).map((key) => {
      return manifest[key]
    })

    this.replacementUrls = []

    this.html = []
    this.assets = []
    this.css = []

    this.urls = []
    this.cssUrls = []

    this.split()
    this.splitUrls()
  }

  /**
   * Split resources by type
   * @private
   */
  split(): void {
    // HTML
    this.html = this.resources.filter((item) => {
      if (item.type === 'application/xhtml+xml' || item.type === 'text/html') {
        return true
      }
      return false
    })

    // Exclude HTML
    this.assets = this.resources.filter((item) => {
      if (item.type !== 'application/xhtml+xml' && item.type !== 'text/html') {
        return true
      }
      return false
    })

    // Only CSS
    this.css = this.resources.filter((item) => {
      if (item.type === 'text/css') {
        return true
      }
      return false
    })
  }

  /**
   * Convert split resources into Urls
   * @private
   */
  splitUrls(): void {
    // All Assets Urls
    this.urls = this.assets.map((item) => {
      return item.href
    })

    // Css Urls
    this.cssUrls = this.css.map((item) => {
      return item.href
    })
  }

  /**
   * Create a url to a resource
   * @param {string} url
   * @return {Promise<string>} Promise resolves with url string
   */
  createUrl(url: string): Promise<string> {
    const parsedUrl = new Url(url)
    const mimeType = mime.lookup(parsedUrl.filename)

    if (this.settings.archive) {
      return this.settings.archive.createUrl(url, {
        base64: this.settings.replacements === 'base64'
      })
    } else {
      if (this.settings.replacements === 'base64') {
        return this.settings.request!(url, 'blob')
          .then((blob: Blob) => {
            return blob2base64(blob)
          })
          .then((blob: string) => {
            return createBase64Url(blob, mimeType) || ''
          })
      } else {
        return this.settings.request!(url, 'blob').then((blob: Blob) => {
          return createBlobUrl(blob, mimeType)
        })
      }
    }
  }

  /**
   * Create blob urls for all the assets
   * @return {Promise}         returns replacement urls
   */
  replacements(): Promise<string[]> {
    if (this.settings.replacements === 'none') {
      return new Promise((resolve) => {
        resolve(this.urls)
      })
    }

    const replacements = this.urls.map((url) => {
      const absolute = this.settings.resolver!(url)

      return this.createUrl(absolute).catch((err) => {
        console.error(err)
        return null
      })
    })

    return Promise.all(replacements).then((replacementUrls) => {
      this.replacementUrls = replacementUrls.filter((url) => {
        return typeof url === 'string'
      })
      return replacementUrls
    })
  }

  /**
   * Replace URLs in CSS resources
   * @private
   * @param  {Archive} [archive]
   * @param  {method} [resolver]
   * @return {Promise}
   */
  replaceCss(archive?: any, resolver?: (url: string) => string): Promise<any[]> {
    const replaced: Promise<any>[] = []
    const archiveInstance = archive || this.settings.archive
    const resolverInstance = resolver || this.settings.resolver

    this.cssUrls.forEach((href) => {
      const replacement = this.createCssFile(href, archiveInstance, resolverInstance).then(
        (replacementUrl) => {
          // switch the url in the replacementUrls
          const indexInUrls = this.urls.indexOf(href)
          if (indexInUrls > -1) {
            this.replacementUrls[indexInUrls] = replacementUrl
          }
        }
      )

      replaced.push(replacement)
    })
    return Promise.all(replaced)
  }

  /**
   * Create a new CSS file with the replaced URLs
   * @private
   * @param  {string} href the original css file
   * @return {Promise}  returns a BlobUrl to the new CSS file or a data url
   */
  createCssFile(href: string): Promise<string | undefined> {
    let newUrl: string

    if (path.isAbsolute(href)) {
      return new Promise((resolve) => {
        resolve(undefined)
      })
    }

    const absolute = this.settings.resolver!(href)

    // Get the text of the css file from the archive
    let textResponse: Promise<string> | undefined

    if (this.settings.archive) {
      textResponse = this.settings.archive.getText(absolute)
    } else {
      textResponse = this.settings.request!(absolute, 'text')
    }

    // Get asset links relative to css file
    const relUrls = this.urls.map((assetHref) => {
      const resolved = this.settings.resolver!(assetHref)
      const relative = new Path(absolute).relative(resolved)
      return relative
    })

    if (!textResponse) {
      // file not found, don't replace
      return new Promise((resolve) => {
        resolve(undefined)
      })
    }

    return textResponse.then(
      (text) => {
        // Replacements in the css text
        text = substitute(text, relUrls, this.replacementUrls)

        // Get the new url
        if (this.settings.replacements === 'base64') {
          newUrl = createBase64Url(text, 'text/css') || ''
        } else {
          newUrl = createBlobUrl(text, 'text/css')
        }

        return newUrl
      },
      (err) => {
        // handle response errors
        return new Promise((resolve) => {
          resolve(undefined)
        })
      }
    )
  }

  /**
   * Resolve all resources URLs relative to an absolute URL
   * @param  {string} absolute to be resolved to
   * @param  {resolver} [resolver]
   * @return {string[]} array with relative Urls
   */
  relativeTo(absolute: string, resolver?: (url: string) => string): string[] {
    const resolverInstance = resolver || this.settings.resolver

    // Get Urls relative to current sections
    return this.urls.map((href) => {
      const resolved = resolverInstance!(href)
      const relative = new Path(absolute).relative(resolved)
      return relative
    })
  }

  /**
   * Get a URL for a resource
   * @param  {string} path
   * @return {string} url
   */
  get(path: string): Promise<string> | undefined {
    const indexInUrls = this.urls.indexOf(path)
    if (indexInUrls === -1) {
      return
    }
    if (this.replacementUrls.length) {
      return new Promise((resolve) => {
        resolve(this.replacementUrls[indexInUrls])
      })
    } else {
      return this.createUrl(path)
    }
  }

  /**
   * Substitute urls in content, with replacements,
   * relative to a url if provided
   * @param  {string} content
   * @param  {string} [url]   url to resolve to
   * @return {string}         content with urls substituted
   */
  substitute(content: string, url?: string): string {
    let relUrls: string[]
    if (url) {
      relUrls = this.relativeTo(url)
    } else {
      relUrls = this.urls
    }
    return substitute(content, relUrls, this.replacementUrls)
  }

  destroy(): void {
    this.settings = undefined as any
    this.manifest = undefined as any
    this.resources = undefined as any
    this.replacementUrls = undefined as any
    this.html = undefined as any
    this.assets = undefined as any
    this.css = undefined as any

    this.urls = undefined as any
    this.cssUrls = undefined as any
  }
}

export default Resources
