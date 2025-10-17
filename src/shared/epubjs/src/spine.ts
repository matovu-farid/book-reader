import EpubCFI from './epubcfi'
import Hook, { type HookCallback } from './utils/hook'
import Section from './section'
import { replaceBase, replaceCanonical, replaceMeta } from './utils/replacements'

interface SectionHooks {
  serialize: Hook
  content: Hook
}

interface SpineItem {
  idref: string
  linear: string
  properties: string[]
  index: number
  href: string
  url: string
  canonical?: string
  id?: string
  next?: () => SpineItem | undefined
  prev?: () => SpineItem | undefined
  cfiBase: string
}

/**
 * A collection of Spine Items
 */
class Spine {
  spineItems?: Section[]
  spineByHref?: Record<string, number>
  spineById?: Record<string, number>
  hooks?: SectionHooks
  epubcfi?: EpubCFI
  loaded: boolean
  items?: SpineItem[]
  manifest?: Record<string, unknown>
  spineNodeIndex?: number
  baseUrl?: string
  length?: number

  constructor() {
    this.spineItems = []
    this.spineByHref = {}
    this.spineById = {}

    this.hooks = {} as SectionHooks
    this.hooks.serialize = new Hook()
    this.hooks.content = new Hook()

    // Register replacements
    this.hooks.content.register(replaceBase as HookCallback)
    this.hooks.content.register(replaceCanonical as HookCallback)
    this.hooks.content.register(replaceMeta as HookCallback)

    this.epubcfi = new EpubCFI()

    this.loaded = false

    this.items = undefined
    this.manifest = undefined
    this.spineNodeIndex = undefined
    this.baseUrl = undefined
    this.length = undefined
  }

  /**
   * Unpack items from a opf into spine items
   * @param  {Packaging} _package
   * @param  {method} resolver URL resolver
   * @param  {method} canonical Resolve canonical url
   */
  unpack(
    _package: Record<string, unknown>,
    resolver: (href: string, absolute: boolean) => string,
    canonical: (href: string) => string
  ): void {
    this.items = (_package.spine as SpineItem[]) || []
    this.manifest = (_package.manifest as Record<string, unknown>) || {}
    this.spineNodeIndex = (_package.spineNodeIndex as number) || 0
    this.baseUrl = (_package.baseUrl as string) || (_package.basePath as string) || ''
    this.length = this.items.length

    this.items.forEach((item) => {
      const manifestItem = (this.manifest as Record<string, unknown>)[item.idref] as
        | Record<string, unknown>
        | undefined

      item.index = this.spineItems?.length || 0
      item.cfiBase = this.epubcfi!.generateChapterComponent(
        this.spineNodeIndex as number,
        item.index,
        item.id
      )

      // Ensure href and url are always set
      if (!item.href && manifestItem) {
        item.href = (manifestItem.href as string) || ''
      }
      if (item.href) {
        item.url = resolver(item.href, true)
        item.canonical = canonical(item.href)
      } else {
        item.href = ''
        item.url = ''
      }

      if (manifestItem) {
        const manifestHref = (manifestItem.href as string) || item.href
        if (manifestHref) {
          item.href = manifestHref
          item.url = resolver(item.href, true)
          item.canonical = canonical(item.href)
        }

        const props = (manifestItem.properties as string[]) || []
        if (props.length) {
          item.properties.push(...props)
        }
      }

      if (item.linear === 'yes') {
        item.prev = (): SpineItem | undefined => {
          let prevIndex = item.index
          while (prevIndex > 0) {
            const prev = this.get(prevIndex - 1)
            if (prev && prev.linear) {
              return prev as unknown as SpineItem
            }
            prevIndex -= 1
          }
          return
        }
        item.next = (): SpineItem | undefined => {
          let nextIndex = item.index
          while (nextIndex < (this.spineItems?.length || 0) - 1) {
            const next = this.get(nextIndex + 1)
            if (next && next.linear) {
              return next as unknown as SpineItem
            }
            nextIndex += 1
          }
          return
        }
      } else {
        item.prev = (): undefined => {
          return
        }
        item.next = (): undefined => {
          return
        }
      }

      const spineItem = new Section(item, this.hooks)

      this.append(spineItem)
    })

    this.loaded = true
  }

