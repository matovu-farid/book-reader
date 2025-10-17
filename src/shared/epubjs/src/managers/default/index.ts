import EventEmitter from 'event-emitter'
import { extend, Deferred, windowBounds, isNumber } from '../../utils/core'
import scrollType from '../../utils/scrolltype'
import Mapping from '../../mapping'
import Queue from '../../utils/queue'
import Stage from '../helpers/stage'
import Views from '../helpers/views'
import { EVENTS } from '../../utils/constants'

interface DefaultViewManagerSettings {
  infinite: boolean
  hidden: boolean
  width?: number
  height?: number
  axis?: 'vertical' | 'horizontal'
  writingMode?: string
  flow?: string
  ignoreClass: string
  fullsize?: boolean
  allowScriptedContent: boolean
  allowPopups: boolean
  direction?: string
  overflow?: string
  gap?: number
  offset?: number
  method?: string
  forceEvenPages?: boolean
  resizeOnOrientationChange?: boolean
  rtlScrollType?: string
}

interface ViewSettings {
  ignoreClass: string
  axis?: 'vertical' | 'horizontal'
  flow?: string
  layout?: any
  method?: string
  width: number
  height: number
  forceEvenPages: boolean
  allowScriptedContent: boolean
  allowPopups: boolean
  direction?: string
}

interface Section {
  index: number
  href: string
  properties: string[]
  next(): Section | undefined
  prev(): Section | undefined
}

interface View {
  section: Section
  contents?: any
  displayed: boolean
  offset(): { top: number; left: number }
  width(): number
  height(): number
  position(): DOMRect
  locationOf(target: any): { left: number; top: number }
  setLayout(layout: any): void
  on(event: string, handler: Function): void
  onDisplayed: (view: View) => void
  onResize: (view: View, e: any) => void
}

interface Layout {
  name: string
  width: number
  height: number
  pageWidth: number
  delta: number
  divisor: number
  gap?: number
  props: any
  settings: { spread: string }
  calculate(width: number, height: number, gap?: number): void
  count(width: number, height?: number): { pages: number }
  spread(type: string): void
  format(contents: any): void
}

interface StageSize {
  width: number
  height: number
}

interface ContainerBounds {
  left: number
  right: number
  top: number
  bottom: number
  width: number
  height: number
}

interface LocationSection {
  index: number
  href: string
  pages: number[]
  totalPages: number
  mapping: any
}

class DefaultViewManager {
  name: string
  optsSettings: any
  View: any
  request: any
  renditionQueue: any
  q: Queue
  settings: DefaultViewManagerSettings
  viewSettings: ViewSettings
  rendered: boolean

  // Layout and stage
  layout?: Layout
  stage?: Stage
  container?: HTMLDivElement
  views?: Views
  mapping?: Mapping

  // Size tracking
  _bounds?: ContainerBounds
  _stageSize?: StageSize

  // Scroll tracking
  scrollTop: number = 0
  scrollLeft: number = 0
  scrolled: boolean = false
  ignore: boolean = false

  // Flow and pagination
  isPaginated: boolean = false
  overflow?: string
  writingMode?: string
  location?: LocationSection[]

  // Timeouts
  orientationTimeout?: number
  resizeTimeout?: number
  afterScrolled?: number

  // Event handlers
  _onScroll?: (e: Event) => void

  constructor(options: {
    settings?: Partial<DefaultViewManagerSettings>
    view: any
    request: any
    queue: any
  }) {
    this.name = 'default'
    this.optsSettings = options.settings
    this.View = options.view
    this.request = options.request
    this.renditionQueue = options.queue
    this.q = new Queue(this)

    this.settings = extend(
      {
        infinite: true,
        hidden: false,
        width: undefined,
        height: undefined,
        axis: undefined,
        writingMode: undefined,
        flow: 'scrolled',
        ignoreClass: '',
        fullsize: undefined,
        allowScriptedContent: false,
        allowPopups: false
      },
      options.settings || {}
    )

    this.viewSettings = {
      ignoreClass: this.settings.ignoreClass,
      axis: this.settings.axis,
      flow: this.settings.flow,
      layout: this.layout,
      method: this.settings.method,
      width: 0,
      height: 0,
      forceEvenPages: true,
      allowScriptedContent: this.settings.allowScriptedContent,
      allowPopups: this.settings.allowPopups
    }

    this.rendered = false
  }

