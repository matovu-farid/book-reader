import Book from './book'
import Rendition from './rendition'
import CFI from './epubcfi'
import Contents from './contents'
import * as utils from './utils/core'
import { EPUBJS_VERSION } from './utils/constants'

// import IframeView from './managers/views/iframe'
// import DefaultViewManager from './managers/default'
// import ContinuousViewManager from './managers/continuous'

interface ePubOptions {
  // Add any common options that might be passed to Book
  [key: string]: unknown
}

/**
 * Creates a new Book
 */
function Epub(url: string | ArrayBuffer, options?: ePubOptions): Book {
  return new Book(url, options)
}

Epub.VERSION = EPUBJS_VERSION

if (typeof global !== 'undefined') {
  ;(global as unknown as { EPUBJS_VERSION: string }).EPUBJS_VERSION = EPUBJS_VERSION
}

Epub.Book = Book
Epub.Rendition = Rendition
Epub.Contents = Contents
Epub.CFI = CFI
Epub.utils = utils


export default Epub