  /**
   * Get an item from the spine
   * @param  {string|number} [target]
   * @return {Section} section
   * @example spine.get();
   * @example spine.get(1);
   * @example spine.get("chap1.html");
   * @example spine.get("#id1234");
   */
  get(target?: string | number | EpubCFI): Section | null {
    let index = 0

    if (typeof target === 'undefined') {
      while (index < (this.spineItems?.length || 0)) {
        const next = this.spineItems?.[index]
        if (next && next.linear) {
          break
        }
        index += 1
      }
    } else if (this.epubcfi?.isCfiString(target as string)) {
      const cfi = new EpubCFI(target as string)
      index = cfi.spinePos
    } else if (typeof target === 'number' || isNaN(target as unknown as number) === false) {
      index = target as number
    } else if (typeof target === 'string' && target.indexOf('#') === 0) {
      index = this.spineById?.[target.substring(1)] || 0
    } else if (typeof target === 'string') {
      // Remove fragments
      const href = target.split('#')[0]
      index = this.spineByHref?.[href] || this.spineByHref?.[encodeURI(href)] || 0
    }

    return this.spineItems?.[index] || null
  }

  /**
   * Append a Section to the Spine
   * @private
   * @param  {Section} section
   */
  append(section: Section): number {
    const index = this.spineItems?.length || 0
    section.index = index

    if (!this.spineItems) {
      this.spineItems = []
    }
    this.spineItems.push(section)

    // Encode and Decode href lookups
    // see pr for details: https://github.com/futurepress/epub.js/pull/358
    if (!this.spineByHref) {
      this.spineByHref = {}
    }
    const href = section.href || ''
    this.spineByHref[decodeURI(href)] = index
    this.spineByHref[encodeURI(href)] = index
    this.spineByHref[href] = index

    if (!this.spineById) {
      this.spineById = {}
    }
    this.spineById[section.idref] = index

    return index
  }

  /**
   * Prepend a Section to the Spine
   * @private
   * @param  {Section} section
   */
  prepend(section: Section): number {
    // var index = this.spineItems.unshift(section);
    if (!this.spineByHref) {
      this.spineByHref = {}
    }
    if (!this.spineById) {
      this.spineById = {}
    }
    const href = section.href || ''
    this.spineByHref[href] = 0
    this.spineById[section.idref] = 0

    // Re-index
    if (this.spineItems) {
      this.spineItems.forEach((item, index) => {
        item.index = index
      })
    }

    return 0
  }

  // insert(section, index) {
  //
  // };

  /**
   * Remove a Section from the Spine
   * @private
   * @param  {Section} section
   */
  remove(section: Section): Section[] | undefined {
    const index = this.spineItems?.indexOf(section) ?? -1

    if (index > -1 && this.spineItems) {
      const href = section.href || ''
      if (this.spineByHref) {
        delete this.spineByHref[href]
      }
      if (this.spineById) {
        delete this.spineById[section.idref]
      }

      return this.spineItems.splice(index, 1)
    }
    return undefined
  }

  /**
   * Loop over the Sections in the Spine
   * @return {method} forEach
   */
  each(callback: (item: Section) => void): void {
    if (this.spineItems) {
      this.spineItems.forEach((item) => callback(item))
    }
  }

  /**
   * Find the first Section in the Spine
   * @return {Section} first section
   */
  first(): Section | undefined {
    let index = 0

    do {
      const next = this.get(index)

      if (next && next.linear) {
        return next
      }
      index += 1
    } while (index < (this.spineItems?.length || 0))
    return undefined
  }

  /**
   * Find the last Section in the Spine
   * @return {Section} last section
   */
  last(): Section | undefined {
    let index = (this.spineItems?.length || 1) - 1

    do {
      const prev = this.get(index)
      if (prev && prev.linear) {
        return prev
      }
      index -= 1
    } while (index >= 0)
    return undefined
  }

  destroy(): void {
    if (this.spineItems) {
      this.spineItems.forEach((section) => section.destroy())
    }

    this.spineItems = undefined
    this.spineByHref = undefined
    this.spineById = undefined

    if (this.hooks) {
      this.hooks.serialize.clear()
      this.hooks.content.clear()
    }
    this.hooks = undefined

    this.epubcfi = undefined

    this.loaded = false

    this.items = undefined
    this.manifest = undefined
    this.spineNodeIndex = undefined
    this.baseUrl = undefined
    this.length = undefined
  }
}

export default Spine
