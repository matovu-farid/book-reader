import { qs, qsa, querySelectorByType, filterChildren } from './utils/core'

interface NavItem {
  id?: string
  href: string
  label: string
  subitems: NavItem[]
  parent?: string
}

interface LandmarkItem {
  href: string
  label: string
  type?: string
}

/**
 * Navigation Parser
 * @param {document} xml navigation html / xhtml / ncx
 */
class Navigation {
  public toc: NavItem[] = []
  public tocByHref: { [href: string]: number } = {}
  public tocById: { [id: string]: number } = {}
  public landmarks: LandmarkItem[] = []
  public landmarksByType: { [type: string]: number } = {}
  public length: number = 0

  constructor(xml?: Document | unknown) {
    this.toc = []
    this.tocByHref = {}
    this.tocById = {}

    this.landmarks = []
    this.landmarksByType = {}

    this.length = 0
    if (xml) {
      this.parse(xml)
    }
  }

  /**
   * Parse out the navigation items
   * @param {document} xml navigation html / xhtml / ncx
   */
  parse(xml: Document | unknown): void {
    const isXml = xml && typeof xml === 'object' && 'nodeType' in xml && xml.nodeType
    let html: Element | null = null
    let ncx: Element | null = null

    if (isXml) {
      const doc = xml as Document
      html = qs(doc.documentElement, 'html')
      ncx = qs(doc.documentElement, 'ncx')
    }

    if (!isXml) {
      this.toc = this.load(xml as unknown[])
    } else if (html) {
      this.toc = this.parseNav(xml as Document)
      this.landmarks = this.parseLandmarks(xml as Document)
    } else if (ncx) {
      this.toc = this.parseNcx(xml as Document)
    }

    this.length = 0

    this.unpack(this.toc)
  }

  /**
   * Unpack navigation items
   * @private
   * @param  {array} toc
   */
  unpack(toc: NavItem[]): void {
    let item: NavItem

    for (let i = 0; i < toc.length; i++) {
      item = toc[i]

      if (item.href) {
        this.tocByHref[item.href] = i
      }

      if (item.id) {
        this.tocById[item.id] = i
      }

      this.length++

      if (item.subitems.length) {
        this.unpack(item.subitems)
      }
    }
  }

  /**
   * Get an item from the navigation
   * @param  {string} target
   * @return {object} navItem
   */
  get(target?: string): NavItem | NavItem[] | undefined {
    let index: number | undefined

    if (!target) {
      return this.toc
    }

    if (target.indexOf('#') === 0) {
      index = this.tocById[target.substring(1)]
    } else if (target in this.tocByHref) {
      index = this.tocByHref[target]
    }

    return this.getByIndex(target, index, this.toc)
  }

  /**
   * Get an item from navigation subitems recursively by index
   * @param  {string} target
   * @param  {number} index
   * @param  {array} navItems
   * @return {object} navItem
   */
  getByIndex(target: string, index: number | undefined, navItems: NavItem[]): NavItem | undefined {
    if (navItems.length === 0) {
      return
    }

    const item = navItems[index!]
    if (item && (target === item.id || target === item.href)) {
      return item
    } else {
      let result: NavItem | undefined
      for (let i = 0; i < navItems.length; ++i) {
        result = this.getByIndex(target, index, navItems[i].subitems)
        if (result) {
          break
        }
      }
      return result
    }
  }

  /**
   * Get a landmark by type
   * List of types: https://idpf.github.io/epub-vocabs/structure/
   * @param  {string} type
   * @return {object} landmarkItem
   */
  landmark(type?: string): LandmarkItem | LandmarkItem[] | undefined {
    if (!type) {
      return this.landmarks
    }

    const index = this.landmarksByType[type]
    if (index === undefined) {
      return undefined
    }

    return this.landmarks[index]
  }

  /**
   * Parse toc from a Epub > 3.0 Nav
   * @private
   * @param  {document} navHtml
   * @return {array} navigation list
   */
  parseNav(navHtml: Document): NavItem[] {
    const navElement = querySelectorByType(navHtml.documentElement, 'nav', 'toc')
    let list: NavItem[] = []

    if (!navElement) return list

    const navList = filterChildren(navElement, 'ol', true) as Element
    if (!navList) return list

    list = this.parseNavList(navList)
    return list
  }

  /**
   * Parses lists in the toc
   * @param  {document} navListHtml
   * @param  {string} parent id
   * @return {array} navigation list
   */
  parseNavList(navListHtml: Element, parent?: string): NavItem[] {
    const result: NavItem[] = []

    if (!navListHtml) return result
    if (!navListHtml.children) return result

    for (let i = 0; i < navListHtml.children.length; i++) {
      const item = this.navItem(navListHtml.children[i] as Element, parent)

      if (item) {
        result.push(item)
      }
    }

    return result
  }

