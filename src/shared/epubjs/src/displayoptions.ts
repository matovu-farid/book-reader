import { qs, qsa } from './utils/core'

/**
 * Open DisplayOptions Format Parser
 * @class
 * @param {document} displayOptionsDocument XML
 */
class DisplayOptions {
  interactive: string
  fixedLayout: string
  openToSpread: string
  orientationLock: string

  constructor(displayOptionsDocument?: Document) {
    this.interactive = ''
    this.fixedLayout = ''
    this.openToSpread = ''
    this.orientationLock = ''

    if (displayOptionsDocument) {
      this.parse(displayOptionsDocument)
    }
  }

  /**
   * Parse XML
   * @param  {document} displayOptionsDocument XML
   * @return {DisplayOptions} self
   */
  parse(displayOptionsDocument: Document): DisplayOptions {
    if (!displayOptionsDocument) {
      return this
    }

    const displayOptionsNode = qs(displayOptionsDocument.documentElement, 'display_options')
    if (!displayOptionsNode) {
      return this
    }

    const options = qsa(displayOptionsNode, 'option')
    Array.from(options).forEach((el) => {
      let value = ''

      if (el.childNodes.length) {
        value = el.childNodes[0].nodeValue || ''
      }

      const nameAttr = el.attributes.getNamedItem('name')
      if (!nameAttr) return

      switch (nameAttr.value) {
        case 'interactive':
          this.interactive = value
          break
        case 'fixed-layout':
          this.fixedLayout = value
          break
        case 'open-to-spread':
          this.openToSpread = value
          break
        case 'orientation-lock':
          this.orientationLock = value
          break
      }
    })

    return this
  }

  destroy(): void {
    this.interactive = ''
    this.fixedLayout = ''
    this.openToSpread = ''
    this.orientationLock = ''
  }
}

export default DisplayOptions
