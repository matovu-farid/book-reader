import { defer, isXml, parse, Deferred } from './utils/core'
import httpRequest from './utils/request'
import mime from './utils/mime'
import Path from './utils/path'
import EventEmitter from 'event-emitter'
import * as localforage from 'localforage'

// Define proper types for localforage
interface LocalForageInstance {
  createInstance?: (options: { name: string }) => LocalForageInstance
  getItem: (key: string) => Promise<unknown>
  setItem: (key: string, value: unknown) => Promise<unknown>
}

// Define proper types for URL constructor
interface URLConstructor {
  createObjectURL: (obj: Blob | MediaSource) => string
  revokeObjectURL: (url: string) => void
}

// Extend Window interface for browser compatibility
declare global {
  interface Window {
    webkitURL?: URLConstructor
    mozURL?: URLConstructor
  }
}

/**
 * Handles saving and requesting files from local storage
 * @class
 * @param {string} name This should be the name of the application for modals
 * @param {function} [requester]
 * @param {function} [resolver]
 */
class Store {
  urlCache: Record<string, string>
  storage: LocalForageInstance | undefined
  name: string
  requester: (
    url: string,
    type?: string,
    withCredentials?: boolean,
    headers?: Record<string, string>
  ) => Promise<unknown>
  resolver: (href: string) => string
  online: boolean
  _status?: (event: Event) => void

  constructor(
    name: string,
    requester?: (
      url: string,
      type?: string,
      withCredentials?: boolean,
      headers?: Record<string, string>
    ) => Promise<unknown>,
    resolver?: (href: string) => string
  ) {
    this.urlCache = {}

    this.storage = undefined

    this.name = name
    this.requester = requester || httpRequest
    this.resolver = resolver || ((href: string) => href)

    this.online = true

    this.checkRequirements()

    this.addListeners()
  }

  /**
   * Checks to see if localForage exists in global namspace,
   * Requires localForage if it isn't there
   * @private
   */
  checkRequirements(): void {
    try {
      if (typeof localforage !== 'undefined') {
        this.storage =
          (localforage as unknown as LocalForageInstance).createInstance?.({
            name: this.name
          }) || (localforage as unknown as LocalForageInstance)
      }
    } catch (e) {
      throw new Error('localForage lib not loaded')
    }
  }

  /**
   * Add online and offline event listeners
   * @private
   */
  addListeners(): void {
    this._status = this.status.bind(this)
    window.addEventListener('online', this._status)
    window.addEventListener('offline', this._status)
  }

  /**
   * Remove online and offline event listeners
   * @private
   */
  removeListeners(): void {
    if (this._status) {
      window.removeEventListener('online', this._status)
      window.removeEventListener('offline', this._status)
      this._status = undefined
    }
  }

  /**
   * Update the online / offline status
   * @private
   */
  status(): void {
    const online = navigator.onLine
    this.online = online
    if (online) {
      this.emit('online', this)
    } else {
      this.emit('offline', this)
    }
  }

  /**
   * Add all of a book resources to the store
   * @param  {Resources} resources  book resources
   * @param  {boolean} [force] force resaving resources
   * @return {Promise<object>} store objects
   */
  add(resources: Record<string, unknown>, force?: boolean): Promise<unknown[]> {
    const mapped = (resources.resources as Array<Record<string, unknown>>).map((item) => {
      const { href } = item as Record<string, string>
      const url = this.resolver(href)
      const encodedUrl = window.encodeURIComponent(url)

      return this.storage!.getItem(encodedUrl).then((item: unknown) => {
        if (!item || force) {
          return this.requester(url, 'binary').then((data: unknown) => {
            return this.storage!.setItem(encodedUrl, data)
          })
        } else {
          return item
        }
      })
    })
    return Promise.all(mapped)
  }

