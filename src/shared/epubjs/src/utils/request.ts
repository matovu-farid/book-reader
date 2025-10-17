import { Deferred, isXml, parse } from './core'
import Path from './path'

interface RequestHeaders {
  [key: string]: string
}

function request(
  url: string,
  type?: string,
  withCredentials?: boolean,
  headers: RequestHeaders = {}
): Promise<unknown> {
  const supportsURL = typeof window !== 'undefined' ? window.URL : false // TODO: fallback for url if window isn't defined
  const BLOB_RESPONSE = supportsURL ? 'blob' : 'arraybuffer'

  const deferred = new Deferred()

  const xhr = new XMLHttpRequest()

  //-- Check from PDF.js:
  //   https://github.com/mozilla/pdf.js/blob/master/web/compatibility.js
  const xhrPrototype = XMLHttpRequest.prototype

  let header: string

  if (!('overrideMimeType' in xhrPrototype)) {
    // IE10 might have response, but not overrideMimeType
    Object.defineProperty(xhrPrototype, 'overrideMimeType', {
      value: function xmlHttpRequestOverrideMimeType() {
        // Empty implementation for IE10 compatibility
      }
    })
  }

  if (withCredentials) {
    xhr.withCredentials = true
  }

  xhr.onreadystatechange = handler
  xhr.onerror = err

  xhr.open('GET', url, true)

  for (header in headers) {
    xhr.setRequestHeader(header, headers[header])
  }

  if (type === 'json') {
    xhr.setRequestHeader('Accept', 'application/json')
  }

  // If type isn't set, determine it from the file extension
  if (!type) {
    type = new Path(url).extension
  }

  if (type === 'blob') {
    xhr.responseType = BLOB_RESPONSE
  }

  if (isXml(type)) {
    // xhr.responseType = "document";
    xhr.overrideMimeType('text/xml') // for OPF parsing
  }

  if (type === 'xhtml') {
    // xhr.responseType = "document";
  }

  if (type === 'html' || type === 'htm') {
    // xhr.responseType = "document";
  }

  if (type === 'binary') {
    xhr.responseType = 'arraybuffer'
  }

  xhr.send()

  function err(e: Event): void {
    deferred.reject!(e)
  }

  function handler(this: XMLHttpRequest): void {
    if (this.readyState === XMLHttpRequest.DONE) {
      let responseXML = false

      if (this.responseType === '' || this.responseType === 'document') {
        responseXML = !!this.responseXML
      }

      if (this.status === 200 || this.status === 0 || responseXML) {
        //-- Firefox is reporting 0 for blob urls
        let r: unknown

        if (!this.response && !responseXML) {
          deferred.reject!({
            status: this.status,
            message: 'Empty Response',
            stack: new Error().stack
          })
          return
        }

        if (this.status === 403) {
          deferred.reject!({
            status: this.status,
            response: this.response,
            message: 'Forbidden',
            stack: new Error().stack
          })
          return
        }

        if (responseXML) {
          r = this.responseXML
        } else if (type && isXml(type)) {
          // xhr.overrideMimeType("text/xml"); // for OPF parsing
          // If this.responseXML wasn't set, try to parse using a DOMParser from text
          r = parse(this.response, 'text/xml')
        } else if (type === 'xhtml') {
          r = parse(this.response, 'application/xhtml+xml')
        } else if (type === 'html' || type === 'htm') {
          r = parse(this.response, 'text/html')
        } else if (type === 'json') {
          r = JSON.parse(this.response)
        } else if (type === 'blob') {
          if (supportsURL) {
            r = this.response
          } else {
            //-- Safari doesn't support responseType blob, so create a blob from arraybuffer
            r = new Blob([this.response])
          }
        } else {
          r = this.response
        }

        deferred.resolve!(r)
      } else {
        deferred.reject!({
          status: this.status,
          message: this.response,
          stack: new Error().stack
        })
      }
    }
  }

  return deferred.promise
}

export default request