  render(element: HTMLElement, size: { width: number; height: number }): void {
    const tag = element.tagName

    if (
      typeof this.settings.fullsize === 'undefined' &&
      tag &&
      (tag.toLowerCase() === 'body' || tag.toLowerCase() === 'html')
    ) {
      this.settings.fullsize = true
    }

    if (this.settings.fullsize) {
      this.settings.overflow = 'visible'
      this.overflow = this.settings.overflow
    }

    this.settings.size = size

    this.settings.rtlScrollType = scrollType()

    // Save the stage
    this.stage = new Stage({
      width: size.width,
      height: size.height,
      overflow: this.overflow,
      hidden: this.settings.hidden,
      axis: this.settings.axis,
      fullsize: this.settings.fullsize,
      direction: this.settings.direction
    })

    this.stage.attachTo(element)

    // Get this stage container div
    this.container = this.stage.getContainer()

    // Views array methods
    this.views = new Views(this.container)

    // Calculate Stage Size
    this._bounds = this.bounds()
    this._stageSize = this.stage.size()

    // Set the dimensions for views
    this.viewSettings.width = this._stageSize.width
    this.viewSettings.height = this._stageSize.height

    // Function to handle a resize event.
    this.stage.onResize(this.onResized.bind(this))

    this.stage.onOrientationChange(this.onOrientationChange.bind(this))

    // Add Event Listeners
    this.addEventListeners()

    if (this.layout) {
      this.updateLayout()
    }

    this.rendered = true
  }

  addEventListeners(): void {
    let scroller: Window | HTMLElement

    window.addEventListener(
      'unload',
      function (e: Event) {
        this.destroy()
      }.bind(this)
    )

    if (!this.settings.fullsize) {
      scroller = this.container!
    } else {
      scroller = window
    }

    this._onScroll = this.onScroll.bind(this)
    scroller.addEventListener('scroll', this._onScroll)
  }

  removeEventListeners(): void {
    let scroller: Window | HTMLElement

    if (!this.settings.fullsize) {
      scroller = this.container!
    } else {
      scroller = window
    }

    scroller.removeEventListener('scroll', this._onScroll!)
    this._onScroll = undefined
  }

  destroy(): void {
    clearTimeout(this.orientationTimeout)
    clearTimeout(this.resizeTimeout)
    clearTimeout(this.afterScrolled)

    this.clear()

    this.removeEventListeners()

    this.stage!.destroy()

    this.rendered = false
  }

  onOrientationChange(e: Event): void {
    const { orientation } = window

    if (this.optsSettings.resizeOnOrientationChange) {
      this.resize()
    }

    clearTimeout(this.orientationTimeout)
    this.orientationTimeout = window.setTimeout(
      function () {
        this.orientationTimeout = undefined

        if (this.optsSettings.resizeOnOrientationChange) {
          this.resize()
        }

        this.emit(EVENTS.MANAGERS.ORIENTATION_CHANGE, orientation)
      }.bind(this),
      500
    )
  }

  onResized(e: UIEvent): void {
    this.resize()
  }

  resize(width?: number, height?: number, epubcfi?: string): void {
    const stageSize = this.stage!.size(width, height)

    // For Safari, wait for orientation to catch up
    const winBounds = windowBounds()
    if (this.orientationTimeout && winBounds.width === winBounds.height) {
      // reset the stage size for next resize
      this._stageSize = undefined
      return
    }

    if (
      this._stageSize &&
      this._stageSize.width === stageSize.width &&
      this._stageSize.height === stageSize.height
    ) {
      // Size is the same, no need to resize
      return
    }

    this._stageSize = stageSize

    this._bounds = this.bounds()

    // Clear current views
    this.clear()

    // Update for new views
    this.viewSettings.width = this._stageSize.width
    this.viewSettings.height = this._stageSize.height

    this.updateLayout()

    this.emit(
      EVENTS.MANAGERS.RESIZED,
      {
        width: this._stageSize.width,
        height: this._stageSize.height
      },
      epubcfi
    )
  }