  /**
   * Create a navItem
   * @private
   * @param  {element} item
   * @return {object} navItem
   */
  navItem(item: Element, parent?: string): NavItem | undefined {
    const id = item.getAttribute('id') || undefined
    const content =
      (filterChildren(item, 'a', true) as Element) ||
      (filterChildren(item, 'span', true) as Element)

    if (!content) {
      return
    }

    const src = content.getAttribute('href') || ''

    const finalId = id || src
    const text = content.textContent || ''

    let subitems: NavItem[] = []
    const nested = filterChildren(item, 'ol', true) as Element
    if (nested) {
      subitems = this.parseNavList(nested, finalId)
    }

    return {
      id: finalId,
      href: src,
      label: text,
      subitems: subitems,
      parent: parent
    }
  }

  /**
   * Parse landmarks from a Epub > 3.0 Nav
   * @private
   * @param  {document} navHtml
   * @return {array} landmarks list
   */
  parseLandmarks(navHtml: Document): LandmarkItem[] {
    const navElement = querySelectorByType(navHtml.documentElement, 'nav', 'landmarks')
    const navItems = navElement ? qsa(navElement, 'li') : []
    const length = navItems.length
    let i: number
    const list: LandmarkItem[] = []
    let item: LandmarkItem | undefined

    if (!navItems || length === 0) return list

    for (i = 0; i < length; ++i) {
      item = this.landmarkItem(navItems[i] as Element)
      if (item) {
        list.push(item)
        this.landmarksByType[item.type!] = i
      }
    }

    return list
  }

  /**
   * Create a landmarkItem
   * @private
   * @param  {element} item
   * @return {object} landmarkItem
   */
  landmarkItem(item: Element): LandmarkItem | undefined {
    const content = filterChildren(item, 'a', true) as Element

    if (!content) {
      return
    }

    const type = content.getAttributeNS('http://www.idpf.org/2007/ops', 'type') || undefined
    const href = content.getAttribute('href') || ''
    const text = content.textContent || ''

    return {
      href: href,
      label: text,
      type: type
    }
  }

  /**
   * Parse from a Epub > 3.0 NCX
   * @private
   * @param  {document} navHtml
   * @return {array} navigation list
   */
  parseNcx(tocXml: Document): NavItem[] {
    const navPoints = qsa(tocXml.documentElement, 'navPoint')
    const length = navPoints.length
    let i: number
    const toc: { [id: string]: NavItem } = {}
    const list: NavItem[] = []
    let item: NavItem, parent: NavItem

    if (!navPoints || length === 0) return list

    for (i = 0; i < length; ++i) {
      item = this.ncxItem(navPoints[i] as Element)
      toc[item.id!] = item
      if (!item.parent) {
        list.push(item)
      } else {
        parent = toc[item.parent]
        parent.subitems.push(item)
      }
    }

    return list
  }

  /**
   * Create a ncxItem
   * @private
   * @param  {element} item
   * @return {object} ncxItem
   */
  ncxItem(item: Element): NavItem {
    const id = item.getAttribute('id') || false
    const content = qs(item, 'content') as Element
    const src = content.getAttribute('src') || ''
    const navLabel = qs(item, 'navLabel') as Element
    const text = navLabel.textContent ? navLabel.textContent : ''
    const subitems: NavItem[] = []
    const parentNode = item.parentNode as Element
    let parent: string | undefined

    if (
      parentNode &&
      (parentNode.nodeName === 'navPoint' ||
        parentNode.nodeName.split(':').slice(-1)[0] === 'navPoint')
    ) {
      parent = parentNode.getAttribute('id') || undefined
    }

    return {
      id: id || undefined,
      href: src,
      label: text,
      subitems: subitems,
      parent: parent
    }
  }

  /**
   * Load Spine Items
   * @param  {object} json the items to be loaded
   * @return {Array} navItems
   */
  load(json: unknown[]): NavItem[] {
    return json.map((item: unknown) => {
      const rawItem = item as Record<string, unknown>
      const navItem: NavItem = {
        id: rawItem.id as string | undefined,
        href: (rawItem.href as string) || '',
        label: (rawItem.title as string) || (rawItem.label as string) || '',
        subitems: rawItem.children ? this.load(rawItem.children as unknown[]) : []
      }
      return navItem
    })
  }

  /**
   * forEach pass through
   * @param  {Function} fn function to run on each item
   * @return {method} forEach loop
   */
  forEach(fn: (item: NavItem, index: number) => void): void {
    return this.toc.forEach(fn)
  }
}

export default Navigation
export type { NavItem }
