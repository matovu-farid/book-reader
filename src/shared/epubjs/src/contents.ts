/**
 * Contents class with full type safety using Zod schemas
 * Provides both compile-time and runtime validation for all data structures
 */
import EventEmitter from 'event-emitter'
import { z } from 'zod'
import { isNumber, prefixed, borders, defaults } from './utils/core'
import EpubCFI from './epubcfi'
import Mapping from './mapping'
import { replaceLinks } from './utils/replacements'
import { EPUBJS_VERSION, EVENTS, DOM_EVENTS } from './utils/constants'

const hasNavigator = typeof navigator !== 'undefined'

const isChrome = hasNavigator && /Chrome/.test(navigator.userAgent)
const isWebkit = hasNavigator && !isChrome && /AppleWebKit/.test(navigator.userAgent)

const ELEMENT_NODE = 1
// const TEXT_NODE = 3

// Zod Schemas for runtime validation
const LayoutSchema = z.object({
  spreadWidth: z.number().positive(),
  divisor: z.number().positive(),
  columnWidth: z.number().positive(),
  gap: z.number().nonnegative()
})

const ViewportOptionsSchema = z
  .object({
    width: z.string().optional(),
    height: z.string().optional(),
    scale: z.string().optional(),
    minimum: z.string().optional(),
    maximum: z.string().optional(),
    scalable: z.string().optional()
  })
  .passthrough()

const ViewportSettingsSchema = z.object({
  width: z.string().optional(),
  height: z.string().optional(),
  scale: z.string().optional(),
  minimum: z.string().optional(),
  maximum: z.string().optional(),
  scalable: z.string().optional()
})

const SectionSchema = z.object({
  properties: z.array(z.string()).optional()
})

const CSSRuleSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))

const CSSRuleArraySchema = z.array(
  z.tuple([
    z.string(), // selector
    z.union([z.string(), z.number(), z.boolean()]), // value
    z.boolean().optional() // important flag
  ])
)

const CSSRulesObjectSchema = z.record(z.string(), z.union([CSSRuleSchema, z.array(CSSRuleSchema)]))

const EpubReadingSystemSchema = z.object({
  name: z.string(),
  version: z.string(),
  layoutStyle: z.string(),
  hasFeature: z.function()
})

// Helper function for safe validation with error handling
function safeValidate<T>(schema: z.ZodSchema<T>, data: unknown, methodName: string): T {
  try {
    return schema.parse(data)
  } catch (error) {
    console.error(`Validation error in ${methodName}:`, error)
    throw new Error(
      `Invalid data passed to ${methodName}: ${error instanceof Error ? error.message : 'Unknown validation error'}`
    )
  }
}

// TypeScript interfaces inferred from Zod schemas for full type safety
type ViewportOptions = z.infer<typeof ViewportOptionsSchema>
type ViewportSettings = z.infer<typeof ViewportSettingsSchema>
type Layout = z.infer<typeof LayoutSchema>
type Section = z.infer<typeof SectionSchema>
type CSSRuleArray = z.infer<typeof CSSRuleArraySchema>
type CSSRulesObject = z.infer<typeof CSSRulesObjectSchema>
type EpubReadingSystem = z.infer<typeof EpubReadingSystemSchema>

interface Size {
  width: number
  height: number
}

interface Position {
  left: number
  top: number
}

/**
 * Handles DOM manipulation, queries and events for View contents
 */
class Contents {
  epubcfi: EpubCFI
  document: Document
  documentElement: HTMLElement
  content: HTMLElement
  window: Window
  private _size: Size
  sectionIndex: number
  cfiBase: string
  called: number
  active: boolean

  // Observer instances
  observer?: ResizeObserver | MutationObserver

  // Timeouts
  expanding?: number
  selectionEndTimeout?: number
  _expanding?: boolean

  // Event handlers
  _triggerEvent?: (e: Event) => void
  _onSelectionChange?: (e: Event) => void
  _resizeCheck?: () => void

  // Layout style
  _layoutStyle?: string

  // Resize callback
  onResize?: (size: Size) => void

  constructor(doc: Document, content?: HTMLElement, cfiBase?: string, sectionIndex?: number) {
    // Blank Cfi for Parsing
    this.epubcfi = new EpubCFI()

    this.document = doc
    this.documentElement = this.document.documentElement
    this.content = content || this.document.body
    this.window = this.document.defaultView!

    this._size = {
      width: 0,
      height: 0
    }

    this.sectionIndex = sectionIndex || 0
    this.cfiBase = cfiBase || ''

    this.epubReadingSystem('epub.js', EPUBJS_VERSION)
    this.called = 0
    this.active = true
    this.listeners()
  }