  createView(section: Section, forceRight: boolean): View {
    return new this.View(section, extend(this.viewSettings, { forceRight }))
  }

  handleNextPrePaginated(
    forceRight: boolean,
    section: Section,
    action: Function
  ): Promise<any> | undefined {
    let next: Section | undefined

    if (this.layout!.name === 'pre-paginated' && this.layout!.divisor > 1) {
      if (forceRight || section.index === 0) {
        // First page (cover) should stand alone for pre-paginated books
        return
      }
      next = section.next()
      if (next && !next.properties.includes('page-spread-left')) {
        return action.call(this, next)
      }
    }
  }

  display(section: Section, target?: any): Promise<void> {
    const displaying = new Deferred<void>()
    const displayed = displaying.promise

    // Check if moving to target is needed
    if (target === section.href || isNumber(target)) {
      target = undefined
    }

    // Check to make sure the section we want isn't already shown
    const visible = this.views!.find(section)

    // View is already shown, just move to correct location in view
    if (visible && section && this.layout!.name !== 'pre-paginated') {
      const offset = visible.offset()

      if (this.settings.direction === 'ltr') {
        this.scrollTo(offset.left, offset.top, true)
      } else {
        const width = visible.width()
        this.scrollTo(offset.left + width, offset.top, true)
      }

      if (target) {
        const offset = visible.locationOf(target)
        const width = visible.width()
        this.moveTo(offset, width)
      }

      displaying.resolve!()
      return displayed
    }

    // Hide all current views
    this.clear()

    let forceRight = false
    if (
      this.layout!.name === 'pre-paginated' &&
      this.layout!.divisor === 2 &&
      section.properties.includes('page-spread-right')
    ) {
      forceRight = true
    }

    this.add(section, forceRight)
      .then(
        function (view: View) {
          // Move to correct place within the section, if needed
          if (target) {
            const offset = view.locationOf(target)
            const width = view.width()
            this.moveTo(offset, width)
          }
        }.bind(this),
        (err: any) => {
          displaying.reject!(err)
        }
      )
      .then(
        function () {
          return this.handleNextPrePaginated(forceRight, section, this.add)
        }.bind(this)
      )
      .then(
        function () {
          this.views!.show()

          displaying.resolve!()
        }.bind(this)
      )

    return displayed
  }

  afterDisplayed(view: View): void {
    this.emit(EVENTS.MANAGERS.ADDED, view)
  }

  afterResized(view: View): void {
    this.emit(EVENTS.MANAGERS.RESIZE, view.section)
  }

  moveTo(offset: { left: number; top: number }, width: number): void {
    let distX = 0
    let distY = 0

    if (!this.isPaginated) {
      distY = offset.top
    } else {
      distX = Math.floor(offset.left / this.layout!.delta) * this.layout!.delta

      if (distX + this.layout!.delta > this.container!.scrollWidth) {
        distX = this.container!.scrollWidth - this.layout!.delta
      }

      distY = Math.floor(offset.top / this.layout!.delta) * this.layout!.delta

      if (distY + this.layout!.delta > this.container!.scrollHeight) {
        distY = this.container!.scrollHeight - this.layout!.delta
      }
    }
    if (this.settings.direction === 'rtl') {
      distX = distX + this.layout!.delta
      distX = distX - width
    }
    this.scrollTo(distX, distY, true)
  }

  add(section: Section, forceRight: boolean): Promise<View> {
    const view = this.createView(section, forceRight)

    this.views!.append(view)

    view.onDisplayed = this.afterDisplayed.bind(this)
    view.onResize = this.afterResized.bind(this)

    view.on(EVENTS.VIEWS.AXIS, (axis: string) => {
      this.updateAxis(axis)
    })

    view.on(EVENTS.VIEWS.WRITING_MODE, (mode: string) => {
      this.updateWritingMode(mode)
    })

    return view.display(this.request)
  }

