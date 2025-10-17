import { qs, qsa, qsp, indexOfElementNode } from './utils/core'

interface ManifestItem {
  href: string
  type: string
  overlay: string
  properties: string[]
}

interface SpineItem {
  id?: string
  idref: string
  linear: string
  properties: string[]
  index: number
}

interface Metadata {
  title?: string
  creator?: string
  description?: string
  pubdate?: string
  publisher?: string
  identifier?: string
  language?: string
  rights?: string
  modified_date?: string
  layout?: string
  orientation?: string
  flow?: string
  viewport?: string
  media_active_class?: string
  spread?: string
  direction?: string
}

interface TocItem {
  title: string
  label: string
  href?: string
  id?: string
  level?: number
  children?: TocItem[]
}

interface ParsedPackage {
  metadata: Metadata
  spine: SpineItem[]
  manifest: { [id: string]: ManifestItem }
  navPath: string | false
  ncxPath: string | false
  coverPath: string | false
  spineNodeIndex: number
  toc?: TocItem[]
}

interface JSONResource {
  href: string
  type: string
  id: string
  rel?: string[]
  properties?: string[]
}

interface JSONManifest {
  metadata: Metadata
  readingOrder?: SpineItem[]
  spine?: SpineItem[]
  resources: JSONResource[]
  toc: TocItem[]
}

/**
 * Open Packaging Format Parser
 * @class
 * @param {document} packageDocument OPF XML
 */
class Packaging {
  public manifest: { [id: string]: ManifestItem } = {}
  public navPath: string | false = false
  public ncxPath: string | false = false
  public coverPath: string | false = false
  public spineNodeIndex: number = 0
  public spine: SpineItem[] = []
  public metadata: Metadata = {}
  public uniqueIdentifier: string = ''
  public toc?: TocItem[]

  constructor(packageDocument?: Document) {
    this.manifest = {}
    this.navPath = false
    this.ncxPath = false
    this.coverPath = false
    this.spineNodeIndex = 0
    this.spine = []
    this.metadata = {}

    if (packageDocument) {
      this.parse(packageDocument)
    }
  }

  /**
   * Parse OPF XML
   * @param  {document} packageDocument OPF XML
   * @return {object} parsed package parts
   */
  parse(packageDocument: Document): ParsedPackage {
    if (!packageDocument) {
      throw new Error('Package File Not Found')
    }

    const metadataNode = qs(packageDocument.documentElement, 'metadata')
    if (!metadataNode) {
      throw new Error('No Metadata Found')
    }

    const manifestNode = qs(packageDocument.documentElement, 'manifest')
    if (!manifestNode) {
      throw new Error('No Manifest Found')
    }

    const spineNode = qs(packageDocument.documentElement, 'spine')
    if (!spineNode) {
      throw new Error('No Spine Found')
    }

    this.manifest = this.parseManifest(manifestNode)
    this.navPath = this.findNavPath(manifestNode)
    this.ncxPath = this.findNcxPath(manifestNode, spineNode)
    this.coverPath = this.findCoverPath(packageDocument)

    this.spineNodeIndex = indexOfElementNode(spineNode)

    this.spine = this.parseSpine(spineNode)

    this.uniqueIdentifier = this.findUniqueIdentifier(packageDocument)
    this.metadata = this.parseMetadata(metadataNode)

    this.metadata.direction = spineNode.getAttribute('page-progression-direction') || undefined

    return {
      metadata: this.metadata,
      spine: this.spine,
      manifest: this.manifest,
      navPath: this.navPath,
      ncxPath: this.ncxPath,
      coverPath: this.coverPath,
      spineNodeIndex: this.spineNodeIndex
    }
  }