  /**
   * Get DOM events that are listened for and passed along
   */
  static get listenedEvents(): string[] {
    return DOM_EVENTS
  }

  /**
   * Get or Set width
   */
  width(w?: number): number {
    const frame = this.content

    if (w && isNumber(w)) {
      frame.style.width = w + 'px'
    }

    return parseInt(this.window.getComputedStyle(frame)['width'])
  }

  /**
   * Get or Set height
   */
  height(h?: number): number {
    const frame = this.content

    if (h && isNumber(h)) {
      frame.style.height = h + 'px'
    }

    return parseInt(this.window.getComputedStyle(frame)['height'])
  }

  /**
   * Get or Set width of the contents
   */
  contentWidth(w?: number): number {
    const content = this.content || this.document.body

    if (w && isNumber(w)) {
      content.style.width = w + 'px'
    }

    return parseInt(this.window.getComputedStyle(content)['width'])
  }

  /**
   * Get or Set height of the contents
   */
  contentHeight(h?: number): number {
    const content = this.content || this.document.body

    if (h && isNumber(h)) {
      content.style.height = h + 'px'
    }

    return parseInt(this.window.getComputedStyle(content)['height'])
  }

  /**
   * Get the width of the text using Range
   */
  textWidth(): number {
    let width: number
    const range = this.document.createRange()
    const content = this.content || this.document.body
    const border = borders(content)

    // Select the contents of frame
    range.selectNodeContents(content)

    // get the width of the text content
    const rect = range.getBoundingClientRect()
    width = rect.width

    if (border && border.width) {
      width += border.width
    }

    return Math.round(width)
  }

  /**
   * Get the height of the text using Range
   */
  textHeight(): number {
    const range = this.document.createRange()
    const content = this.content || this.document.body

    range.selectNodeContents(content)

    const rect = range.getBoundingClientRect()
    const height = rect.bottom

    return Math.round(height)
  }

  /**
   * Get documentElement scrollWidth
   */
  scrollWidth(): number {
    const width = this.documentElement.scrollWidth
    return width
  }

  /**
   * Get documentElement scrollHeight
   */
  scrollHeight(): number {
    const height = this.documentElement.scrollHeight
    return height
  }

  /**
   * Set overflow css style of the contents
   */
  overflow(overflow?: string): string {
    if (overflow) {
      this.documentElement.style.overflow = overflow
    }

    return this.window.getComputedStyle(this.documentElement)['overflow']
  }

  /**
   * Set overflowX css style of the documentElement
   */
  overflowX(overflow?: string): string {
    if (overflow) {
      this.documentElement.style.overflowX = overflow
    }

    return this.window.getComputedStyle(this.documentElement)['overflowX']
  }

  /**
   * Set overflowY css style of the documentElement
   */
  overflowY(overflow?: string): string {
    if (overflow) {
      this.documentElement.style.overflowY = overflow
    }

    return this.window.getComputedStyle(this.documentElement)['overflowY']
  }

  /**
   * Set Css styles on the contents element (typically Body)
   */
  css(property: string, value?: string, priority?: boolean): string {
    const content = this.content || this.document.body

    if (value) {
      content.style.setProperty(property, value, priority ? 'important' : '')
    } else {
      content.style.removeProperty(property)
    }

    return this.window.getComputedStyle(content)[property as keyof CSSStyleDeclaration] as string
  }