  append(section: Section, forceRight: boolean): Promise<View> {
    const view = this.createView(section, forceRight)
    this.views!.append(view)

    view.onDisplayed = this.afterDisplayed.bind(this)
    view.onResize = this.afterResized.bind(this)

    view.on(EVENTS.VIEWS.AXIS, (axis: string) => {
      this.updateAxis(axis)
    })

    view.on(EVENTS.VIEWS.WRITING_MODE, (mode: string) => {
      this.updateWritingMode(mode)
    })

    return view.display(this.request)
  }

  prepend(section: Section, forceRight: boolean): Promise<View> {
    const view = this.createView(section, forceRight)

    view.on(EVENTS.VIEWS.RESIZED, (bounds: any) => {
      this.counter(bounds)
    })

    this.views!.prepend(view)

    view.onDisplayed = this.afterDisplayed.bind(this)
    view.onResize = this.afterResized.bind(this)

    view.on(EVENTS.VIEWS.AXIS, (axis: string) => {
      this.updateAxis(axis)
    })

    view.on(EVENTS.VIEWS.WRITING_MODE, (mode: string) => {
      this.updateWritingMode(mode)
    })

    return view.display(this.request)
  }

  counter(bounds: any): void {
    if (this.settings.axis === 'vertical') {
      this.scrollBy(0, bounds.heightDelta, true)
    } else {
      this.scrollBy(bounds.widthDelta, 0, true)
    }
  }

  next(): Promise<any> | undefined {
    let next: Section | undefined
    let left: number

    const dir = this.settings.direction

    if (!this.views!.length) return

    if (this.isPaginated && this.settings.axis === 'horizontal' && (!dir || dir === 'ltr')) {
      this.scrollLeft = this.container!.scrollLeft

      left = this.container!.scrollLeft + this.container!.offsetWidth + this.layout!.delta

      if (left <= this.container!.scrollWidth) {
        this.scrollBy(this.layout!.delta, 0, true)
      } else {
        next = this.views!.last()!.section.next()
      }
    } else if (this.isPaginated && this.settings.axis === 'horizontal' && dir === 'rtl') {
      this.scrollLeft = this.container!.scrollLeft

      if (this.settings.rtlScrollType === 'default') {
        left = this.container!.scrollLeft

        if (left > 0) {
          this.scrollBy(this.layout!.delta, 0, true)
        } else {
          next = this.views!.last()!.section.next()
        }
      } else {
        left = this.container!.scrollLeft + this.layout!.delta * -1

        if (left > this.container!.scrollWidth * -1) {
          this.scrollBy(this.layout!.delta, 0, true)
        } else {
          next = this.views!.last()!.section.next()
        }
      }
    } else if (this.isPaginated && this.settings.axis === 'vertical') {
      this.scrollTop = this.container!.scrollTop

      const top = this.container!.scrollTop + this.container!.offsetHeight

      if (top < this.container!.scrollHeight) {
        this.scrollBy(0, this.layout!.height, true)
      } else {
        next = this.views!.last()!.section.next()
      }
    } else {
      next = this.views!.last()!.section.next()
    }

    if (next) {
      this.clear()
      this.updateLayout()

      let forceRight = false
      if (
        this.layout!.name === 'pre-paginated' &&
        this.layout!.divisor === 2 &&
        next.properties.includes('page-spread-right')
      ) {
        forceRight = true
      }

      return this.append(next, forceRight)
        .then(
          function () {
            return this.handleNextPrePaginated(forceRight, next, this.append)
          }.bind(this),
          (err: any) => {
            return err
          }
        )
        .then(
          function () {
            // Reset position to start for scrolled-doc vertical-rl in default mode
            if (
              !this.isPaginated &&
              this.settings.axis === 'horizontal' &&
              this.settings.direction === 'rtl' &&
              this.settings.rtlScrollType === 'default'
            ) {
              this.scrollTo(this.container!.scrollWidth, 0, true)
            }
            this.views!.show()
          }.bind(this)
        )
    }
  }

