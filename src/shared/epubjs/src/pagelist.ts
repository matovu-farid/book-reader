import EpubCFI from './epubcfi'
import { qs, qsa, querySelectorByType, indexOfSorted, locationOf } from './utils/core'

// Import NavItem type from navigation
interface NavItem {
  id?: string
  href: string
  label: string
  subitems: NavItem[]
  parent?: string
}

interface PageListItem {
  href: string
  page: number
  cfi?: string
  packageUrl?: string
}

/**
 * Page List Parser
 * @param {document} [xml]
 */
class PageList {
  public pages: number[] = []
  public locations: string[] = []
  public epubcfi: EpubCFI
  public firstPage: number = 0
  public lastPage: number = 0
  public totalPages: number = 0
  public toc?: NavItem[]
  public ncx?: NavItem[]
  public pageList?: PageListItem[]

  constructor(xml?: Document) {
    this.pages = []
    this.locations = []
    this.epubcfi = new EpubCFI()

    this.firstPage = 0
    this.lastPage = 0
    this.totalPages = 0

    this.toc = undefined
    this.ncx = undefined

    if (xml) {
      this.pageList = this.parse(xml)
    }

    if (this.pageList && this.pageList.length) {
      this.process(this.pageList)
    }
  }

  /**
   * Parse PageList Xml
   * @param  {document} xml
   */
  parse(xml: Document): PageListItem[] | undefined {
    const html = qs(xml.documentElement, 'html')
    const ncx = qs(xml.documentElement, 'ncx')

    if (html) {
      return this.parseNav(xml)
    } else if (ncx) {
      return this.parseNcx(xml)
    }

    return undefined
  }

  /**
   * Parse a Nav PageList
   * @private
   * @param  {node} navHtml
   * @return {PageList.item[]} list
   */
  parseNav(navHtml: Document): PageListItem[] {
    const navElement = querySelectorByType(navHtml.documentElement, 'nav', 'page-list')
    const navItems = navElement ? qsa(navElement, 'li') : []
    const length = navItems.length
    let i: number
    const list: PageListItem[] = []
    let item: PageListItem

    if (!navItems || length === 0) return list

    for (i = 0; i < length; ++i) {
      item = this.item(navItems[i] as Element)
      list.push(item)
    }

    return list
  }

  parseNcx(navXml: Document): PageListItem[] {
    const list: PageListItem[] = []
    let i = 0
    let item: PageListItem
    const pageList: Element | null = qs(navXml.documentElement, 'pageList')
    if (!pageList) return list

    const pageTargets: NodeListOf<Element> = qsa(pageList, 'pageTarget') as NodeListOf<Element>
    const length = pageTargets.length

    if (!pageTargets || pageTargets.length === 0) {
      return list
    }

    for (i = 0; i < length; ++i) {
      item = this.ncxItem(pageTargets[i])
      list.push(item)
    }

    return list
  }

  ncxItem(item: Element): PageListItem {
    const navLabel = qs(item, 'navLabel') as Element
    const navLabelText = qs(navLabel, 'text') as Element
    const pageText = navLabelText.textContent
    const content = qs(item, 'content') as Element

    const href = content.getAttribute('src') || ''
    const page = parseInt(pageText || '0', 10)

    return {
      href: href,
      page: page
    }
  }

  /**
   * Page List Item
   * @private
   * @param  {node} item
   * @return {object} pageListItem
   */
  item(item: Element): PageListItem {
    const content = qs(item, 'a') as Element
    const href = content.getAttribute('href') || ''
    const text = content.textContent || ''
    const page = parseInt(text)
    const isCfi = href.indexOf('epubcfi')
    let split: string[]
    let packageUrl: string
    let cfi: string | false

    if (isCfi !== -1) {
      split = href.split('#')
      packageUrl = split[0]
      cfi = split.length > 1 ? split[1] : false
      return {
        cfi: cfi || undefined,
        href: href,
        packageUrl: packageUrl,
        page: page
      }
    } else {
      return {
        href: href,
        page: page
      }
    }
  }

  /**
   * Process pageList items
   * @private
   * @param  {array} pageList
   */
  process(pageList: PageListItem[]): void {
    pageList.forEach((item) => {
      this.pages.push(item.page)
      if (item.cfi) {
        this.locations.push(item.cfi)
      }
    })
    this.firstPage = parseInt(String(this.pages[0]))
    this.lastPage = parseInt(String(this.pages[this.pages.length - 1]))
    this.totalPages = this.lastPage - this.firstPage
  }

  /**
   * Get a PageList result from a EpubCFI
   * @param  {string} cfi EpubCFI String
   * @return {number} page
   */
  pageFromCfi(cfi: string): number {
    let pg = -1

    // Check if the pageList has not been set yet
    if (this.locations.length === 0) {
      return -1
    }

    // TODO: check if CFI is valid?

    // check if the cfi is in the location list
    // var index = this.locations.indexOf(cfi);
    const index = indexOfSorted(cfi, this.locations, this.epubcfi.compare.bind(this.epubcfi))
    if (index !== -1) {
      pg = this.pages[index]
    } else {
      // Otherwise add it to the list of locations
      // Insert it in the correct position in the locations page
      //index = EPUBJS.core.insert(cfi, this.locations, this.epubcfi.compare);
      const locationIndex = locationOf(cfi, this.locations, this.epubcfi.compare.bind(this.epubcfi))
      // Get the page at the location just before the new one, or return the first
      pg = locationIndex - 1 >= 0 ? this.pages[locationIndex - 1] : this.pages[0]
      if (pg !== undefined) {
        // Add the new page in so that the locations and page array match up
        //this.pages.splice(index, 0, pg);
      } else {
        pg = -1
      }
    }
    return pg
  }

  /**
   * Get an EpubCFI from a Page List Item
   * @param  {string | number} pg
   * @return {string} cfi
   */
  cfiFromPage(pg: string | number): string | number {
    let cfi: string | number = -1
    // check that pg is an int
    if (typeof pg !== 'number') {
      pg = parseInt(String(pg))
    }

    // check if the cfi is in the page list
    // Pages could be unsorted.
    const index = this.pages.indexOf(pg as number)
    if (index !== -1) {
      cfi = this.locations[index]
    }
    // TODO: handle pages not in the list
    return cfi
  }

  /**
   * Get a Page from Book percentage
   * @param  {number} percent
   * @return {number} page
   */
  pageFromPercentage(percent: number): number {
    const pg = Math.round(this.totalPages * percent)
    return pg
  }

  /**
   * Returns a value between 0 - 1 corresponding to the location of a page
   * @param  {number} pg the page
   * @return {number} percentage
   */
  percentageFromPage(pg: number): number {
    const percentage = (pg - this.firstPage) / this.totalPages
    return Math.round(percentage * 1000) / 1000
  }

  /**
   * Returns a value between 0 - 1 corresponding to the location of a cfi
   * @param  {string} cfi EpubCFI String
   * @return {number} percentage
   */
  percentageFromCfi(cfi: string): number {
    const pg = this.pageFromCfi(cfi)
    const percentage = this.percentageFromPage(pg)
    return percentage
  }

  /**
   * Destroy
   */
  destroy(): void {
    this.pages = []
    this.locations = []
    this.epubcfi = new EpubCFI()

    this.pageList = undefined

    this.toc = undefined
    this.ncx = undefined
  }
}

export default PageList