  /**
   * Parse Metadata
   * @private
   * @param  {node} xml
   * @return {object} metadata
   */
  parseMetadata(xml: Element): Metadata {
    const metadata: Metadata = {}

    metadata.title = this.getElementText(xml, 'title')
    metadata.creator = this.getElementText(xml, 'creator')
    metadata.description = this.getElementText(xml, 'description')
    metadata.pubdate = this.getElementText(xml, 'date')
    metadata.publisher = this.getElementText(xml, 'publisher')
    metadata.identifier = this.getElementText(xml, 'identifier')
    metadata.language = this.getElementText(xml, 'language')
    metadata.rights = this.getElementText(xml, 'rights')

    metadata.modified_date = this.getPropertyText(xml, 'dcterms:modified')

    metadata.layout = this.getPropertyText(xml, 'rendition:layout')
    metadata.orientation = this.getPropertyText(xml, 'rendition:orientation')
    metadata.flow = this.getPropertyText(xml, 'rendition:flow')
    metadata.viewport = this.getPropertyText(xml, 'rendition:viewport')
    metadata.media_active_class = this.getPropertyText(xml, 'media:active-class')
    metadata.spread = this.getPropertyText(xml, 'rendition:spread')

    return metadata
  }

  /**
   * Parse Manifest
   * @private
   * @param  {node} manifestXml
   * @return {object} manifest
   */
  parseManifest(manifestXml: Element): { [id: string]: ManifestItem } {
    const manifest: { [id: string]: ManifestItem } = {}

    //-- Turn items into an array
    const selected = qsa(manifestXml, 'item')
    const items = Array.prototype.slice.call(selected)

    //-- Create an object with the id as key
    items.forEach((item: Element) => {
      const id = item.getAttribute('id')
      if (!id) return

      const href = item.getAttribute('href') || ''
      const type = item.getAttribute('media-type') || ''
      const overlay = item.getAttribute('media-overlay') || ''
      const properties = item.getAttribute('properties') || ''

      manifest[id] = {
        href: href,
        type: type,
        overlay: overlay,
        properties: properties.length ? properties.split(' ') : []
      }
    })

    return manifest
  }

  /**
   * Parse Spine
   * @private
   * @param  {node} spineXml
   * @param  {Packaging.manifest} manifest
   * @return {object} spine
   */
  parseSpine(spineXml: Element): SpineItem[] {
    const spine: SpineItem[] = []

    const selected = qsa(spineXml, 'itemref')
    const items = Array.prototype.slice.call(selected)

    //-- Add to array to maintain ordering and cross reference with manifest
    items.forEach((item: Element, index: number) => {
      const idref = item.getAttribute('idref')
      if (!idref) return

      const props = item.getAttribute('properties') || ''
      const propArray = props.length ? props.split(' ') : []

      const itemref: SpineItem = {
        id: item.getAttribute('id') || undefined,
        idref: idref,
        linear: item.getAttribute('linear') || 'yes',
        properties: propArray,
        index: index
      }
      spine.push(itemref)
    })

    return spine
  }

  /**
   * Find Unique Identifier
   * @private
   * @param  {node} packageXml
   * @return {string} Unique Identifier text
   */
  findUniqueIdentifier(packageXml: Document): string {
    const uniqueIdentifierId = packageXml.documentElement.getAttribute('unique-identifier')
    if (!uniqueIdentifierId) {
      return ''
    }
    const identifier = packageXml.getElementById(uniqueIdentifierId)
    if (!identifier) {
      return ''
    }

    if (
      identifier.localName === 'identifier' &&
      identifier.namespaceURI === 'http://purl.org/dc/elements/1.1/'
    ) {
      return identifier.childNodes.length > 0 ? identifier.childNodes[0].nodeValue!.trim() : ''
    }

    return ''
  }

  /**
   * Find TOC NAV
   * @private
   * @param {element} manifestNode
   * @return {string}
   */
  findNavPath(manifestNode: Element): string | false {
    // Find item with property "nav"
    // Should catch nav regardless of order
    const node = qsp(manifestNode, 'item', { properties: 'nav' })
    return node ? node.getAttribute('href') || false : false
  }

