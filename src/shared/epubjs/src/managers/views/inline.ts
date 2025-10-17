import EventEmitter from 'event-emitter'
import { extend, borders, uuid, isNumber, bounds, Deferred, qs, parse } from '../../utils/core'
import EpubCFI from '../../epubcfi'
import Contents from '../../contents'
import { EVENTS } from '../../utils/constants'

interface InlineViewSettings {
  ignoreClass: string
  axis: 'vertical' | 'horizontal'
  width: number
  height: number
  layout?: any
  globalLayoutProperties: Record<string, any>
}

interface Section {
  index: number
  render(request: any): Promise<string>
}

interface Layout {
  name: string
  format(contents: any): void
}

interface Contents {
  locationOf(target: any, ignoreClass?: string): { left: number; top: number }
  destroy(): void
}

class InlineView {
  private settings: InlineViewSettings
  private id: string
  private section: Section
  private index: number
  private element: HTMLElement
  private added: boolean
  private displayed: boolean
  private rendered: boolean
  private width: number
  private height: number
  private fixedWidth: number
  private fixedHeight: number
  private epubcfi: EpubCFI
  private layout?: Layout

  // frame related
  private frame?: HTMLElement
  private document?: Document
  private window?: Window
  private contents?: Contents
  private rendering: boolean = false

  // sizing
  private _width: number = 0
  private _height: number = 0
  private _textWidth?: number
  private _textHeight?: number
  private _needsReframe: boolean = true
  private _expanding: boolean = false

  // layout
  private lockedWidth?: number
  private lockedHeight?: number
  private elementBounds?: DOMRect
  private prevBounds?: DOMRect
  private stopExpanding: boolean = false

  constructor(section: Section, options?: Partial<InlineViewSettings>) {
    this.settings = extend(
      {
        ignoreClass: '',
        axis: 'vertical',
        width: 0,
        height: 0,
        layout: undefined,
        globalLayoutProperties: {}
      },
      options || {}
    )

    this.id = 'epubjs-view:' + uuid()
    this.section = section
    this.index = section.index

    this.element = this.container(this.settings.axis)

    this.added = false
    this.displayed = false
    this.rendered = false

    this.width = this.settings.width
    this.height = this.settings.height

    this.fixedWidth = 0
    this.fixedHeight = 0

    // Blank Cfi for Parsing
    this.epubcfi = new EpubCFI()

    this.layout = this.settings.layout
  }

  container(axis: string): HTMLElement {
    const element = document.createElement('div')

    element.classList.add('epub-view')

    element.style.overflow = 'hidden'

    if (axis && axis === 'horizontal') {
      element.style.display = 'inline-block'
    } else {
      element.style.display = 'block'
    }

    return element
  }

  create(): HTMLElement | undefined {
    if (this.frame) {
      return this.frame
    }

    if (!this.element) {
      this.element = this.container(this.settings.axis)
    }

    this.frame = document.createElement('div')
    this.frame.id = this.id
    this.frame.style.overflow = 'hidden'
    this.frame.style.wordSpacing = 'initial'
    this.frame.style.lineHeight = 'initial'

    this.resizing = true

    this.element.style.visibility = 'hidden'
    this.frame.style.visibility = 'hidden'

    if (this.settings.axis === 'horizontal') {
      this.frame.style.width = 'auto'
      this.frame.style.height = '0'
    } else {
      this.frame.style.width = '0'
      this.frame.style.height = 'auto'
    }

    this._width = 0
    this._height = 0

    this.element.appendChild(this.frame)
    this.added = true

    this.elementBounds = bounds(this.element)

    return this.frame
  }

  render(request: any, show?: boolean): Promise<any> {
    this.create()

    this.size()

    return this.section
      .render(request)
      .then(
        function (contents: string) {
          return this.load(contents)
        }.bind(this)
      )
      .then(
        function () {
          // apply the layout function to the contents
          this.settings.layout.format(this.contents)

          // Listen for events that require an expansion of the iframe
          this.addListeners()

          if (show !== false) {
            this.show()
          }
          this.emit(EVENTS.VIEWS.RENDERED, this.section)
        }.bind(this)
      )
      .catch(
        function (e: any) {
          this.emit(EVENTS.VIEWS.LOAD_ERROR, e)
        }.bind(this)
      )
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
  }

  lock(what: string, width: number, height: number): void {
    const elBorders = borders(this.element)
    let frameBorders: { width: number; height: number }

    if (this.frame) {
      frameBorders = borders(this.frame)
    } else {
      frameBorders = { width: 0, height: 0 }
    }

    if (what === 'width' && isNumber(width)) {
      this.lockedWidth = width - elBorders.width - frameBorders.width
      this.resize(this.lockedWidth, false)
    }

    if (what === 'height' && isNumber(height)) {
      this.lockedHeight = height - elBorders.height - frameBorders.height
      this.resize(false, this.lockedHeight)
    }

    if (what === 'both' && isNumber(width) && isNumber(height)) {
      this.lockedWidth = width - elBorders.width - frameBorders.width
      this.lockedHeight = height - elBorders.height - frameBorders.height

      this.resize(this.lockedWidth, this.lockedHeight)
    }
  }

