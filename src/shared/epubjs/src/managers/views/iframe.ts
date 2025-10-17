import EventEmitter from 'event-emitter'
import {
  extend,
  borders,
  uuid,
  isNumber,
  Deferred,
  createBlobUrl,
  revokeBlobUrl
} from '../../utils/core'
import ContentsClass from '../../contents'
import { EVENTS } from '../../utils/constants'

interface IframeViewSettings {
  ignoreClass: string
  axis?: 'vertical' | 'horizontal'
  direction?: string
  width: number
  height: number
  layout?: Layout
  globalLayoutProperties: Record<string, unknown>
  method?: 'srcdoc' | 'write' | 'blobUrl'
  forceRight: boolean
  allowScriptedContent: boolean
  allowPopups: boolean
  flow?: 'scrolled' | 'paginated'
  forceEvenPages?: boolean
}

interface Section {
  index: number
  render(request?: unknown): Promise<string>
  cfiBase: string
  canonical: string
}

interface Layout {
  name: string
  width: number
  height: number
  pageWidth: number
  divisor: number
  columnWidth?: number
  delta?: number
  props?: {
    pageWidth: number
  }
  gap?: number
  format(contents: ContentsClass, section?: Section, axis?: 'vertical' | 'horizontal'): void
}

class IframeView {
  private settings: IframeViewSettings
  private id: string
  private section: Section
  private index: number
  private element: HTMLElement
  private displayed: boolean = false

  // iframe related
  private iframe?: HTMLIFrameElement
  private document?: Document
  private contents?: ContentsClass
  private sectionRender?: Promise<string>
  private supportsSrcdoc?: boolean
  private blobUrl?: string

  // sizing
  private _width: number = 0
  private _height: number = 0
  private _needsReframe: boolean = true
  private _expanding: boolean = false

  // layout
  private lockedWidth?: number
  private lockedHeight?: number
  private elementBounds?: DOMRect
  private prevBounds?: Record<string, number>
  private layout?: Layout

  constructor(section: Section, options?: Partial<IframeViewSettings>) {
    this.settings = extend(
      {
        ignoreClass: '',
        axis: undefined,
        direction: undefined,
        width: 0,
        height: 0,
        layout: undefined,
        globalLayoutProperties: {},
        method: undefined,
        forceRight: false,
        allowScriptedContent: false,
        allowPopups: false
      },
      options || {}
    )

    this.id = 'epubjs-view-' + uuid()
    this.section = section
    this.index = section.index

    this.element = this.container(this.settings.axis)

    this.displayed = false

    // Initialize layout
    this.layout = this.settings.layout as unknown as Layout
  }

  container(axis?: string): HTMLElement {
    const element = document.createElement('div')

    element.classList.add('epub-view')

    element.style.height = '0px'
    element.style.width = '0px'
    element.style.overflow = 'hidden'
    element.style.position = 'relative'
    element.style.display = 'block'

    if (axis && axis === 'horizontal') {
      element.style.flex = 'none'
    } else {
      element.style.flex = 'initial'
    }

    return element
  }

  create(): HTMLIFrameElement | undefined {
    if (this.iframe) {
      return this.iframe
    }

    if (!this.element) {
      this.element = this.container()
    }

    this.iframe = document.createElement('iframe')
    this.iframe.id = this.id
    this.iframe.scrolling = 'no'
    this.iframe.style.overflow = 'hidden'
    ;(this.iframe as unknown as Record<string, unknown>).seamless = 'seamless'
    this.iframe.style.border = 'none'

    // sandbox
    this.iframe.sandbox = 'allow-same-origin'
    if (this.settings.allowScriptedContent) {
      this.iframe.sandbox += ' allow-scripts'
    }
    if (this.settings.allowPopups) {
      this.iframe.sandbox += ' allow-popups'
    }

    this.iframe.setAttribute('enable-annotation', 'true')

    this.element.style.visibility = 'hidden'
    this.iframe.style.visibility = 'hidden'

    this.iframe.style.width = '0'
    this.iframe.style.height = '0'
    this._width = 0
    this._height = 0

    this.element.setAttribute('ref', String(this.index))

    this.elementBounds = this.element.getBoundingClientRect()

    if ('srcdoc' in this.iframe) {
      this.supportsSrcdoc = true
    } else {
      this.supportsSrcdoc = false
    }

    if (!this.settings.method) {
      this.settings.method = this.supportsSrcdoc ? 'srcdoc' : 'write'
    }

    return this.iframe
  }