  /**
   * Find TOC NCX
   * media-type="application/x-dtbncx+xml" href="toc.ncx"
   * @private
   * @param {element} manifestNode
   * @param {element} spineNode
   * @return {string}
   */
  findNcxPath(manifestNode: Element, spineNode: Element): string | false {
    let node = qsp(manifestNode, 'item', { 'media-type': 'application/x-dtbncx+xml' })
    let tocId: string | null

    // If we can't find the toc by media-type then try to look for id of the item in the spine attributes as
    // according to http://www.idpf.org/epub/20/spec/OPF_2.0.1_draft.htm#Section2.4.1.2,
    // "The item that describes the NCX must be referenced by the spine toc attribute."
    if (!node) {
      tocId = spineNode.getAttribute('toc')
      if (tocId) {
        node = manifestNode.querySelector(`#${tocId}`)
      }
    }

    return node ? node.getAttribute('href') || false : false
  }

  /**
   * Find the Cover Path
   * <item properties="cover-image" id="ci" href="cover.svg" media-type="image/svg+xml" />
   * Fallback for Epub 2.0
   * @private
   * @param  {node} packageXml
   * @return {string} href
   */
  findCoverPath(packageXml: Document): string | false {
    const pkg = qs(packageXml.documentElement, 'package')

    // Try parsing cover with epub 3.
    const node = qsp(pkg || packageXml.documentElement, 'item', { properties: 'cover-image' })
    if (node) return node.getAttribute('href') || false

    // Fallback to epub 2.
    const metaCover = qsp(pkg || packageXml.documentElement, 'meta', { name: 'cover' })

    if (metaCover) {
      const coverId = metaCover.getAttribute('content')
      if (coverId) {
        const cover = packageXml.getElementById(coverId)
        return cover ? cover.getAttribute('href') || false : false
      }
    }

    return false
  }

  /**
   * Get text of a namespaced element
   * @private
   * @param  {node} xml
   * @param  {string} tag
   * @return {string} text
   */
  getElementText(xml: Element, tag: string): string {
    const found = xml.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', tag)

    if (!found || found.length === 0) return ''

    const el = found[0]

    if (el.childNodes.length) {
      return el.childNodes[0].nodeValue || ''
    }

    return ''
  }

  /**
   * Get text by property
   * @private
   * @param  {node} xml
   * @param  {string} property
   * @return {string} text
   */
  getPropertyText(xml: Element, property: string): string {
    const el = qsp(xml, 'meta', { property: property })

    if (el && el.childNodes.length) {
      return el.childNodes[0].nodeValue || ''
    }

    return ''
  }

  /**
   * Load JSON Manifest
   * @param  {object} json JSON manifest
   * @return {object} parsed package parts
   */
  load(json: JSONManifest): ParsedPackage {
    this.metadata = json.metadata

    const spine = json.readingOrder || json.spine || []
    this.spine = spine.map((item: SpineItem, index: number) => {
      const spineItem: SpineItem = {
        ...item,
        index,
        linear: item.linear || 'yes'
      }
      return spineItem
    })

    json.resources.forEach((item: JSONResource, index: number) => {
      this.manifest[index] = {
        href: item.href,
        type: item.type,
        overlay: '',
        properties: item.properties || []
      }

      if (item.rel && item.rel[0] === 'cover') {
        this.coverPath = item.href
      }
    })

    this.spineNodeIndex = 0

    this.toc = json.toc.map((item: TocItem) => {
      const tocItem: TocItem = {
        ...item,
        label: item.title
      }
      return tocItem
    })

    return {
      metadata: this.metadata,
      spine: this.spine,
      manifest: this.manifest,
      navPath: this.navPath,
      ncxPath: this.ncxPath,
      coverPath: this.coverPath,
      spineNodeIndex: this.spineNodeIndex,
      toc: this.toc
    }
  }

  destroy(): void {
    this.manifest = {}
    this.navPath = false
    this.ncxPath = false
    this.coverPath = false
    this.spineNodeIndex = 0
    this.spine = []
    this.metadata = {}
    this.uniqueIdentifier = ''
    this.toc = undefined
  }
}

export default Packaging
