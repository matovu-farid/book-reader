/**
 * Core Utilities and Helpers
 * @module Core
 */
import { DOMParser as XMLDOMParser } from '@xmldom/xmldom'

/**
 * Vendor prefixed requestAnimationFrame
 * @returns {function} requestAnimationFrame
 * @memberof Core
 */
export const requestAnimationFrame: ((callback: FrameRequestCallback) => number) | false =
  typeof window !== 'undefined'
    ? window.requestAnimationFrame ||
      ((window as unknown as Record<string, unknown>).mozRequestAnimationFrame as
        | ((callback: FrameRequestCallback) => number)
        | undefined) ||
      ((window as unknown as Record<string, unknown>).webkitRequestAnimationFrame as
        | ((callback: FrameRequestCallback) => number)
        | undefined) ||
      ((window as unknown as Record<string, unknown>).msRequestAnimationFrame as
        | ((callback: FrameRequestCallback) => number)
        | undefined)
    : false

const ELEMENT_NODE = 1
const TEXT_NODE = 3
// const COMMENT_NODE = 8
// const DOCUMENT_NODE = 9
const _URL =
  typeof URL !== 'undefined'
    ? URL
    : typeof window !== 'undefined'
      ? (window as unknown as Record<string, unknown>).URL ||
        (window as unknown as Record<string, unknown>).webkitURL ||
        (window as unknown as Record<string, unknown>).mozURL
      : undefined

/**
 * Generates a UUID
 * based on: http://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid-in-javascript
 * @returns {string} uuid
 * @memberof Core
 */
export function uuid(): string {
  let d = new Date().getTime()
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (d + Math.random() * 16) % 16 | 0
    d = Math.floor(d / 16)
    return (c === 'x' ? r : (r & 0x7) | 0x8).toString(16)
  })
  return uuid
}

/**
 * Gets the height of a document
 * @returns {number} height
 * @memberof Core
 */
export function documentHeight(): number {
  return Math.max(
    document.documentElement.clientHeight,
    document.body.scrollHeight,
    document.documentElement.scrollHeight,
    document.body.offsetHeight,
    document.documentElement.offsetHeight
  )
}

/**
 * Checks if a node is an element
 * @param {object} obj
 * @returns {boolean}
 * @memberof Core
 */
export function isElement(obj: unknown): obj is Element {
  return !!(obj && typeof obj === 'object' && (obj as Record<string, unknown>).nodeType === 1)
}

/**
 * @param {unknown} n
 * @returns {boolean}
 * @memberof Core
 */
export function isNumber(n: unknown): boolean {
  return !isNaN(parseFloat(String(n))) && isFinite(Number(n))
}

/**
 * @param {unknown} n
 * @returns {boolean}
 * @memberof Core
 */
export function isFloat(n: unknown): boolean {
  const f = parseFloat(String(n))

  if (isNumber(n) === false) {
    return false
  }

  if (typeof n === 'string' && n.indexOf('.') > -1) {
    return true
  }

  return Math.floor(f) !== f
}

/**
 * Get a prefixed css property
 * @param {string} unprefixed
 * @returns {string}
 * @memberof Core
 */
export function prefixed(unprefixed: string): string {
  const vendors = ['Webkit', 'webkit', 'Moz', 'O', 'ms']
  const prefixes = ['-webkit-', '-webkit-', '-moz-', '-o-', '-ms-']
  const lower = unprefixed.toLowerCase()
  const length = vendors.length

  if (
    typeof document === 'undefined' ||
    typeof (document.body.style as unknown as Record<string, unknown>)[lower] !== 'undefined'
  ) {
    return unprefixed
  }

  for (let i = 0; i < length; i++) {
    if (
      typeof (document.body.style as unknown as Record<string, unknown>)[prefixes[i] + lower] !==
      'undefined'
    ) {
      return prefixes[i] + lower
    }
  }

  return unprefixed
}

/**
 * Apply defaults to an object
 * @param {object} obj
 * @returns {object}
 * @memberof Core
 */
export function defaults<T extends Record<string, unknown>>(
  obj: T,
  ...sources: Record<string, unknown>[]
): T {
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i]
    for (const prop in source) {
      if ((obj as Record<string, unknown>)[prop] === undefined) {
        ;(obj as Record<string, unknown>)[prop] = source[prop]
      }
    }
  }
  return obj
}