  prev(): Promise<any> | undefined {
    let prev: Section | undefined
    let left: number
    const dir = this.settings.direction

    if (!this.views!.length) return

    if (this.isPaginated && this.settings.axis === 'horizontal' && (!dir || dir === 'ltr')) {
      this.scrollLeft = this.container!.scrollLeft

      left = this.container!.scrollLeft

      if (left > 0) {
        this.scrollBy(-this.layout!.delta, 0, true)
      } else {
        prev = this.views!.first()!.section.prev()
      }
    } else if (this.isPaginated && this.settings.axis === 'horizontal' && dir === 'rtl') {
      this.scrollLeft = this.container!.scrollLeft

      if (this.settings.rtlScrollType === 'default') {
        left = this.container!.scrollLeft + this.container!.offsetWidth

        if (left < this.container!.scrollWidth) {
          this.scrollBy(-this.layout!.delta, 0, true)
        } else {
          prev = this.views!.first()!.section.prev()
        }
      } else {
        left = this.container!.scrollLeft

        if (left < 0) {
          this.scrollBy(-this.layout!.delta, 0, true)
        } else {
          prev = this.views!.first()!.section.prev()
        }
      }
    } else if (this.isPaginated && this.settings.axis === 'vertical') {
      this.scrollTop = this.container!.scrollTop

      const top = this.container!.scrollTop

      if (top > 0) {
        this.scrollBy(0, -this.layout!.height, true)
      } else {
        prev = this.views!.first()!.section.prev()
      }
    } else {
      prev = this.views!.first()!.section.prev()
    }

    if (prev) {
      this.clear()
      this.updateLayout()

      let forceRight = false
      if (
        this.layout!.name === 'pre-paginated' &&
        this.layout!.divisor === 2 &&
        typeof prev.prev() !== 'object'
      ) {
        forceRight = true
      }

      return this.prepend(prev, forceRight)
        .then(
          function () {
            let left: Section | undefined
            if (this.layout!.name === 'pre-paginated' && this.layout!.divisor > 1) {
              left = prev.prev()
              if (left) {
                return this.prepend(left)
              }
            }
          }.bind(this),
          (err: any) => {
            return err
          }
        )
        .then(
          function () {
            if (this.isPaginated && this.settings.axis === 'horizontal') {
              if (this.settings.direction === 'rtl') {
                if (this.settings.rtlScrollType === 'default') {
                  this.scrollTo(0, 0, true)
                } else {
                  this.scrollTo(this.container!.scrollWidth * -1 + this.layout!.delta, 0, true)
                }
              } else {
                this.scrollTo(this.container!.scrollWidth - this.layout!.delta, 0, true)
              }
            }
            this.views!.show()
          }.bind(this)
        )
    }
  }

  current(): View | null {
    const visible = this.visible()
    if (visible.length) {
      // Current is the last visible view
      return visible[visible.length - 1]
    }
    return null
  }

  clear(): void {
    if (this.views) {
      this.views.hide()
      this.scrollTo(0, 0, true)
      this.views.clear()
    }
  }

  currentLocation(): LocationSection[] {
    this.updateLayout()
    if (this.isPaginated && this.settings.axis === 'horizontal') {
      this.location = this.paginatedLocation()
    } else {
      this.location = this.scrolledLocation()
    }
    return this.location
  }

  scrolledLocation(): LocationSection[] {
    const visible = this.visible()
    const container = this.container!.getBoundingClientRect()
    const pageHeight = container.height < window.innerHeight ? container.height : window.innerHeight
    const pageWidth = container.width < window.innerWidth ? container.width : window.innerWidth
    const vertical = this.settings.axis === 'vertical'
    const rtl = this.settings.direction === 'rtl'

    let offset = 0
    const used = 0

    if (this.settings.fullsize) {
      offset = vertical ? window.scrollY : window.scrollX
    }

    const sections = visible.map((view) => {
      const { index, href } = view.section
      const position = view.position()
      const width = view.width()
      const height = view.height()

      let startPos: number
      let endPos: number
      let stopPos: number
      let totalPages: number

      if (vertical) {
        startPos = offset + container.top - position.top + used
        endPos = startPos + pageHeight - used
        totalPages = this.layout!.count(height, pageHeight).pages
        stopPos = pageHeight
      } else {
        startPos = offset + container.left - position.left + used
        endPos = startPos + pageWidth - used
        totalPages = this.layout!.count(width, pageWidth).pages
        stopPos = pageWidth
      }

      let currPage = Math.ceil(startPos / stopPos)
      const pages: number[] = []
      let endPage = Math.ceil(endPos / stopPos)

      // Reverse page counts for horizontal rtl
      if (this.settings.direction === 'rtl' && !vertical) {
        const tempStartPage = currPage
        currPage = totalPages - endPage
        endPage = totalPages - tempStartPage
      }

      for (let i = currPage; i <= endPage; i++) {
        const pg = i + 1
        pages.push(pg)
      }

      const mapping = this.mapping!.page(view.contents, view.section.cfiBase, startPos, endPos)

      return {
        index,
        href,
        pages,
        totalPages,
        mapping
      }
    })

    return sections
  }