  render(request?: unknown): Promise<void> {
    this.create()

    this.size()

    if (!this.sectionRender) {
      this.sectionRender = this.section.render(request)
    }

    return this.sectionRender
      .then((contents: string) => {
        return this.load(contents)
      })
      .then(() => {
        // find and report the writingMode axis
        const writingMode = this.contents!.writingMode()

        // Set the axis based on the flow and writing mode
        let axis: 'vertical' | 'horizontal'
        if (this.settings.flow === 'scrolled') {
          axis = writingMode.indexOf('vertical') === 0 ? 'horizontal' : 'vertical'
        } else {
          axis = writingMode.indexOf('vertical') === 0 ? 'vertical' : 'horizontal'
        }

        if (writingMode.indexOf('vertical') === 0 && this.settings.flow === 'paginated') {
          this.layout!.delta = this.layout!.height
        }

        this.setAxis(axis)
        this.emit(EVENTS.VIEWS.AXIS, axis)

        this.setWritingMode()
        this.emit(EVENTS.VIEWS.WRITING_MODE, writingMode)

        // apply the layout function to the contents
        this.layout!.format(this.contents!, this.section, this.settings.axis)

        // Listen for events that require an expansion of the iframe
        this.addListeners()

        return new Promise<void>((resolve) => {
          // Expand the iframe to the full size of the content
          this.expand()

          if (this.settings.forceRight) {
            this.element.style.marginLeft = this.width() + 'px'
          }
          resolve()
        })
      })
      .then(() => {
        this.emit(EVENTS.VIEWS.RENDERED, this.section)
      })
  }

  reset(): void {
    if (this.iframe) {
      this.iframe.style.width = '0'
      this.iframe.style.height = '0'
      this._width = 0
      this._height = 0
    }
    this._needsReframe = true
  }

  size(_width?: number, _height?: number): void {
    const width = _width || this.settings.width
    const height = _height || this.settings.height

    if (this.layout!.name === 'pre-paginated') {
      this.lock('both', width, height)
    } else if (this.settings.axis === 'horizontal') {
      this.lock('height', width, height)
    } else {
      this.lock('width', width, height)
    }

    this.settings.width = width
    this.settings.height = height
  }

  lock(what: string, width: number, height: number): void {
    const elBorders = borders(this.element)
    let iframeBorders: { width: number; height: number }

    if (this.iframe) {
      iframeBorders = borders(this.iframe)
    } else {
      iframeBorders = { width: 0, height: 0 }
    }

    if (what === 'width' && isNumber(width)) {
      this.lockedWidth = width - elBorders.width - iframeBorders.width
    }

    if (what === 'height' && isNumber(height)) {
      this.lockedHeight = height - elBorders.height - iframeBorders.height
    }

    if (what === 'both' && isNumber(width) && isNumber(height)) {
      this.lockedWidth = width - elBorders.width - iframeBorders.width
      this.lockedHeight = height - elBorders.height - iframeBorders.height
    }

    if (this.displayed && this.iframe) {
      this.expand()
    }
  }