/**
 * Extend properties of an object
 * @param {object} target
 * @returns {object}
 * @memberof Core
 */
export function extend<T extends Record<string, unknown>>(
  target: T,
  ...sources: Record<string, unknown>[]
): T {
  sources.forEach(function (source) {
    if (!source) return
    Object.getOwnPropertyNames(source).forEach(function (propName) {
      Object.defineProperty(target, propName, Object.getOwnPropertyDescriptor(source, propName)!)
    })
  })
  return target
}

/**
 * Fast quicksort insert for sorted array -- based on:
 *  http://stackoverflow.com/questions/1344500/efficient-way-to-insert-a-number-into-a-sorted-array-of-numbers
 * @param {T} item - Item to insert
 * @param {T[]} array - Sorted array to insert into
 * @param {function} [compareFunction] - Optional comparison function
 * @returns {number} location (in array)
 * @memberof Core
 */
export function insert<T>(item: T, array: T[], compareFunction?: (a: T, b: T) => number): number {
  const location = locationOf(item, array, compareFunction)
  array.splice(location, 0, item)
  return location
}

/**
 * Finds where something would fit into a sorted array
 * @param {T} item - Item to find location for
 * @param {T[]} array - Sorted array to search
 * @param {function} [compareFunction] - Optional comparison function
 * @param {number} [_start] - Optional start index
 * @param {number} [_end] - Optional end index
 * @returns {number} location (in array)
 * @memberof Core
 */
export function locationOf<T>(
  item: T,
  array: T[],
  compareFunction?: (a: T, b: T) => number,
  _start?: number,
  _end?: number
): number {
  const start = _start || 0
  const end = _end || array.length
  const pivot = parseInt(String(start + (end - start) / 2))

  if (!compareFunction) {
    compareFunction = function (a: T, b: T) {
      if (a > b) return 1
      if (a < b) return -1
      if (a === b) return 0
      return 0
    }
  }

  if (end - start <= 0) {
    return pivot
  }

  const compared = compareFunction(array[pivot], item)
  if (end - start === 1) {
    return compared >= 0 ? pivot : pivot + 1
  }
  if (compared === 0) {
    return pivot
  }
  if (compared === -1) {
    return locationOf(item, array, compareFunction, pivot, end)
  } else {
    return locationOf(item, array, compareFunction, start, pivot)
  }
}

/**
 * Finds index of something in a sorted array
 * Returns -1 if not found
 * @param {T} item - Item to find
 * @param {T[]} array - Sorted array to search
 * @param {function} [compareFunction] - Optional comparison function
 * @param {number} [_start] - Optional start index
 * @param {number} [_end] - Optional end index
 * @returns {number} index (in array) or -1
 * @memberof Core
 */
export function indexOfSorted<T>(
  item: T,
  array: T[],
  compareFunction?: (a: T, b: T) => number,
  _start?: number,
  _end?: number
): number {
  const start = _start || 0
  const end = _end || array.length
  const pivot = parseInt(String(start + (end - start) / 2))

  if (!compareFunction) {
    compareFunction = function (a: T, b: T) {
      if (a > b) return 1
      if (a < b) return -1
      if (a === b) return 0
      return 0
    }
  }

  if (end - start <= 0) {
    return -1 // Not found
  }

  const compared = compareFunction(array[pivot], item)
  if (end - start === 1) {
    return compared === 0 ? pivot : -1
  }
  if (compared === 0) {
    return pivot // Found
  }
  if (compared === -1) {
    return indexOfSorted(item, array, compareFunction, pivot, end)
  } else {
    return indexOfSorted(item, array, compareFunction, start, pivot)
  }
}

/**
 * Find the bounds of an element
 * taking padding and margin into account
 * @param {element} el
 * @returns {{ width: Number, height: Number}}
 * @memberof Core
 */
export function bounds(el: Element): { width: number; height: number } {
  const style = window.getComputedStyle(el)
  const widthProps = [
    'width',
    'paddingRight',
    'paddingLeft',
    'marginRight',
    'marginLeft',
    'borderRightWidth',
    'borderLeftWidth'
  ]
  const heightProps = [
    'height',
    'paddingTop',
    'paddingBottom',
    'marginTop',
    'marginBottom',
    'borderTopWidth',
    'borderBottomWidth'
  ]

  let width = 0
  let height = 0

  widthProps.forEach(function (prop) {
    width += parseFloat((style as unknown as Record<string, unknown>)[prop] as string) || 0
  })

  heightProps.forEach(function (prop) {
    height += parseFloat((style as unknown as Record<string, unknown>)[prop] as string) || 0
  })

  return {
    height: height,
    width: width
  }
}

