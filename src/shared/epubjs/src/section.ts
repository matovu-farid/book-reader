import { Deferred } from './utils/core'
import EpubCFI from './epubcfi'
import Hook from './utils/hook'
import { sprint } from './utils/core'
import Request from './utils/request'
import { DOMParser as XMLDOMSerializer } from '@xmldom/xmldom'

interface SpineItem {
  idref: string
  linear: string
  properties: string[]
  index: number
  href: string
  url: string
  canonical?: string
  next?: () => SpineItem | undefined
  prev?: () => SpineItem | undefined
  cfiBase: string
}

interface SectionHooks {
  serialize: Hook
  content: Hook
}

interface FindResult {
  cfi: string
  excerpt: string
}

interface LayoutSettings {
  layout: string
  spread: string
  orientation: string
}

/**
 * Represents a Section of the Book
 *
 * In most books this is equivalent to a Chapter
 */
class Section {
  idref: string
  linear: boolean
  properties: string[]
  index: number
  href: string
  url: string
  canonical?: string
  next?: () => Section | undefined
  prev?: () => Section | undefined
  cfiBase: string

  hooks: SectionHooks
  document?: Document
  contents?: Element
  output?: string
  request?: typeof Request

  constructor(item: SpineItem, hooks?: SectionHooks) {
    this.idref = item.idref
    this.linear = item.linear === 'yes'
    this.properties = item.properties
    this.index = item.index
    this.href = item.href
    this.url = item.url
    this.canonical = item.canonical
    this.next = item.next as (() => Section | undefined) | undefined
    this.prev = item.prev as (() => Section | undefined) | undefined

    this.cfiBase = item.cfiBase

    if (hooks) {
      this.hooks = hooks
    } else {
      this.hooks = {} as SectionHooks
      this.hooks.serialize = new Hook(this)
      this.hooks.content = new Hook(this)
    }

    this.document = undefined
    this.contents = undefined
    this.output = undefined
  }

  /**
   * Load the section from its url
   */
  load(_request?: typeof Request): Promise<Element> {
    const request = _request || Request
    const loading = new Deferred<Element>()
    const loaded = loading.promise

    if (this.contents) {
      loading.resolve?.(this.contents)
    } else {
      request(this.url)
        .then((xml: unknown) => {
          this.document = xml as Document
          this.contents = (xml as Document).documentElement

          if (this.hooks.content && this.document) {
            return this.hooks.content.trigger(this.document, this)
          }
          return Promise.resolve([])
        })
        .then(() => {
          if (this.contents) {
            loading.resolve?.(this.contents)
          }
        })
        .catch((error: Error) => {
          loading.reject?.(error)
        })
    }

    return loaded
  }

  /**
   * Render the contents of a section
   */
  render(_request?: typeof Request): Promise<string> {
    const rendering = new Deferred<string>()
    const rendered = rendering.promise
    // TODO: better way to return output from hooks?

    this.load(_request)
      .then((contents: Element) => {
        const userAgent = (typeof navigator !== 'undefined' && navigator.userAgent) || ''
        const isIE = userAgent.indexOf('Trident') >= 0
        let Serializer: typeof XMLSerializer | typeof XMLDOMSerializer
        if (typeof XMLSerializer === 'undefined' || isIE) {
          Serializer = XMLDOMSerializer
        } else {
          Serializer = XMLSerializer
        }
        const serializer = new Serializer()
        if ('serializeToString' in serializer) {
          this.output = (serializer as XMLSerializer).serializeToString(contents)
        } else {
          // XMLDOMSerializer doesn't have serializeToString, use alternative approach
          this.output = contents.outerHTML || contents.toString()
        }
        return this.output
      })
      .then(() => {
        if (this.output && this.hooks.serialize) {
          return this.hooks.serialize.trigger(this.output, this)
        }
        return Promise.resolve([])
      })
      .then(() => {
        if (this.output) {
          rendering.resolve?.(this.output)
        }
      })
      .catch((error: Error) => {
        rendering.reject?.(error)
      })

    return rendered
  }

  /**
   * Find a string in a section
   */
  find(_query: string): FindResult[] {
    const matches: FindResult[] = []
    const query = _query.toLowerCase()
    const find = (node: Node) => {
      const text = node.textContent!.toLowerCase()
      let range: Range = this.document!.createRange()
      let cfi: string
      let pos: number = -1
      let last = -1
      let excerpt: string
      const limit = 150

      while (pos !== -1) {
        // Search for the query
        pos = text.indexOf(query, last + 1)

        if (pos !== -1) {
          // We found it! Generate a CFI
          range = this.document!.createRange()
          range.setStart(node, pos)
          range.setEnd(node, pos + query.length)

          cfi = this.cfiFromRange(range)

          // Generate the excerpt
          if (node.textContent!.length < limit) {
            excerpt = node.textContent!
          } else {
            excerpt = node.textContent!.substring(pos - limit / 2, pos + limit / 2)
            excerpt = '...' + excerpt + '...'
          }

          // Add the CFI to the matches list
          matches.push({
            cfi: cfi,
            excerpt: excerpt
          })
        }

        last = pos
      }
    }

    sprint(this.document!.documentElement, (node: Node) => {
      find(node)
    })

    return matches
  }