  expand(): void {
    let width = this.lockedWidth || 0
    let height = this.lockedHeight || 0
    let columns: number

    if (!this.iframe || this._expanding) return

    this._expanding = true

    if (this.layout!.name === 'pre-paginated') {
      width = this.layout!.columnWidth!
      height = this.layout!.height
    } else if (this.settings.axis === 'horizontal') {
      width = this.contents!.textWidth()

      if (width % this.layout!.pageWidth > 0) {
        width = Math.ceil(width / this.layout!.pageWidth) * this.layout!.pageWidth
      }

      if (this.settings.forceEvenPages) {
        columns = width / this.layout!.pageWidth
        if (this.layout!.divisor > 1 && this.layout!.name === 'reflowable' && columns % 2 > 0) {
          width += this.layout!.pageWidth
        }
      }
    } else if (this.settings.axis === 'vertical') {
      height = this.contents!.textHeight()
      if (this.settings.flow === 'paginated' && height % this.layout!.height > 0) {
        height = Math.ceil(height / this.layout!.height) * this.layout!.height
      }
    }

    if (
      this._needsReframe ||
      width !== this._width ||
      (height !== undefined && height !== this._height)
    ) {
      this.reframe(width, height)
    }

    this._expanding = false
  }

  reframe(width: number, height?: number): void {
    if (isNumber(width)) {
      this.element.style.width = width + 'px'
      this.iframe!.style.width = width + 'px'
      this._width = width
    }

    if (height !== undefined && isNumber(height)) {
      this.element.style.height = height + 'px'
      this.iframe!.style.height = height + 'px'
      this._height = height
    }

    const widthDelta = this.prevBounds ? width - this.prevBounds.width : width
    const heightDelta =
      this.prevBounds && height !== undefined ? height - this.prevBounds.height : height || 0

    const size: Record<string, number> = {
      width,
      height: height || 0,
      widthDelta,
      heightDelta
    }

    this.onResize(this)

    this.emit(EVENTS.VIEWS.RESIZED, size)

    this.prevBounds = size

    this.elementBounds = this.element.getBoundingClientRect()
  }

  load(contents: string): Promise<ContentsClass> {
    const loading = new Deferred<ContentsClass>()
    const loaded = loading.promise

    if (!this.iframe) {
      loading.reject!(new Error('No Iframe Available'))
      return loaded
    }

    this.iframe.onload = () => {
      this.onLoad(loading)
    }

    if (this.settings.method === 'blobUrl') {
      this.blobUrl = createBlobUrl(contents, 'application/xhtml+xml')
      this.iframe.src = this.blobUrl
      this.element.appendChild(this.iframe)
    } else if (this.settings.method === 'srcdoc') {
      this.iframe.srcdoc = contents
      this.element.appendChild(this.iframe)
    } else {
      this.element.appendChild(this.iframe)

      this.document = this.iframe.contentDocument || undefined

      if (!this.document) {
        loading.reject!(new Error('No Document Available'))
        return loaded
      }

      this.iframe.contentDocument!.open()
      // For Cordova windows platform
      const win = window as unknown as Record<string, unknown>
      if (win.MSApp && win.MSApp) {
        const msApp = win.MSApp as { execUnsafeLocalFunction?: (fn: () => void) => void }
        if (msApp.execUnsafeLocalFunction) {
          msApp.execUnsafeLocalFunction(() => {
            this.iframe!.contentDocument!.write(contents)
          })
        } else {
          this.iframe.contentDocument!.write(contents)
        }
      } else {
        this.iframe.contentDocument!.write(contents)
      }
      this.iframe.contentDocument!.close()
    }

    return loaded
  }

  onLoad(promise: Deferred<ContentsClass>): void {
    this.document = this.iframe!.contentDocument || undefined

    this.contents = new ContentsClass(
      this.document!,
      this.document!.body,
      this.section.cfiBase,
      this.section.index
    )

    let link = this.document!.querySelector("link[rel='canonical']")
    if (link) {
      link.setAttribute('href', this.section.canonical)
    } else {
      link = this.document!.createElement('link')
      link.setAttribute('rel', 'canonical')
      link.setAttribute('href', this.section.canonical)
      this.document!.querySelector('head')!.appendChild(link)
    }

    this.contents.on(EVENTS.CONTENTS.EXPAND, () => {
      if (this.displayed && this.iframe) {
        this.expand()
        if (this.contents) {
          this.layout!.format(this.contents)
        }
      }
    })

    this.contents.on(EVENTS.CONTENTS.RESIZE, () => {
      if (this.displayed && this.iframe) {
        this.expand()
        if (this.contents) {
          this.layout!.format(this.contents)
        }
      }
    })

    promise.resolve!(this.contents)
  }