/**
 * Find the bounds of an element
 * taking padding, margin and borders into account
 * @param {element} el
 * @returns {{ width: Number, height: Number}}
 * @memberof Core
 */
export function borders(el: Element): { width: number; height: number } {
  const style = window.getComputedStyle(el)
  const widthProps = [
    'paddingRight',
    'paddingLeft',
    'marginRight',
    'marginLeft',
    'borderRightWidth',
    'borderLeftWidth'
  ]
  const heightProps = [
    'paddingTop',
    'paddingBottom',
    'marginTop',
    'marginBottom',
    'borderTopWidth',
    'borderBottomWidth'
  ]

  let width = 0
  let height = 0

  widthProps.forEach(function (prop) {
    width += parseFloat((style as unknown as Record<string, unknown>)[prop] as string) || 0
  })

  heightProps.forEach(function (prop) {
    height += parseFloat((style as unknown as Record<string, unknown>)[prop] as string) || 0
  })

  return {
    height: height,
    width: width
  }
}

/**
 * Find the bounds of any node
 * allows for getting bounds of text nodes by wrapping them in a range
 * @param {node} node
 * @returns {BoundingClientRect}
 * @memberof Core
 */
export function nodeBounds(node: Node): DOMRect {
  let elPos: DOMRect
  const doc = node.ownerDocument!
  if (node.nodeType === Node.TEXT_NODE) {
    const elRange = doc.createRange()
    elRange.selectNodeContents(node)
    elPos = elRange.getBoundingClientRect()
  } else {
    elPos = (node as Element).getBoundingClientRect()
  }
  return elPos
}

/**
 * Find the equivalent of getBoundingClientRect of a browser window
 * @returns {{ width: Number, height: Number, top: Number, left: Number, right: Number, bottom: Number }}
 * @memberof Core
 */
export function windowBounds(): {
  width: number
  height: number
  top: number
  left: number
  right: number
  bottom: number
} {
  const width = window.innerWidth
  const height = window.innerHeight

  return {
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    width: width,
    height: height
  }
}

/**
 * Gets the index of a node in its parent
 * @param {Node} node - Node to find index of
 * @param {number} typeId - Node type ID to filter by
 * @return {number} index
 * @memberof Core
 */
export function indexOfNode(node: Node, typeId: number): number {
  const parent = node.parentNode
  if (!parent) {
    throw new Error('Node has no parent')
  }

  const children = parent.childNodes
  let index = -1

  for (let i = 0; i < children.length; i++) {
    const sibling = children[i]
    if (sibling.nodeType === typeId) {
      index++
    }
    if (sibling === node) break
  }

  return index
}

/**
 * Gets the index of a text node in its parent
 * @param {Node} textNode - Text node to find index of
 * @returns {number} index
 * @memberof Core
 */
export function indexOfTextNode(textNode: Node): number {
  return indexOfNode(textNode, TEXT_NODE)
}

/**
 * Gets the index of an element node in its parent
 * @param {Element} elementNode - Element node to find index of
 * @returns {number} index
 * @memberof Core
 */
export function indexOfElementNode(elementNode: Element): number {
  return indexOfNode(elementNode, ELEMENT_NODE)
}

/**
 * Check if extension is xml
 * @param {string} ext - File extension to check
 * @returns {boolean}
 * @memberof Core
 */
export function isXml(ext: string): boolean {
  const xmlExtensions = ['xml', 'opf', 'ncx'] as const
  return xmlExtensions.includes(ext as (typeof xmlExtensions)[number])
}

/**
 * Create a new blob
 * @param {BlobPart} content - Content for the blob
 * @param {string} mime - MIME type
 * @returns {Blob}
 * @memberof Core
 */
export function createBlob(content: BlobPart | BlobPart[], mime: string): Blob {
  const parts = Array.isArray(content) ? content : [content]
  return new Blob(parts, { type: mime })
}

/**
 * Create a new blob url
 * @param {BlobPart | BlobPart[]} content - Content for the blob
 * @param {string} mime - MIME type
 * @returns {string} url
 * @memberof Core
 */