  paginatedLocation(): LocationSection[] {
    const visible = this.visible()
    const container = this.container!.getBoundingClientRect()

    let left = 0
    let used = 0

    if (this.settings.fullsize) {
      left = window.scrollX
    }

    const sections = visible.map((view) => {
      const { index, href } = view.section
      let offset: number
      const position = view.position()
      const width = view.width()

      // Find mapping
      let start: number
      let end: number
      let pageWidth: number

      if (this.settings.direction === 'rtl') {
        offset = container.right - left
        pageWidth = Math.min(Math.abs(offset - position.left), this.layout!.width) - used
        end = position.width - (position.right - offset) - used
        start = end - pageWidth
      } else {
        offset = container.left + left
        pageWidth = Math.min(position.right - offset, this.layout!.width) - used
        start = offset - position.left + used
        end = start + pageWidth
      }

      used += pageWidth

      const mapping = this.mapping!.page(view.contents, view.section.cfiBase, start, end)

      const totalPages = this.layout!.count(width).pages
      let startPage = Math.floor(start / this.layout!.pageWidth)
      const pages: number[] = []
      let endPage = Math.floor(end / this.layout!.pageWidth)

      // start page should not be negative
      if (startPage < 0) {
        startPage = 0
        endPage = endPage + 1
      }

      // Reverse page counts for rtl
      if (this.settings.direction === 'rtl') {
        const tempStartPage = startPage
        startPage = totalPages - endPage
        endPage = totalPages - tempStartPage
      }

      for (let i = startPage + 1; i <= endPage; i++) {
        const pg = i
        pages.push(pg)
      }

      return {
        index,
        href,
        pages,
        totalPages,
        mapping
      }
    })

    return sections
  }

  isVisible(
    view: View,
    offsetPrev: number,
    offsetNext: number,
    _container?: ContainerBounds
  ): boolean {
    const position = view.position()
    const container = _container || this.bounds()

    if (
      this.settings.axis === 'horizontal' &&
      position.right > container.left - offsetPrev &&
      position.left < container.right + offsetNext
    ) {
      return true
    } else if (
      this.settings.axis === 'vertical' &&
      position.bottom > container.top - offsetPrev &&
      position.top < container.bottom + offsetNext
    ) {
      return true
    }

    return false
  }

  visible(): View[] {
    const container = this.bounds()
    const views = this.views!.displayed()
    const viewsLength = views.length
    const visible: View[] = []
    let isVisible: boolean
    let view: View

    for (let i = 0; i < viewsLength; i++) {
      view = views[i]
      isVisible = this.isVisible(view, 0, 0, container)

      if (isVisible === true) {
        visible.push(view)
      }
    }
    return visible
  }

  scrollBy(x: number, y: number, silent?: boolean): void {
    const dir = this.settings.direction === 'rtl' ? -1 : 1

    if (silent) {
      this.ignore = true
    }

    if (!this.settings.fullsize) {
      if (x) this.container!.scrollLeft += x * dir
      if (y) this.container!.scrollTop += y
    } else {
      window.scrollBy(x * dir, y * dir)
    }
    this.scrolled = true
  }

  scrollTo(x: number, y: number, silent?: boolean): void {
    if (silent) {
      this.ignore = true
    }

    if (!this.settings.fullsize) {
      this.container!.scrollLeft = x
      this.container!.scrollTop = y
    } else {
      window.scrollTo(x, y)
    }
    this.scrolled = true
  }

