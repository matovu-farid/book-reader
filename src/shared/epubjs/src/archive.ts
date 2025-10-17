import { Deferred, isXml, parse } from './utils/core'
import request from './utils/request'
import mime from './utils/mime'
import Path from './utils/path'
import JSZip from 'jszip'

interface CreateUrlOptions {
  base64?: boolean
}

interface URLConstructor {
  createObjectURL(blob: Blob | MediaSource): string
  revokeObjectURL(url: string): void
}

interface WindowWithURL extends Window {
  URL?: URLConstructor
  webkitURL?: URLConstructor
  mozURL?: URLConstructor
}

type ArchiveRequestType = 'blob' | 'json' | 'xhtml' | 'html' | 'htm' | 'xml' | string

type ArchiveResponse = Blob | string | Document | XMLDocument | Record<string, unknown>

interface ArchiveError {
  message: string
  stack?: string
}

type ArchiveUrlCache = Record<string, string>

/**
 * Handles Unzipping a requesting files from an Epub Archive
 * @class
 */
class Archive {
  private zip: JSZip | undefined
  private urlCache: ArchiveUrlCache = {}

  constructor() {
    this.zip = undefined
    this.urlCache = {}

    this.checkRequirements()
  }

  /**
   * Checks to see if JSZip exists in global namspace,
   * Requires JSZip if it isn't there
   * @private
   */
  checkRequirements(): void {
    try {
      this.zip = new JSZip()
    } catch (e) {
      throw new Error('JSZip lib not loaded')
    }
  }

  /**
   * Open an archive
   * @param  {binary} input
   * @param  {boolean} [isBase64] tells JSZip if the input data is base64 encoded
   * @return {Promise} zipfile
   */
  open(input: ArrayBuffer | string, isBase64?: boolean): Promise<JSZip> {
    return this.zip!.loadAsync(input, { base64: isBase64 })
  }

  /**
   * Load and Open an archive
   * @param  {string} zipUrl
   * @param  {boolean} [isBase64] tells JSZip if the input data is base64 encoded
   * @return {Promise} zipfile
   */
  openUrl(zipUrl: string, isBase64?: boolean): Promise<JSZip> {
    return request(zipUrl, 'binary').then((data) => {
      return this.zip!.loadAsync(data as ArrayBuffer, { base64: isBase64 })
    })
  }

  /**
   * Request a url from the archive
   * @param  {string} url  a url to request from the archive
   * @param  {string} [type] specify the type of the returned result
   * @return {Promise<ArchiveResponse>}
   */
  request(url: string, type?: ArchiveRequestType): Promise<ArchiveResponse> {
    const deferred = new Deferred<ArchiveResponse>()
    let response: Promise<unknown> | undefined
    const path = new Path(url)

    // If type isn't set, determine it from the file extension
    if (!type) {
      type = path.extension
    }

    if (type === 'blob') {
      response = this.getBlob(url)
    } else {
      response = this.getText(url)
    }

    if (response) {
      response
        .then((r) => {
          const result = this.handleResponse(r, type!)
          deferred.resolve!(result)
        })
        .catch((error) => {
          deferred.reject!(error)
        })
    } else {
      const error: ArchiveError = {
        message: 'File not found in the epub: ' + url,
        stack: new Error().stack
      }
      deferred.reject!(error)
    }
    return deferred.promise
  }

  /**
   * Handle the response from request
   * @private
   * @param  {unknown} response
   * @param  {ArchiveRequestType} [type]
   * @return {ArchiveResponse} the parsed result
   */
  private handleResponse(response: unknown, type: ArchiveRequestType): ArchiveResponse {
    let r: ArchiveResponse

    if (type === 'json') {
      r = JSON.parse(response as string) as Record<string, unknown>
    } else if (isXml(type)) {
      r = parse(response as string, 'text/xml')
    } else if (type === 'xhtml') {
      r = parse(response as string, 'application/xhtml+xml')
    } else if (type === 'html' || type === 'htm') {
      r = parse(response as string, 'text/html')
    } else {
      r = response as ArchiveResponse
    }

    return r
  }