  /**
   * Put binary data from a url to storage
   * @param  {string} url  a url to request from storage
   * @param  {boolean} [withCredentials]
   * @param  {object} [headers]
   * @return {Promise<Blob>}
   */
  put(url: string, withCredentials?: boolean, headers?: Record<string, string>): Promise<unknown> {
    const encodedUrl = window.encodeURIComponent(url)

    return this.storage!.getItem(encodedUrl).then((result: unknown) => {
      if (!result) {
        return this.requester(url, 'binary', withCredentials, headers).then((data: unknown) => {
          return this.storage!.setItem(encodedUrl, data)
        })
      }
      return result
    }) as Promise<unknown>
  }

  /**
   * Request a url
   * @param  {string} url  a url to request from storage
   * @param  {string} [type] specify the type of the returned result
   * @param  {boolean} [withCredentials]
   * @param  {object} [headers]
   * @return {Promise<Blob | string | JSON | Document | XMLDocument>}
   */
  request(
    url: string,
    type?: string,
    withCredentials?: boolean,
    headers?: Record<string, string>
  ): Promise<unknown> {
    if (this.online) {
      // From network
      return this.requester(url, type, withCredentials, headers).then((data: unknown) => {
        // save to store if not present
        this.put(url)
        return data
      })
    } else {
      // From store
      return this.retrieve(url, type)
    }
  }

  /**
   * Request a url from storage
   * @param  {string} url  a url to request from storage
   * @param  {string} [type] specify the type of the returned result
   * @return {Promise<Blob | string | JSON | Document | XMLDocument>}
   */
  retrieve(url: string, type?: string): Promise<unknown> {
    const path = new Path(url)

    // If type isn't set, determine it from the file extension
    let requestType = type
    if (!requestType) {
      requestType = (path as Path).extension as string
    }

    const response = requestType === 'blob' ? this.getBlob(url) : this.getText(url)

    return response.then((r: unknown) => {
      const deferred = defer()
      let result
      if (r) {
        result = this.handleResponse(r, requestType)
        ;(deferred as Deferred).resolve?.(result)
      } else {
        ;(deferred as Deferred).reject?.({
          message: 'File not found in storage: ' + url,
          stack: new Error().stack
        })
      }
      return (deferred as Deferred).promise
    }) as Promise<unknown>
  }

  /**
   * Handle the response from request
   * @private
   * @param  {any} response
   * @param  {string} [type]
   * @return {any} the parsed result
   */
  handleResponse(response: unknown, type?: string): unknown {
    let r: unknown

    if (type === 'json') {
      r = JSON.parse(response as string)
    } else if (type && isXml(type)) {
      r = parse(response as string, 'text/xml')
    } else if (type === 'xhtml') {
      r = parse(response as string, 'application/xhtml+xml')
    } else if (type === 'html' || type === 'htm') {
      r = parse(response as string, 'text/html')
    } else {
      r = response
    }

    return r
  }

  /**
   * Get a Blob from Storage by Url
   * @param  {string} url
   * @param  {string} [mimeType]
   * @return {Blob}
   */
  getBlob(url: string, mimeType?: string): Promise<Blob | undefined> {
    const encodedUrl = window.encodeURIComponent(url)

    return (this.storage!.getItem(encodedUrl) as Promise<unknown>).then((uint8array: unknown) => {
      if (!uint8array) return

      const type = mimeType || (mime.lookup(url) as string)

      // Ensure we have a proper ArrayBuffer for Blob constructor
      const uint8 = uint8array as Uint8Array
      const buffer =
        uint8.buffer instanceof ArrayBuffer ? uint8.buffer : new ArrayBuffer(uint8.byteLength)

      return new Blob([new Uint8Array(buffer)], { type })
    }) as Promise<Blob | undefined>
  }