  setLayout(layout: Layout): void {
    this.layout = layout

    if (this.contents) {
      this.layout.format(this.contents)
      this.expand()
    }
  }

  setAxis(axis: 'vertical' | 'horizontal'): void {
    this.settings.axis = axis

    if (axis === 'horizontal') {
      this.element.style.flex = 'none'
    } else {
      this.element.style.flex = 'initial'
    }

    this.size()
  }

  setWritingMode(): void {
    // Implementation needed
  }

  addListeners(): void {
    // TODO: Add content listeners for expanding
  }

  removeListeners(): void {
    // TODO: remove content listeners for expanding
  }

  display(request?: unknown): Promise<IframeView> {
    const displayed = new Deferred<IframeView>()

    if (!this.displayed) {
      this.render(request).then(
        () => {
          this.emit(EVENTS.VIEWS.DISPLAYED, this)
          this.onDisplayed(this)

          this.displayed = true
          displayed.resolve!(this)
        },
        (err: unknown) => {
          displayed.reject!(err)
        }
      )
    } else {
      displayed.resolve!(this)
    }

    return displayed.promise
  }

  show(): void {
    this.element.style.visibility = 'visible'

    if (this.iframe) {
      this.iframe.style.visibility = 'visible'

      // Remind Safari to redraw the iframe
      this.iframe.style.transform = 'translateZ(0)'
      this.iframe.offsetWidth
      this.iframe.style.transform = ''
    }

    this.emit(EVENTS.VIEWS.SHOWN, this)
  }

  hide(): void {
    this.element.style.visibility = 'hidden'
    this.iframe!.style.visibility = 'hidden'

    this.emit(EVENTS.VIEWS.HIDDEN, this)
  }

  offset(): { top: number; left: number } {
    return {
      top: this.element.offsetTop,
      left: this.element.offsetLeft
    }
  }

  width(): number {
    return this._width
  }

  height(): number {
    return this._height
  }

  position(): DOMRect {
    return this.element.getBoundingClientRect()
  }

  locationOf(target: string | import('../../epubcfi').default): { left: number; top: number } {
    const targetPos = this.contents!.locationOf(target, this.settings.ignoreClass)

    return {
      left: targetPos.left,
      top: targetPos.top
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onDisplayed(_view: IframeView): void {
    // Stub, override with custom functions
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onResize(_view: IframeView): void {
    // Stub, override with custom functions
  }

  bounds(force?: boolean): DOMRect {
    if (force || !this.elementBounds) {
      this.elementBounds = this.element.getBoundingClientRect()
    }

    return this.elementBounds!
  }

  destroy(): void {
    if (this.blobUrl) {
      revokeBlobUrl(this.blobUrl)
    }

    if (this.displayed) {
      this.displayed = false

      this.removeListeners()
      this.contents!.destroy()

      this.element.removeChild(this.iframe!)

      this.iframe = undefined
      this.contents = undefined

      this._width = 0
      this._height = 0
    }
  }

  // EventEmitter methods - these will be mixed in by EventEmitter
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  on(_event: string, _handler: (...args: unknown[]) => void): void {
    // Implementation will be added by EventEmitter mixin
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  off(_event: string, _handler: (...args: unknown[]) => void): void {
    // Implementation will be added by EventEmitter mixin
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  emit(_event: string, ..._args: unknown[]): void {
    // Implementation will be added by EventEmitter mixin
  }
}

EventEmitter(IframeView.prototype)

export default IframeView