  /**
   * Get a Blob from Archive by Url
   * @param  {string} url
   * @param  {string} [mimeType]
   * @return {Promise<Blob> | undefined}
   */
  getBlob(url: string, mimeType?: string): Promise<Blob> | undefined {
    if (!this.zip) {
      return undefined
    }

    const decodedUrl = window.decodeURIComponent(url.substr(1)) // Remove first slash
    const entry = this.zip.file(decodedUrl)

    if (entry) {
      const finalMimeType = mimeType || mime.lookup(entry.name)
      return entry.async('uint8array').then((uint8array: Uint8Array) => {
        return new Blob([uint8array as BlobPart], { type: finalMimeType })
      })
    }
    return undefined
  }

  /**
   * Get Text from Archive by Url
   * @param  {string} url
   * @return {Promise<string> | undefined}
   */
  getText(url: string): Promise<string> | undefined {
    if (!this.zip) {
      return undefined
    }

    const decodedUrl = window.decodeURIComponent(url.substr(1)) // Remove first slash
    const entry = this.zip.file(decodedUrl)

    if (entry) {
      return entry.async('string').then((text: string) => {
        return text
      })
    }
    return undefined
  }

  /**
   * Get a base64 encoded result from Archive by Url
   * @param  {string} url
   * @param  {string} [mimeType]
   * @return {Promise<string> | undefined} base64 encoded
   */
  getBase64(url: string, mimeType?: string): Promise<string> | undefined {
    if (!this.zip) {
      return undefined
    }

    const decodedUrl = window.decodeURIComponent(url.substr(1)) // Remove first slash
    const entry = this.zip.file(decodedUrl)

    if (entry) {
      const finalMimeType = mimeType || mime.lookup(entry.name)
      return entry.async('base64').then((data: string) => {
        return 'data:' + finalMimeType + ';base64,' + data
      })
    }
    return undefined
  }

  /**
   * Create a Url from an unarchived item
   * @param  {string} url
   * @param  {CreateUrlOptions} [options] use base64 encoding or blob url
   * @return {Promise<string>} url promise with Url string
   */
  createUrl(url: string, options?: CreateUrlOptions): Promise<string> {
    const deferred = new Deferred<string>()
    const _URL =
      (window as WindowWithURL).URL ||
      (window as WindowWithURL).webkitURL ||
      (window as WindowWithURL).mozURL
    let response: Promise<unknown> | undefined
    const useBase64 = options?.base64

    if (url in this.urlCache) {
      deferred.resolve!(this.urlCache[url])
      return deferred.promise
    }

    if (useBase64) {
      response = this.getBase64(url)

      if (response) {
        response
          .then((tempUrl: unknown) => {
            const urlString = tempUrl as string
            this.urlCache[url] = urlString
            deferred.resolve!(urlString)
          })
          .catch((error) => {
            deferred.reject!(error)
          })
      }
    } else {
      response = this.getBlob(url)

      if (response && _URL) {
        response
          .then((blob: unknown) => {
            const tempUrl = _URL.createObjectURL(blob as Blob)
            this.urlCache[url] = tempUrl
            deferred.resolve!(tempUrl)
          })
          .catch((error) => {
            deferred.reject!(error)
          })
      }
    }

    if (!response) {
      const error: ArchiveError = {
        message: 'File not found in the epub: ' + url,
        stack: new Error().stack
      }
      deferred.reject!(error)
    }

    return deferred.promise
  }

  /**
   * Revoke Temp Url for a archive item
   * @param  {string} url url of the item in the archive
   */
  revokeUrl(url: string): void {
    const _URL =
      (window as WindowWithURL).URL ||
      (window as WindowWithURL).webkitURL ||
      (window as WindowWithURL).mozURL
    const fromCache = this.urlCache[url]
    if (fromCache && _URL) {
      _URL.revokeObjectURL(fromCache)
    }
  }

  /**
   * Clean up resources and destroy the archive
   */
  destroy(): void {
    const _URL =
      (window as WindowWithURL).URL ||
      (window as WindowWithURL).webkitURL ||
      (window as WindowWithURL).mozURL
    if (_URL) {
      for (const urlKey in this.urlCache) {
        const cachedUrl = this.urlCache[urlKey]
        _URL.revokeObjectURL(cachedUrl)
      }
    }
    this.zip = undefined
    this.urlCache = {}
  }
}

export default Archive