export function createBlobUrl(content: BlobPart | BlobPart[], mime: string): string {
  const blob = createBlob(content, mime)

  if (!_URL) {
    throw new Error('URL constructor not available')
  }

  const tempUrl = (_URL as unknown as { createObjectURL: (blob: Blob) => string }).createObjectURL(
    blob
  )

  return tempUrl
}

/**
 * Remove a blob url
 * @param {string} url - URL to revoke
 * @memberof Core
 */
export function revokeBlobUrl(url: string): void {
  if (!_URL) {
    throw new Error('URL constructor not available')
  }

  ;(_URL as unknown as { revokeObjectURL: (url: string) => void }).revokeObjectURL(url)
}

/**
 * Create a new base64 encoded url
 * @param {string} content - String content to encode
 * @param {string} mime - MIME type
 * @returns {string} url
 * @memberof Core
 */
export function createBase64Url(content: string, mime: string): string {
  const data = btoa(content)
  const datauri = 'data:' + mime + ';base64,' + data

  return datauri
}

/**
 * Get type of an object
 * @param {unknown} obj - Object to get type of
 * @returns {string} type
 * @memberof Core
 */
export function type(obj: unknown): string {
  return Object.prototype.toString.call(obj).slice(8, -1)
}

/**
 * Parse xml (or html) markup
 * @param {string} markup
 * @param {string} mime
 * @param {boolean} forceXMLDom force using xmlDom to parse instead of native parser
 * @returns {document} document
 * @memberof Core
 */
export function parse(markup: string, mime: string, forceXMLDom?: boolean): Document {
  let Parser: typeof DOMParser | typeof XMLDOMParser

  if (typeof DOMParser === 'undefined' || forceXMLDom) {
    Parser = XMLDOMParser
  } else {
    Parser = DOMParser
  }

  // Remove byte order mark before parsing
  // https://www.w3.org/International/questions/qa-byte-order-mark
  if (markup.charCodeAt(0) === 0xfeff) {
    markup = markup.slice(1)
  }

  const doc = new Parser().parseFromString(markup, mime as DOMParserSupportedType)

  return doc
}

/**
 * querySelector polyfill
 * @param {element} el
 * @param {string} sel selector string
 * @returns {element} element
 * @memberof Core
 */
export function qs(el: Element, sel: string): Element | null {
  let elements: HTMLCollectionOf<Element>
  if (!el) {
    throw new Error('No Element Provided')
  }

  if (typeof (el as unknown as Record<string, unknown>).querySelector !== 'undefined') {
    return el.querySelector(sel)
  } else {
    elements = el.getElementsByTagName(sel)
    if (elements.length) {
      return elements[0]
    }
  }
  return null
}

/**
 * querySelectorAll polyfill
 * @param {element} el
 * @param {string} sel selector string
 * @returns {element[]} elements
 * @memberof Core
 */
export function qsa(el: Element, sel: string): NodeListOf<Element> | HTMLCollectionOf<Element> {
  if (typeof (el as unknown as Record<string, unknown>).querySelector !== 'undefined') {
    return el.querySelectorAll(sel)
  } else {
    return el.getElementsByTagName(sel)
  }
}

/**
 * querySelector by property
 * @param {Element} el - Element to search in
 * @param {string} sel - Selector string
 * @param {Record<string, unknown>} props - Properties to filter by
 * @returns {Element | null} Found element or null
 * @memberof Core
 */
export function qsp(el: Element, sel: string, props: Record<string, unknown>): Element | null {
  let q: HTMLCollectionOf<Element>, filtered: Element[]
  if (typeof el.querySelector === 'function') {
    let selector = sel + '['
    const propEntries = Object.entries(props)
    for (let i = 0; i < propEntries.length; i++) {
      const [prop, value] = propEntries[i]
      selector += prop + "~='" + value + "'"
      if (i < propEntries.length - 1) {
        selector += ','
      }
    }
    selector += ']'
    return el.querySelector(selector)
  } else {
    q = el.getElementsByTagName(sel)
    filtered = Array.prototype.slice.call(q, 0).filter(function (element) {
      return Object.entries(props).some(([prop, value]) => element.getAttribute(prop) === value)
    })

    if (filtered.length > 0) {
      return filtered[0]
    }
  }
  return null
}