  /**
   * Get or Set the viewport element
   */
  viewport(options?: ViewportOptions): ViewportSettings {
    // Validate options at runtime if provided
    if (options) {
      options = safeValidate(ViewportOptionsSchema, options, 'viewport')
    }
    let $viewport = this.document.querySelector("meta[name='viewport']") as HTMLMetaElement
    const parsed: ViewportSettings = {
      width: undefined,
      height: undefined,
      scale: undefined,
      minimum: undefined,
      maximum: undefined,
      scalable: undefined
    }
    const newContent: string[] = []

    /*
     * check for the viewport size
     * <meta name="viewport" content="width=1024,height=697" />
     */
    if ($viewport && $viewport.hasAttribute('content')) {
      const content = $viewport.getAttribute('content')!
      const widthMatch = content.match(/width\s*=\s*([^,]*)/)
      const heightMatch = content.match(/height\s*=\s*([^,]*)/)
      const scaleMatch = content.match(/initial-scale\s*=\s*([^,]*)/)
      const _minimum = content.match(/minimum-scale\s*=\s*([^,]*)/)
      const _maximum = content.match(/maximum-scale\s*=\s*([^,]*)/)
      const _scalable = content.match(/user-scalable\s*=\s*([^,]*)/)

      if (widthMatch && widthMatch.length && typeof widthMatch[1] !== 'undefined') {
        parsed.width = widthMatch[1]
      }
      if (heightMatch && heightMatch.length && typeof heightMatch[1] !== 'undefined') {
        parsed.height = heightMatch[1]
      }
      if (scaleMatch && scaleMatch.length && typeof scaleMatch[1] !== 'undefined') {
        parsed.scale = scaleMatch[1]
      }
      if (_minimum && _minimum.length && typeof _minimum[1] !== 'undefined') {
        parsed.minimum = _minimum[1]
      }
      if (_maximum && _maximum.length && typeof _maximum[1] !== 'undefined') {
        parsed.maximum = _maximum[1]
      }
      if (_scalable && _scalable.length && typeof _scalable[1] !== 'undefined') {
        parsed.scalable = _scalable[1]
      }
    }

    const settings = defaults(
      options || {},
      parsed as Record<string, string | undefined>
    ) as ViewportSettings

    if (options) {
      if (settings.width) {
        newContent.push('width=' + settings.width)
      }

      if (settings.height) {
        newContent.push('height=' + settings.height)
      }

      if (settings.scale) {
        newContent.push('initial-scale=' + settings.scale)
      }

      if (settings.scalable === 'no') {
        newContent.push('minimum-scale=' + settings.scale)
        newContent.push('maximum-scale=' + settings.scale)
        newContent.push('user-scalable=' + settings.scalable)
      } else {
        if (settings.scalable) {
          newContent.push('user-scalable=' + settings.scalable)
        }

        if (settings.minimum) {
          newContent.push('minimum-scale=' + settings.minimum)
        }

        if (settings.maximum) {
          newContent.push('minimum-scale=' + settings.maximum)
        }
      }

      if (!$viewport) {
        const newViewport = this.document.createElement('meta')
        newViewport.setAttribute('name', 'viewport')
        this.document.querySelector('head')!.appendChild(newViewport)
        $viewport = newViewport
      }

      $viewport.setAttribute('content', newContent.join(', '))

      this.window.scrollTo(0, 0)
    }

    return settings
  }

  /**
   * Event emitter for when the contents has expanded
   */
  expand(): void {
    this.emit(EVENTS.CONTENTS.EXPAND)
  }

  /**
   * Add DOM listeners
   */
  listeners(): void {
    this.imageLoadListeners()
    this.mediaQueryListeners()
    this.addEventListeners()
    this.addSelectionListeners()

    if (typeof ResizeObserver === 'undefined') {
      this.resizeListeners()
      this.visibilityListeners()
    } else {
      this.resizeObservers()
    }

    this.linksHandler()
  }

  /**
   * Remove DOM listeners
   */
  removeListeners(): void {
    this.removeEventListeners()
    this.removeSelectionListeners()

    if (this.observer) {
      this.observer.disconnect()
    }

    clearTimeout(this.expanding)
  }

  /**
   * Check if size of contents has changed and
   * emit 'resize' event if it has.
   */
  resizeCheck(): void {
    const width = this.textWidth()
    const height = this.textHeight()

    if (width !== this._size.width || height !== this._size.height) {
      this._size = {
        width: width,
        height: height
      }

      this.onResize && this.onResize(this._size)
      this.emit(EVENTS.CONTENTS.RESIZE, this._size)
    }
  }

  /**
   * Poll for resize detection
   */
  resizeListeners(): void {
    // Test size again
    clearTimeout(this.expanding)
    requestAnimationFrame(this.resizeCheck.bind(this))
    this.expanding = window.setTimeout(this.resizeListeners.bind(this), 350)
  }