  onScroll(): void {
    let scrollTop: number
    let scrollLeft: number

    if (!this.settings.fullsize) {
      scrollTop = this.container!.scrollTop
      scrollLeft = this.container!.scrollLeft
    } else {
      scrollTop = window.scrollY
      scrollLeft = window.scrollX
    }

    this.scrollTop = scrollTop
    this.scrollLeft = scrollLeft

    if (!this.ignore) {
      this.emit(EVENTS.MANAGERS.SCROLL, {
        top: scrollTop,
        left: scrollLeft
      })

      clearTimeout(this.afterScrolled)
      this.afterScrolled = window.setTimeout(
        function () {
          this.emit(EVENTS.MANAGERS.SCROLLED, {
            top: this.scrollTop,
            left: this.scrollLeft
          })
        }.bind(this),
        20
      )
    } else {
      this.ignore = false
    }
  }

  bounds(): ContainerBounds {
    const bounds = this.stage!.bounds()

    return bounds
  }

  applyLayout(layout: Layout): void {
    this.layout = layout
    this.updateLayout()
    if (this.views && this.views.length > 0 && this.layout.name === 'pre-paginated') {
      this.display(this.views.first()!.section)
    }
  }

  updateLayout(): void {
    if (!this.stage) {
      return
    }

    this._stageSize = this.stage.size()

    if (!this.isPaginated) {
      this.layout!.calculate(this._stageSize.width, this._stageSize.height)
    } else {
      this.layout!.calculate(this._stageSize.width, this._stageSize.height, this.settings.gap)

      // Set the look ahead offset for what is visible
      this.settings.offset = this.layout!.delta / this.layout!.divisor
    }

    // Set the dimensions for views
    this.viewSettings.width = this.layout!.width
    this.viewSettings.height = this.layout!.height

    this.setLayout(this.layout)
  }

  setLayout(layout: Layout): void {
    this.viewSettings.layout = layout

    this.mapping = new Mapping(layout.props, this.settings.direction, this.settings.axis)

    if (this.views) {
      this.views.forEach(function (view: View) {
        if (view) {
          view.setLayout(layout)
        }
      })
    }
  }

  updateWritingMode(mode: string): void {
    this.writingMode = mode
  }

  updateAxis(axis: string, forceUpdate?: boolean): void {
    if (!forceUpdate && axis === this.settings.axis) {
      return
    }

    this.settings.axis = axis as 'vertical' | 'horizontal'

    this.stage && this.stage.axis(axis)

    this.viewSettings.axis = axis as 'vertical' | 'horizontal'

    if (this.mapping) {
      this.mapping = new Mapping(this.layout!.props, this.settings.direction, this.settings.axis)
    }

    if (this.layout) {
      if (axis === 'vertical') {
        this.layout.spread('none')
      } else {
        this.layout.spread(this.layout.settings.spread)
      }
    }
  }

  updateFlow(flow: string, defaultScrolledOverflow = 'auto'): void {
    const isPaginated = flow === 'paginated' || flow === 'auto'

    this.isPaginated = isPaginated

    if (flow === 'scrolled-doc' || flow === 'scrolled-continuous' || flow === 'scrolled') {
      this.updateAxis('vertical')
    } else {
      this.updateAxis('horizontal')
    }

    this.viewSettings.flow = flow

    if (!this.settings.overflow) {
      this.overflow = isPaginated ? 'hidden' : defaultScrolledOverflow
    } else {
      this.overflow = this.settings.overflow
    }

    this.stage && this.stage.overflow(this.overflow)

    this.updateLayout()
  }

  getContents(): any[] {
    const contents: any[] = []
    if (!this.views) {
      return contents
    }
    this.views.forEach(function (view: View) {
      const viewContents = view && view.contents
      if (viewContents) {
        contents.push(viewContents)
      }
    })
    return contents
  }

  direction(dir = 'ltr'): void {
    this.settings.direction = dir

    this.stage && this.stage.direction(dir)

    this.viewSettings.direction = dir

    this.updateLayout()
  }

  isRendered(): boolean {
    return this.rendered
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

// Enable binding events to Manager
EventEmitter(DefaultViewManager.prototype)

export default DefaultViewManager