/**
 * Sprint through all text nodes in a document
 * @memberof Core
 * @param  {Element} root - Element to start with
 * @param  {function} func - Function to run on each text node
 */
export function sprint(root: Element, func: (node: Text) => void): void {
  const doc = root.ownerDocument
  if (!doc) {
    throw new Error('Element must have an owner document')
  }

  if (typeof doc.createTreeWalker === 'function') {
    treeWalker(
      root,
      (node: Node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          func(node as Text)
        }
      },
      NodeFilter.SHOW_TEXT
    )
  } else {
    walk(root, function (node) {
      if (node && node.nodeType === Node.TEXT_NODE) {
        func(node as Text)
      }
      return false
    })
  }
}

/**
 * Create a treeWalker
 * @memberof Core
 * @param  {Element} root - Element to start with
 * @param  {function} func - Function to run on each element
 * @param  {number} filter - NodeFilter constant to filter with
 */
export function treeWalker(root: Element, func: (node: Node) => void, filter: number): void {
  const walker = document.createTreeWalker(root, filter)
  let node: Node | null
  while ((node = walker.nextNode())) {
    func(node)
  }
}

/**
 * Walk through DOM nodes recursively
 * @memberof Core
 * @param {Node} node - Starting node
 * @param {function} callback - Function to call on each node. Return true to stop walking
 * @returns {boolean} True if walking was stopped by callback
 */
export function walk(node: Node, callback: (node: Node) => boolean): boolean {
  if (callback(node)) {
    return true
  }

  let child = node.firstChild
  while (child) {
    const stopped = walk(child, callback)
    if (stopped) {
      return true
    }
    child = child.nextSibling
  }

  return false
}

/**
 * Convert a blob to a base64 encoded string
 * @param {Blob} blob
 * @returns {string}
 * @memberof Core
 */
export function blob2base64(blob: Blob): Promise<string> {
  return new Promise(function (resolve) {
    const reader = new FileReader()
    reader.readAsDataURL(blob)
    reader.onloadend = function () {
      resolve(reader.result as string)
    }
  })
}

/**
 * Creates a new pending promise and provides methods to resolve or reject it.
 * From: https://developer.mozilla.org/en-US/docs/Mozilla/JavaScript_code_modules/Promise.jsm/Deferred#backwards_forwards_compatible
 * @memberof Core
 */
export class Deferred<T = unknown> {
  public resolve: ((value: T | PromiseLike<T>) => void) | null = null
  public reject: ((reason?: unknown) => void) | null = null
  public id: string
  public promise: Promise<T>

  constructor() {
    this.id = uuid()

    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve
      this.reject = reject
    })
    Object.freeze(this)
  }
}

/**
 * Legacy function for backwards compatibility
 */
export function defer<T = unknown>(): Deferred<T> {
  return new Deferred<T>()
}

/**
 * querySelector with filter by epub type
 * @param {Element} html - HTML element to search in
 * @param {string} element - Element type to find
 * @param {string} type - EPUB type to find
 * @returns {Element | null} Found element or null
 * @memberof Core
 */
export function querySelectorByType(html: Element, element: string, type: string): Element | null {
  let query: Element | null = null
  if (typeof html.querySelector === 'function') {
    query = html.querySelector(`${element}[*|type="${type}"]`)
  }
  // Handle IE not supporting namespaced epub:type in querySelector
  if (!query) {
    const qsaResult = qsa(html, element)
    const queryArray = Array.isArray(qsaResult) ? qsaResult : Array.from(qsaResult)
    for (let i = 0; i < queryArray.length; i++) {
      if (
        queryArray[i].getAttributeNS('http://www.idpf.org/2007/ops', 'type') === type ||
        queryArray[i].getAttribute('epub:type') === type
      ) {
        return queryArray[i]
      }
    }
  } else {
    return query
  }
  return null
}

/**
 * Find direct descendents of an element
 * @param {element} el
 * @returns {element[]} children
 * @memberof Core
 */
export function findChildren(el: Element): Element[] {
  const result: Element[] = []
  const childNodes = el.childNodes
  for (let i = 0; i < childNodes.length; i++) {
    const node = childNodes[i]
    if (node.nodeType === 1) {
      result.push(node as Element)
    }
  }
  return result
}