  expand(force?: boolean): void {
    let width = this.lockedWidth
    let height = this.lockedHeight

    if (!this.frame || this._expanding) return

    this._expanding = true

    // Expand Horizontally
    if (this.settings.axis === 'horizontal') {
      width = this.contentWidth()
    }
    // Expand Vertically
    else if (this.settings.axis === 'vertical') {
      height = this.contentHeight()
    }

    // Only Resize if dimensions have changed or
    // if Frame is still hidden, so needs reframing
    if (this._needsReframe || width !== this._width || height !== this._height) {
      this.resize(width, height)
    }

    this._expanding = false
  }

  contentWidth(): number {
    return this.frame!.scrollWidth
  }

  contentHeight(): number {
    return this.frame!.scrollHeight
  }

  resize(width: number | false, height: number | false): void {
    if (!this.frame) return

    if (isNumber(width)) {
      this.frame.style.width = width + 'px'
      this._width = width
    }

    if (isNumber(height)) {
      this.frame.style.height = height + 'px'
      this._height = height
    }

    this.prevBounds = this.elementBounds

    this.elementBounds = bounds(this.element)

    const size = {
      width: this.elementBounds.width,
      height: this.elementBounds.height,
      widthDelta: this.elementBounds.width - (this.prevBounds?.width || 0),
      heightDelta: this.elementBounds.height - (this.prevBounds?.height || 0)
    }

    this.onResize(this, size)

    this.emit(EVENTS.VIEWS.RESIZED, size)
  }

  load(contents: string): Promise<Contents> {
    const loading = new Deferred<Contents>()
    const loaded = loading.promise
    const doc = parse(contents, 'text/html')
    const body = qs(doc, 'body')

    this.frame!.innerHTML = body!.innerHTML

    this.document = this.frame!.ownerDocument
    this.window = this.document.defaultView

    this.contents = new Contents(this.document, this.frame!)

    this.rendering = false

    loading.resolve!(this.contents)

    return loaded
  }

  setLayout(layout: Layout): void {
    this.layout = layout
  }

  resizeListenters(): void {
    // Test size again
    // clearTimeout(this.expanding);
    // this.expanding = setTimeout(this.expand.bind(this), 350);
  }

  addListeners(): void {
    // TODO: Add content listeners for expanding
  }

  removeListeners(): void {
    // TODO: remove content listeners for expanding
  }

  display(request: any): Promise<InlineView> {
    const displayed = new Deferred<InlineView>()

    if (!this.displayed) {
      this.render(request).then(
        function () {
          this.emit(EVENTS.VIEWS.DISPLAYED, this)
          this.onDisplayed(this)

          this.displayed = true

          displayed.resolve!(this)
        }.bind(this)
      )
    } else {
      displayed.resolve!(this)
    }

    return displayed.promise
  }

  show(): void {
    this.element.style.visibility = 'visible'

    if (this.frame) {
      this.frame.style.visibility = 'visible'
    }

    this.emit(EVENTS.VIEWS.SHOWN, this)
  }

  hide(): void {
    this.element.style.visibility = 'hidden'
    this.frame!.style.visibility = 'hidden'

    this.stopExpanding = true
    this.emit(EVENTS.VIEWS.HIDDEN, this)
  }

  position(): DOMRect {
    return this.element.getBoundingClientRect()
  }

  locationOf(target: any): { left: number; top: number } {
    const parentPos = this.frame!.getBoundingClientRect()
    const targetPos = this.contents!.locationOf(target, this.settings.ignoreClass)

    return {
      left: window.scrollX + parentPos.left + targetPos.left,
      top: window.scrollY + parentPos.top + targetPos.top
    }
  }

  onDisplayed(view: InlineView): void {
    // Stub, override with a custom functions
  }

  onResize(view: InlineView, e: any): void {
    // Stub, override with a custom functions
  }

  bounds(): DOMRect {
    if (!this.elementBounds) {
      this.elementBounds = bounds(this.element)
    }
    return this.elementBounds
  }

  destroy(): void {
    if (this.displayed) {
      this.displayed = false

      this.removeListeners()

      this.stopExpanding = true
      this.element.removeChild(this.frame!)
      this.displayed = false
      this.frame = undefined

      this._textWidth = undefined
      this._textHeight = undefined
      this._width = undefined
      this._height = undefined
    }
  }

  // EventEmitter methods
  on(event: string, handler: Function): void {
    // Implementation will be added by EventEmitter mixin
  }

  off(event: string, handler: Function): void {
    // Implementation will be added by EventEmitter mixin
  }

  emit(event: string, ...args: any[]): void {
    // Implementation will be added by EventEmitter mixin
  }
}

EventEmitter(InlineView.prototype)

export default InlineView