  /**
   * Get Text from Storage by Url
   * @param  {string} url
   * @param  {string} [mimeType]
   * @return {string}
   */
  getText(url: string, mimeType?: string): Promise<string | undefined> {
    const encodedUrl = window.encodeURIComponent(url)

    const type = mimeType || (mime.lookup(url) as string)

    return (this.storage!.getItem(encodedUrl) as Promise<unknown>).then((uint8array: unknown) => {
      const deferred = defer()
      const reader = new FileReader()

      if (!uint8array) return

      // Ensure we have a proper ArrayBuffer for Blob constructor
      const uint8 = uint8array as Uint8Array
      const buffer =
        uint8.buffer instanceof ArrayBuffer ? uint8.buffer : new ArrayBuffer(uint8.byteLength)

      const blob = new Blob([new Uint8Array(buffer)], { type })

      reader.addEventListener('loadend', () => {
        ;(deferred as Deferred).resolve?.(reader.result)
      })

      reader.readAsText(blob)

      return (deferred as Deferred).promise
    }) as Promise<string | undefined>
  }

  /**
   * Get a base64 encoded result from Storage by Url
   * @param  {string} url
   * @param  {string} [mimeType]
   * @return {string} base64 encoded
   */
  getBase64(url: string, mimeType?: string): Promise<string | undefined> {
    const encodedUrl = window.encodeURIComponent(url)

    const type = mimeType || (mime.lookup(url) as string)

    return (this.storage!.getItem(encodedUrl) as Promise<unknown>).then((uint8array: unknown) => {
      const deferred = defer()
      const reader = new FileReader()

      if (!uint8array) return

      // Ensure we have a proper ArrayBuffer for Blob constructor
      const uint8 = uint8array as Uint8Array
      const buffer =
        uint8.buffer instanceof ArrayBuffer ? uint8.buffer : new ArrayBuffer(uint8.byteLength)

      const blob = new Blob([new Uint8Array(buffer)], { type })

      reader.addEventListener('loadend', () => {
        ;(deferred as Deferred).resolve?.(reader.result)
      })
      reader.readAsDataURL(blob)

      return (deferred as Deferred).promise
    }) as Promise<string | undefined>
  }

  /**
   * Create a Url from a stored item
   * @param  {string} url
   * @param  {object} [options.base64] use base64 encoding or blob url
   * @return {Promise} url promise with Url string
   */
  createUrl(url: string, options?: Record<string, unknown>): Promise<string> {
    const deferred = defer()
    const _URL = (window.URL || window.webkitURL || window.mozURL) as URLConstructor
    let tempUrl: string | undefined
    const useBase64 = options && options.base64

    if (url in this.urlCache) {
      ;(deferred as Deferred).resolve?.(this.urlCache[url])
      return (deferred as Deferred).promise as Promise<string>
    }

    if (useBase64) {
      const response = this.getBase64(url)

      if (response) {
        response.then((tempUrlResult: unknown) => {
          tempUrl = tempUrlResult as string
          this.urlCache[url] = tempUrl
          ;(deferred as Deferred).resolve?.(tempUrl)
        })
      }
    } else {
      const response = this.getBlob(url)

      if (response) {
        response.then((blob: unknown) => {
          tempUrl = _URL.createObjectURL(blob as Blob)
          this.urlCache[url] = tempUrl
          ;(deferred as Deferred).resolve?.(tempUrl)
        })
      }
    }

    if (!tempUrl) {
      ;(deferred as Deferred).reject?.({
        message: 'File not found in storage: ' + url,
        stack: new Error().stack
      })
    }

    return (deferred as Deferred).promise as Promise<string>
  }

  /**
   * Revoke Temp Url for a archive item
   * @param  {string} url url of the item in the store
   */
  revokeUrl(url: string): void {
    const _URL = (window.URL || window.webkitURL || window.mozURL) as URLConstructor
    const fromCache = this.urlCache[url]
    if (fromCache) _URL.revokeObjectURL(fromCache)
  }

  destroy(): void {
    const _URL = (window.URL || window.webkitURL || window.mozURL) as URLConstructor
    for (const fromCache in this.urlCache) {
      _URL.revokeObjectURL(this.urlCache[fromCache])
    }
    this.urlCache = {}
    this.removeListeners()
  }

  // EventEmitter methods (added by EventEmitter mixin at runtime)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  emit(_event: string, ..._args: unknown[]): void {
    // Implementation provided by EventEmitter mixin
  }
}

EventEmitter(Store.prototype)

export default Store