/**
 * Find all parents (ancestors) of an element
 * @param {element} node
 * @returns {element[]} parents
 * @memberof Core
 */
export function parents(node: Element): Element[] {
  const nodes: Element[] = [node]
  let current: Element | null = node
  for (; current; current = current.parentElement) {
    nodes.unshift(current)
  }
  return nodes
}

/**
 * Find all direct descendents of a specific type
 * @param {element} el
 * @param {string} nodeName
 * @param {boolean} [single]
 * @returns {element[]} children
 * @memberof Core
 */
export function filterChildren(
  el: Element,
  nodeName: string,
  single?: boolean
): Element[] | Element | null {
  const result: Element[] = []
  const childNodes = el.childNodes
  for (let i = 0; i < childNodes.length; i++) {
    const node = childNodes[i]
    if (node.nodeType === 1 && node.nodeName.toLowerCase() === nodeName) {
      if (single) {
        return node as Element
      } else {
        result.push(node as Element)
      }
    }
  }
  if (!single) {
    return result
  }
  return null
}

/**
 * Filter all parents (ancestors) with tag name
 * @param {element} node
 * @param {string} tagname
 * @returns {element[]} parents
 * @memberof Core
 */
export function getParentByTagName(node: Element, tagname: string): Element | null {
  let parent: Element | null
  if (node === null || tagname === '') return null
  parent = node.parentElement
  while (parent && parent.nodeType === 1) {
    if (parent.tagName.toLowerCase() === tagname) {
      return parent
    }
    parent = parent.parentElement
  }
  return null
}

/**
 * Lightweight Polyfill for DOM Range
 * @class
 * @memberof Core
 */
export class RangeObject {
  public collapsed: boolean = false
  public commonAncestorContainer: Element | undefined = undefined
  public endContainer: Node | undefined = undefined
  public endOffset: number | undefined = undefined
  public startContainer: Node | undefined = undefined
  public startOffset: number | undefined = undefined

  setStart(startNode: Node, startOffset: number): void {
    this.startContainer = startNode
    this.startOffset = startOffset

    if (!this.endContainer) {
      this.collapse(true)
    } else {
      this.commonAncestorContainer = this._commonAncestorContainer()
    }

    this._checkCollapsed()
  }

  setEnd(endNode: Node, endOffset: number): void {
    this.endContainer = endNode
    this.endOffset = endOffset

    if (!this.startContainer) {
      this.collapse(false)
    } else {
      this.collapsed = false
      this.commonAncestorContainer = this._commonAncestorContainer()
    }

    this._checkCollapsed()
  }

  collapse(toStart: boolean): void {
    this.collapsed = true
    if (toStart) {
      this.endContainer = this.startContainer
      this.endOffset = this.startOffset
      this.commonAncestorContainer = this.startContainer!.parentElement!
    } else {
      this.startContainer = this.endContainer
      this.startOffset = this.endOffset
      this.commonAncestorContainer = this.endContainer!.parentElement!
    }
  }

  selectNode(referenceNode: Node): void {
    const parent = referenceNode.parentNode!
    const index = Array.prototype.indexOf.call(parent.childNodes, referenceNode)
    this.setStart(parent, index)
    this.setEnd(parent, index + 1)
  }

  selectNodeContents(referenceNode: Node): void {
    // const end = referenceNode.childNodes[referenceNode.childNodes.length - 1]
    const endIndex =
      referenceNode.nodeType === 3
        ? (referenceNode as Text).textContent!.length
        : referenceNode.childNodes.length
    this.setStart(referenceNode, 0)
    this.setEnd(referenceNode, endIndex)
  }

  _commonAncestorContainer(startContainer?: Node, endContainer?: Node): Element | undefined {
    const startParents = parents((startContainer as Element) || (this.startContainer as Element))
    const endParents = parents((endContainer as Element) || (this.endContainer as Element))

    if (startParents[0] !== endParents[0]) return undefined

    for (let i = 0; i < startParents.length; i++) {
      if (startParents[i] !== endParents[i]) {
        return startParents[i - 1]
      }
    }
    return undefined
  }

  _checkCollapsed(): void {
    if (this.startContainer === this.endContainer && this.startOffset === this.endOffset) {
      this.collapsed = true
    } else {
      this.collapsed = false
    }
  }

  toString(): string {
    // TODO: implement walking between start and end to find text
    return ''
  }
}