  /**
   * Search a string in multiple sequential Element of the section. If the document.createTreeWalker api is missed(eg: IE8), use `find` as a fallback.
   */
  search(_query: string, maxSeqEle: number = 5): FindResult[] {
    if (typeof document.createTreeWalker === 'undefined') {
      return this.find(_query)
    }
    const matches: FindResult[] = []
    const excerptLimit = 150
    const query = _query.toLowerCase()
    const search = (nodeList: Node[]) => {
      const textWithCase = nodeList.reduce((acc, current) => {
        return acc + current.textContent
      }, '')
      const text = textWithCase.toLowerCase()
      const pos = text.indexOf(query)
      if (pos !== -1) {
        const startNodeIndex = 0
        const endPos = pos + query.length
        let endNodeIndex = 0
        let l = 0
        if (pos < (nodeList[startNodeIndex] as Text).length) {
          while (endNodeIndex < nodeList.length - 1) {
            l += (nodeList[endNodeIndex] as Text).length
            if (endPos <= l) {
              break
            }
            endNodeIndex += 1
          }

          const startNode = nodeList[startNodeIndex]
          const endNode = nodeList[endNodeIndex]
          const range = this.document!.createRange()
          range.setStart(startNode, pos)
          const beforeEndLengthCount = nodeList.slice(0, endNodeIndex).reduce((acc, current) => {
            return acc + current.textContent!.length
          }, 0)
          range.setEnd(
            endNode,
            beforeEndLengthCount > endPos ? endPos : endPos - beforeEndLengthCount
          )
          const searchCfi = this.cfiFromRange(range)

          let excerpt = nodeList.slice(0, endNodeIndex + 1).reduce((acc, current) => {
            return acc + current.textContent
          }, '')
          if (excerpt.length > excerptLimit) {
            excerpt = excerpt.substring(pos - excerptLimit / 2, pos + excerptLimit / 2)
            excerpt = '...' + excerpt + '...'
          }
          matches.push({
            cfi: searchCfi,
            excerpt: excerpt
          })
        }
      }
    }

    const treeWalker = document.createTreeWalker(this.document!, NodeFilter.SHOW_TEXT)
    let node: Node | null
    let nodeList: Node[] = []
    while ((node = treeWalker.nextNode())) {
      nodeList.push(node)
      if (nodeList.length === maxSeqEle) {
        search(nodeList.slice(0, maxSeqEle))
        nodeList = nodeList.slice(1, maxSeqEle)
      }
    }
    if (nodeList.length > 0) {
      search(nodeList)
    }
    return matches
  }

  /**
   * Reconciles the current chapters layout properties with
   * the global layout properties.
   */
  reconcileLayoutSettings(globalLayout: LayoutSettings): LayoutSettings {
    // Get the global defaults
    const settings: LayoutSettings = {
      layout: globalLayout.layout,
      spread: globalLayout.spread,
      orientation: globalLayout.orientation
    }

    // Get the chapter's display type
    this.properties.forEach((prop: string) => {
      const rendition = prop.replace('rendition:', '')
      const split = rendition.indexOf('-')
      let property: string, value: string

      if (split !== -1) {
        property = rendition.slice(0, split)
        value = rendition.slice(split + 1)

        settings[property] = value
      }
    })
    return settings
  }

  /**
   * Get a CFI from a Range in the Section
   */
  cfiFromRange(_range: Range): string {
    return new EpubCFI(_range, this.cfiBase).toString()
  }

  /**
   * Get a CFI from an Element in the Section
   */
  cfiFromElement(el: Element): string {
    return new EpubCFI(el, this.cfiBase).toString()
  }

  /**
   * Unload the section document
   */
  unload(): void {
    this.document = undefined
    this.contents = undefined
    this.output = undefined
  }

  destroy(): void {
    this.unload()
    this.hooks.serialize.clear()
    this.hooks.content.clear()

    this.hooks = undefined as unknown as SectionHooks
    this.idref = undefined as unknown as string
    this.linear = undefined as unknown as boolean
    this.properties = undefined as unknown as string[]
    this.index = undefined as unknown as number
    this.href = undefined as unknown as string
    this.url = undefined as unknown as string
    this.next = undefined as unknown as (() => Section | undefined) | undefined
    this.prev = undefined as unknown as (() => Section | undefined) | undefined

    this.cfiBase = undefined as unknown as string
  }
}

export default Section