  /**
   * Listen for visibility of tab to change
   */
  visibilityListeners(): void {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.active === false) {
        this.active = true
        this.resizeListeners()
      } else {
        this.active = false
        clearTimeout(this.expanding)
      }
    })
  }

  /**
   * Use css transitions to detect resize
   */
  transitionListeners(): void {
    const body = this.content

    body.style['transitionProperty'] =
      'font, font-size, font-size-adjust, font-stretch, font-variation-settings, font-weight, width, height'
    body.style['transitionDuration'] = '0.001ms'
    body.style['transitionTimingFunction'] = 'linear'
    body.style['transitionDelay'] = '0'

    this._resizeCheck = this.resizeCheck.bind(this)
    if (this._resizeCheck) {
      this.document.addEventListener('transitionend', this._resizeCheck as EventListener, {
        passive: true
      })
    }
  }

  /**
   * Listen for media query changes and emit 'expand' event
   * Adapted from: https://github.com/tylergaw/media-query-events/blob/master/js/mq-events.js
   */
  mediaQueryListeners(): void {
    const sheets = this.document.styleSheets
    const mediaChangeHandler = (m: MediaQueryListEvent) => {
      if (m.matches && !this._expanding) {
        setTimeout(() => this.expand(), 1)
      }
    }

    for (let i = 0; i < sheets.length; i += 1) {
      let rules: CSSRuleList | undefined
      // Firefox errors if we access cssRules cross-domain
      try {
        rules = sheets[i].cssRules
      } catch (e) {
        return
      }
      if (!rules) return // Stylesheets changed
      for (let j = 0; j < rules.length; j++) {
        const rule = rules[j] as CSSMediaRule
        if (rule.media) {
          const mql = this.window.matchMedia(rule.media.mediaText)
          mql.addEventListener('change', mediaChangeHandler)
        }
      }
    }
  }

  /**
   * Use ResizeObserver to listen for changes in the DOM and check for resize
   */
  resizeObservers(): void {
    // create an observer instance
    this.observer = new ResizeObserver(() => {
      requestAnimationFrame(this.resizeCheck.bind(this))
    })

    // pass in the target node
    this.observer.observe(this.document.documentElement)
  }

  /**
   * Use MutationObserver to listen for changes in the DOM and check for resize
   */
  mutationObservers(): void {
    // create an observer instance
    this.observer = new MutationObserver(() => {
      this.resizeCheck()
    })

    // configuration of the observer:
    const config = {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true
    }

    // pass in the target node, as well as the observer options
    this.observer.observe(this.document, config)
  }

  /**
   * Test if images are loaded or add listener for when they load
   */
  imageLoadListeners(): void {
    const images = this.document.querySelectorAll('img')
    let img: HTMLImageElement
    for (let i = 0; i < images.length; i++) {
      img = images[i] as HTMLImageElement

      if (typeof img.naturalWidth !== 'undefined' && img.naturalWidth === 0) {
        img.onload = this.expand.bind(this)
      }
    }
  }

  /**
   * Listen for font load and check for resize when loaded
   */
  fontLoadListeners(): void {
    if (!this.document || !(this.document as Document & { fonts?: FontFaceSet }).fonts) {
      return
    }

    ;(this.document as Document & { fonts: FontFaceSet }).fonts.ready.then(
      function (this: Contents) {
        this.resizeCheck()
      }.bind(this)
    )
  }

  /**
   * Get the documentElement
   */
  root(): HTMLElement | null {
    if (!this.document) return null
    return this.document.documentElement
  }

  /**
   * Get the location offset of a EpubCFI or an #id
   */
  locationOf(target: string | EpubCFI, ignoreClass?: string): Position {
    let position: DOMRect | undefined
    const targetPos: Position = { left: 0, top: 0 }

    if (!this.document) return targetPos

    if (this.epubcfi.isCfiString(target)) {
      const range = new EpubCFI(target).toRange(this.document, ignoreClass)

      if (range) {
        try {
          if (
            !range.endContainer ||
            (range.startContainer === range.endContainer && range.startOffset === range.endOffset)
          ) {
            // If the end for the range is not set, it results in collapsed becoming
            // true. This in turn leads to inconsistent behaviour when calling
            // getBoundingRect. Wrong bounds lead to the wrong page being displayed.
            // https://developer.microsoft.com/en-us/microsoft-edge/platform/issues/15684911/
            let pos = range.startContainer.textContent!.indexOf(' ', range.startOffset)
            if (pos === -1) {
              pos = range.startContainer.textContent!.length
            }
            range.setEnd(range.startContainer, pos)
          }
        } catch (e) {
          console.error('setting end offset to start container length failed', e)
        }

        if (range.startContainer.nodeType === Node.ELEMENT_NODE) {
          position = (range.startContainer as Element).getBoundingClientRect()
          targetPos.left = position.left
          targetPos.top = position.top
        } else {
          // Webkit does not handle collapsed range bounds correctly
          // https://bugs.webkit.org/show_bug.cgi?id=138949

          // Construct a new non-collapsed range
          if (isWebkit) {
            const container = range.startContainer
            const newRange = new Range()
            try {
              if (container.nodeType === ELEMENT_NODE) {
                position = (container as Element).getBoundingClientRect()
              } else if (range.startOffset + 2 < (container as Text).length) {
                newRange.setStart(container, range.startOffset)
                newRange.setEnd(container, range.startOffset + 2)
                position = newRange.getBoundingClientRect()
              } else if (range.startOffset - 2 > 0) {
                newRange.setStart(container, range.startOffset - 2)
                newRange.setEnd(container, range.startOffset)
                position = newRange.getBoundingClientRect()
              } else {
                // empty, return the parent element
                position = (container.parentNode as Element)!.getBoundingClientRect()
              }
            } catch (e) {
              console.error(e, (e as Error).stack)
            }
          } else {
            position = range.getBoundingClientRect()
          }
        }
      }
    } else if (typeof target === 'string' && target.indexOf('#') > -1) {
      const id = target.substring(target.indexOf('#') + 1)
      const el = this.document.getElementById(id)
      if (el) {
        if (isWebkit) {
          // Webkit reports incorrect bounding rects in Columns
          const newRange = new Range()
          newRange.selectNode(el)
          position = newRange.getBoundingClientRect()
        } else {
          position = el.getBoundingClientRect()
        }
      }
    }

    if (position) {
      targetPos.left = position.left
      targetPos.top = position.top
    }

    return targetPos
  }

  /**
   * Append a stylesheet link to the document head
   */
  addStylesheet(src: string): Promise<boolean> {
    return new Promise(
      function (this: Contents, resolve) {
        let $stylesheet: HTMLLinkElement
        let ready = false

        if (!this.document) {
          resolve(false)
          return
        }

        // Check if link already exists
        $stylesheet = this.document.querySelector("link[href='" + src + "']") as HTMLLinkElement
        if ($stylesheet) {
          resolve(true)
          return // already present
        }

        $stylesheet = this.document.createElement('link')
        $stylesheet.type = 'text/css'
        $stylesheet.rel = 'stylesheet'
        $stylesheet.href = src
        $stylesheet.onload = function () {
          if (!ready) {
            ready = true
            // Let apply
            setTimeout(() => {
              resolve(true)
            }, 1)
          }
        }

        this.document.head.appendChild($stylesheet)
      }.bind(this)
    )
  }

  _getStylesheetNode(key?: string): HTMLStyleElement | false {
    let styleEl: HTMLStyleElement
    key = 'epubjs-inserted-css-' + (key || '')

    if (!this.document) return false

    // Check if link already exists
    styleEl = this.document.getElementById(key) as HTMLStyleElement
    if (!styleEl) {
      styleEl = this.document.createElement('style')
      styleEl.id = key
      // Append style element to head
      this.document.head.appendChild(styleEl)
    }
    return styleEl
  }

  /**
   * Append stylesheet css
   */
  addStylesheetCss(serializedCss: string, key?: string): boolean {
    if (!this.document || !serializedCss) return false

    const styleEl = this._getStylesheetNode(key) as HTMLStyleElement
    styleEl.innerHTML = serializedCss

    return true
  }

  /**
   * Append stylesheet rules to a generate stylesheet
   * Array: https://developer.mozilla.org/en-US/docs/Web/API/CSSStyleSheet/insertRule
   * Object: https://github.com/desirable-objects/json-to-css
   */
  addStylesheetRules(rules: CSSRuleArray[] | CSSRulesObject, key?: string): void {
    if (!this.document || !rules || (Array.isArray(rules) && rules.length === 0)) return

    // Validate rules at runtime
    rules = Array.isArray(rules)
      ? safeValidate(z.array(CSSRuleArraySchema), rules, 'addStylesheetRules')
      : safeValidate(CSSRulesObjectSchema, rules, 'addStylesheetRules')

    // Grab style sheet
    const styleSheet = (this._getStylesheetNode(key) as HTMLStyleElement).sheet!

    if (Array.isArray(rules)) {
      for (let i = 0, rl = rules.length; i < rl; i++) {
        let j = 1,
          rule = rules[i]
        const selector = rules[i][0]
        let propStr = ''
        // If the second argument of a rule is an array of arrays, correct our variables.
        if (Array.isArray(rule[1]) && Array.isArray(rule[1][0])) {
          rule = rule[1] as unknown as CSSRuleArray
          j = 0
        }

        for (let pl = rule.length; j < pl; j++) {
          const prop = rule[j]
          propStr += prop[0] + ':' + prop[1] + (prop[2] ? ' !important' : '') + ';\n'
        }

        // Insert CSS Rule
        styleSheet.insertRule(selector + '{' + propStr + '}', styleSheet.cssRules.length)
      }
    } else {
      const selectors = Object.keys(rules)
      selectors.forEach((selector) => {
        const definition = rules[selector]
        if (Array.isArray(definition)) {
          definition.forEach((item) => {
            const _rules = Object.keys(item)
            const result = _rules
              .map((rule) => {
                return `${rule}:${item[rule]}`
              })
              .join(';')
            styleSheet.insertRule(`${selector}{${result}}`, styleSheet.cssRules.length)
          })
        } else {
          const _rules = Object.keys(definition)
          const result = _rules
            .map((rule) => {
              return `${rule}:${definition[rule]}`
            })
            .join(';')
          styleSheet.insertRule(`${selector}{${result}}`, styleSheet.cssRules.length)
        }
      })
    }
  }

  /**
   * Append a script tag to the document head
   */
  addScript(src: string): Promise<boolean> {
    return new Promise(
      function (this: Contents, resolve) {
        let ready = false

        if (!this.document) {
          resolve(false)
          return
        }

        const $script = this.document.createElement('script')
        $script.type = 'text/javascript'
        $script.async = true
        $script.src = src
        $script.onload = function () {
          if (!ready) {
            ready = true
            setTimeout(function () {
              resolve(true)
            }, 1)
          }
        }

        this.document.head.appendChild($script)
      }.bind(this)
    )
  }

  /**
   * Add a class to the contents container
   */
  addClass(className: string): void {
    if (!this.document) return

    const content = this.content || this.document.body

    if (content) {
      content.classList.add(className)
    }
  }

  /**
   * Remove a class from the contents container
   */
  removeClass(className: string): void {
    if (!this.document) return

    const content = this.content || this.document.body

    if (content) {
      content.classList.remove(className)
    }
  }

  /**
   * Add DOM event listeners
   */
  addEventListeners(): void {
    if (!this.document) {
      return
    }

    this._triggerEvent = this.triggerEvent.bind(this)

    DOM_EVENTS.forEach(function (this: Contents, eventName: string) {
      if (this._triggerEvent) {
        this.document.addEventListener(eventName, this._triggerEvent, {
          passive: true
        })
      }
    }, this)
  }

  /**
   * Remove DOM event listeners
   */
  removeEventListeners(): void {
    if (!this.document) {
      return
    }
    DOM_EVENTS.forEach(function (this: Contents, eventName: string) {
      this.document.removeEventListener(eventName, this._triggerEvent!)
    }, this)
    this._triggerEvent = undefined
  }

  /**
   * Emit passed browser events
   */
  triggerEvent(e: Event): void {
    this.emit(e.type, e)
  }

  /**
   * Add listener for text selection
   */
  addSelectionListeners(): void {
    if (!this.document) {
      return
    }
    this._onSelectionChange = this.onSelectionChange.bind(this)
    this.document.addEventListener('selectionchange', this._onSelectionChange, {
      passive: true
    })
  }

  /**
   * Remove listener for text selection
   */
  removeSelectionListeners(): void {
    if (!this.document) {
      return
    }
    this.document.removeEventListener('selectionchange', this._onSelectionChange!)
    this._onSelectionChange = undefined
  }

  /**
   * Handle getting text on selection
   */
  onSelectionChange(): void {
    if (this.selectionEndTimeout) {
      clearTimeout(this.selectionEndTimeout)
    }
    this.selectionEndTimeout = window.setTimeout(
      function (this: Contents) {
        const selection = this.window.getSelection()
        this.triggerSelectedEvent(selection)
      }.bind(this),
      250
    )
  }

  /**
   * Emit event on text selection
   */
  triggerSelectedEvent(selection: Selection | null): void {
    let range: Range
    let cfirange: string

    if (selection && selection.rangeCount > 0) {
      range = selection.getRangeAt(0)
      if (!range.collapsed) {
        cfirange = new EpubCFI(range, this.cfiBase).toString()
        this.emit(EVENTS.CONTENTS.SELECTED, cfirange)
        this.emit(EVENTS.CONTENTS.SELECTED_RANGE, range)
      }
    }
  }

  /**
   * Get a Dom Range from EpubCFI
   */
  range(_cfi: string, ignoreClass?: string): Range | null {
    const cfi = new EpubCFI(_cfi)
    return cfi.toRange(this.document, ignoreClass)
  }

  /**
   * Get an EpubCFI from a Dom Range
   */
  cfiFromRange(range: Range, ignoreClass?: string): string {
    return new EpubCFI(range, this.cfiBase, ignoreClass).toString()
  }

  /**
   * Get an EpubCFI from a Dom node
   */
  cfiFromNode(node: Node, ignoreClass?: string): string {
    return new EpubCFI(node, this.cfiBase, ignoreClass).toString()
  }

  // TODO: find where this is used - remove?
  map(layout: Layout): { start: string; end: string }[] {
    // Validate layout at runtime
    const validatedLayout = safeValidate(LayoutSchema, layout, 'map')
    const map = new Mapping(validatedLayout)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = map.section(this as any) // TODO: Fix this type when View interface is properly defined
    return result || []
  }

  /**
   * Size the contents to a given width and height
   */
  size(width: number, height: number): void {
    const viewport: ViewportOptions = { scale: '1.0', scalable: 'no' }

    this.layoutStyle('scrolling')

    if (width >= 0) {
      this.width(width)
      viewport.width = width.toString()
      this.css('padding', '0 ' + width / 12 + 'px')
    }

    if (height >= 0) {
      this.height(height)
      viewport.height = height.toString()
    }

    this.css('margin', '0')
    this.css('box-sizing', 'border-box')

    this.viewport(viewport)
  }

  /**
   * Apply columns to the contents for pagination
   */
  columns(width: number, height: number, columnWidth: number, gap: number, dir?: string): void {
    const COLUMN_AXIS = prefixed('column-axis')
    const COLUMN_GAP = prefixed('column-gap')
    const COLUMN_WIDTH = prefixed('column-width')
    const COLUMN_FILL = prefixed('column-fill')

    const writingMode = this.writingMode()
    const axis = writingMode.indexOf('vertical') === 0 ? 'vertical' : 'horizontal'

    this.layoutStyle('paginated')

    if (dir === 'rtl' && axis === 'horizontal') {
      this.direction(dir)
    }

    this.width(width)
    this.height(height)

    // Deal with Mobile trying to scale to viewport
    this.viewport({
      width: width.toString(),
      height: height.toString(),
      scale: '1.0',
      scalable: 'no'
    })

    this.css('overflow-y', 'hidden')
    this.css('margin', '0', true)

    if (axis === 'vertical') {
      this.css('padding-top', gap / 2 + 'px', true)
      this.css('padding-bottom', gap / 2 + 'px', true)
      this.css('padding-left', '20px')
      this.css('padding-right', '20px')
      this.css(COLUMN_AXIS, 'vertical')
    } else {
      this.css('padding-top', '20px')
      this.css('padding-bottom', '20px')
      this.css('padding-left', gap / 2 + 'px', true)
      this.css('padding-right', gap / 2 + 'px', true)
      this.css(COLUMN_AXIS, 'horizontal')
    }

    this.css('box-sizing', 'border-box')
    this.css('max-width', 'inherit')

    this.css(COLUMN_FILL, 'auto')

    this.css(COLUMN_GAP, gap + 'px')
    this.css(COLUMN_WIDTH, columnWidth + 'px')

    // Fix glyph clipping in WebKit
    // https://github.com/futurepress/epub.js/issues/983
    this.css('-webkit-line-box-contain', 'block glyphs replaced')
  }

  /**
   * Scale contents from center
   */
  scaler(scale: number, offsetX?: number, offsetY?: number): void {
    const scaleStr = 'scale(' + scale + ')'
    let translateStr = ''
    // this.css("position", "absolute"));
    this.css('transform-origin', 'top left')

    if ((offsetX && offsetX >= 0) || (offsetY && offsetY >= 0)) {
      translateStr = ' translate(' + (offsetX || 0) + 'px, ' + (offsetY || 0) + 'px )'
    }

    this.css('transform', scaleStr + translateStr)
  }

  /**
   * Fit contents into a fixed width and height
   */
  fit(width: number, height: number, section?: Section): void {
    // Validate section at runtime if provided
    if (section) {
      section = safeValidate(SectionSchema, section, 'fit')
    }
    const viewport = this.viewport()
    const viewportWidth = parseInt(viewport.width!)
    const viewportHeight = parseInt(viewport.height!)
    const widthScale = width / viewportWidth
    const heightScale = height / viewportHeight
    const scale = widthScale < heightScale ? widthScale : heightScale

    this.layoutStyle('paginated')

    // scale needs width and height to be set
    this.width(viewportWidth)
    this.height(viewportHeight)
    this.overflow('hidden')

    // Scale to the correct size
    this.scaler(scale, 0, 0)

    // background images are not scaled by transform
    this.css('background-size', viewportWidth * scale + 'px ' + viewportHeight * scale + 'px')

    this.css('background-color', 'transparent')
    if (section && section.properties && section.properties.includes('page-spread-left')) {
      // set margin since scale is weird
      const marginLeft = width - viewportWidth * scale
      this.css('margin-left', marginLeft + 'px')
    }
  }

  /**
   * Set the direction of the text
   */
  direction(dir?: string): string {
    if (this.documentElement) {
      this.documentElement.style['direction'] = dir!
    }
    return this.window.getComputedStyle(this.documentElement)['direction']
  }

  mapPage(
    cfiBase: string,
    layout: Layout,
    start: number,
    end: number,
    dev?: boolean
  ): { start: string; end: string } | undefined {
    // Validate layout at runtime
    const validatedLayout = safeValidate(LayoutSchema, layout, 'mapPage')
    const mapping = new Mapping(validatedLayout, undefined, undefined, dev || false)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return mapping.page(this as any, cfiBase, start, end) // TODO: Fix this type when View interface is properly defined
  }

  /**
   * Emit event when link in content is clicked
   */
  linksHandler(): void {
    replaceLinks(this.content, (href: string) => {
      this.emit(EVENTS.CONTENTS.LINK_CLICKED, href)
    })
  }

  /**
   * Set the writingMode of the text
   */
  writingMode(mode?: string): string {
    const WRITING_MODE = prefixed('writing-mode')

    if (mode && this.documentElement) {
      this.documentElement.style[WRITING_MODE] = mode
    }

    return this.window.getComputedStyle(this.documentElement)[WRITING_MODE] || ''
  }

  /**
   * Set the layoutStyle of the content
   */
  layoutStyle(style?: string): string {
    if (style) {
      this._layoutStyle = style
      ;(
        navigator as Navigator & { epubReadingSystem?: { layoutStyle?: string } }
      ).epubReadingSystem!.layoutStyle = this._layoutStyle
    }

    return this._layoutStyle || 'paginated'
  }

  /**
   * Add the epubReadingSystem object to the navigator
   */
  epubReadingSystem(name: string, version: string): EpubReadingSystem {
    // Validate input parameters
    const validatedName = safeValidate(z.string(), name, 'epubReadingSystem.name')
    const validatedVersion = safeValidate(z.string(), version, 'epubReadingSystem.version')
    const readingSystem: EpubReadingSystem = {
      name: validatedName,
      version: validatedVersion,
      layoutStyle: this.layoutStyle(),
      hasFeature: function (feature: string): boolean {
        switch (feature) {
          case 'dom-manipulation':
            return true
          case 'layout-changes':
            return true
          case 'touch-events':
            return true
          case 'mouse-events':
            return true
          case 'keyboard-events':
            return true
          case 'spine-scripting':
            return false
          default:
            return false
        }
      }
    }

    // Validate the reading system before assignment
    const validatedReadingSystem = safeValidate(
      EpubReadingSystemSchema,
      readingSystem,
      'epubReadingSystem'
    )
    ;(navigator as Navigator & { epubReadingSystem?: EpubReadingSystem }).epubReadingSystem =
      validatedReadingSystem
    return validatedReadingSystem
  }

  destroy(): void {
    this.removeListeners()
  }

  // EventEmitter methods - these are placeholder implementations
  // The actual implementation is added by EventEmitter mixin at the bottom of the file
  on(event: string, handler: (...args: unknown[]) => void): void {
    // Implementation will be added by EventEmitter mixin
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    void event
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    void handler
  }

  off(event: string, handler: (...args: unknown[]) => void): void {
    // Implementation will be added by EventEmitter mixin
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    void event
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    void handler
  }

  emit(event: string, ...args: unknown[]): void {
    // Implementation will be added by EventEmitter mixin
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    void event
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    void args
  }
}

EventEmitter(Contents.prototype)

export default Contents
