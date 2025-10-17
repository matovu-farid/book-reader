import path from 'path-webpack'
import { qs } from './utils/core'

/**
 * Handles Parsing and Accessing an Epub Container
 * @class
 * @param {document} [containerDocument] xml document
 */
class Container {
  public packagePath: string = ''
  public directory: string = ''
  public encoding: string = ''

  constructor(containerDocument?: Document) {
    this.packagePath = ''
    this.directory = ''
    this.encoding = ''

    if (containerDocument) {
      this.parse(containerDocument)
    }
  }

  /**
   * Parse the Container XML
   * @param  {document} containerDocument
   */
  parse(containerDocument: Document): void {
    //-- <rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml"/>
    if (!containerDocument) {
      throw new Error('Container File Not Found')
    }

    const rootfile = qs(containerDocument.documentElement, 'rootfile')

    if (!rootfile) {
      throw new Error('No RootFile Found')
    }

    this.packagePath = rootfile.getAttribute('full-path') || ''
    this.directory = path.parse(this.packagePath).dir
    this.encoding = containerDocument.characterSet || containerDocument.charset || ''
  }

  destroy(): void {
    this.packagePath = ''
    this.directory = ''
    this.encoding = ''
  }
}

export default Container
