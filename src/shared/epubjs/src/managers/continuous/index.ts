import { extend, Deferred, requestAnimationFrame } from '../../utils/core'
import DefaultViewManager from '../default'
import Snap from '../helpers/snap'
import { EVENTS } from '../../utils/constants'
import debounce from 'lodash/debounce'

interface ContinuousViewManagerSettings {
  infinite: boolean
  overflow?: string
  axis?: 'vertical' | 'horizontal'
  writingMode?: string
  flow?: string
  offset: number
  offsetDelta: number
  width?: number
  height?: number
  snap: boolean | object
  afterScrolledTimeout: number
  allowScriptedContent: boolean
  allowPopups: boolean
  gap?: number
  ignoreClass: string
  direction?: string
  fullsize?: boolean
  rtlScrollType?: string
}

interface Section {
  index: number
  prev(): Section | undefined
  next(): Section | undefined
}

interface View {
  section: Section
  displayed: boolean
  expanded?: boolean
  show(): void
  hide(): void
  destroy(): void
  bounds(): DOMRect
  on(event: string, handler: Function): void
  onDisplayed: (view: View) => void
  onResize: (view: View, e: any) => void
  display(request: any): Promise<View>
}

interface Layout {
  props: {
    name: string
    spread?: boolean
    delta: number
  }
  height: number
}

class ContinuousViewManager extends DefaultViewManager {
  name: string
  settings: ContinuousViewManagerSettings
  viewSettings: any
  scrollTop: number
  scrollLeft: number

  // Snap functionality
  snapper?: Snap

  // Scroll tracking
  prevScrollTop: number = 0
  prevScrollLeft: number = 0
  scrollDeltaVert: number = 0
  scrollDeltaHorz: number = 0
  didScroll: boolean = false

  // Timeouts
  scrollTimeout?: number
  trimTimeout?: number
  afterScrolled?: number

  // Event handlers
  _onScroll?: (e: Event) => void
  _scrolled?: Function
  tick: typeof requestAnimationFrame

  constructor(options: {
    settings?: Partial<ContinuousViewManagerSettings>
    view: any
    request: any
    queue: any
  }) {
    super(options)

    this.name = 'continuous'

    this.settings = extend(
      {
        infinite: true,
        overflow: undefined,
        axis: undefined,
        writingMode: undefined,
        flow: 'scrolled',
        offset: 500,
        offsetDelta: 250,
        width: undefined,
        height: undefined,
        snap: false,
        afterScrolledTimeout: 10,
        allowScriptedContent: false,
        allowPopups: false
      },
      options.settings || {}
    )

    // Gap can be 0, but defaults doesn't handle that
    if (options.settings && options.settings.gap !== undefined && options.settings.gap === 0) {
      this.settings.gap = options.settings.gap
    }

    this.viewSettings = {
      ignoreClass: this.settings.ignoreClass,
      axis: this.settings.axis,
      flow: this.settings.flow,
      layout: this.layout,
      width: 0,
      height: 0,
      forceEvenPages: false,
      allowScriptedContent: this.settings.allowScriptedContent,
      allowPopups: this.settings.allowPopups
    }

    this.scrollTop = 0
    this.scrollLeft = 0
  }

  display(section: Section, target?: any): Promise<void> {
    return DefaultViewManager.prototype.display.call(this, section, target).then(
      function () {
        return this.fill()
      }.bind(this)
    )
  }

  fill(_full?: Deferred<void>): Promise<void> {
    const full = _full || new Deferred<void>()

    this.q
      .enqueue(() => {
        return this.check()
      })
      .then((result: boolean) => {
        if (result) {
          this.fill(full)
        } else {
          full.resolve!()
        }
      })

    return full.promise
  }

  moveTo(offset: { left: number; top: number }): void {
    let distX = 0
    let distY = 0

    let offsetX = 0
    let offsetY = 0

    if (!this.isPaginated) {
      distY = offset.top
      offsetY = offset.top + this.settings.offsetDelta
    } else {
      distX = Math.floor(offset.left / this.layout!.delta) * this.layout!.delta
      offsetX = distX + this.settings.offsetDelta
    }

    if (distX > 0 || distY > 0) {
      this.scrollBy(distX, distY, true)
    }
  }

  afterResized(view: View): void {
    this.emit(EVENTS.MANAGERS.RESIZE, view.section)
  }

  // Remove Previous Listeners if present
  removeShownListeners(view: View): void {
    view.onDisplayed = function () {}
  }

  add(section: Section): Promise<View> {
    const view = this.createView(section)

    this.views!.append(view)

    view.on(EVENTS.VIEWS.RESIZED, (bounds: any) => {
      view.expanded = true
    })

    view.on(EVENTS.VIEWS.AXIS, (axis: string) => {
      this.updateAxis(axis)
    })

    view.on(EVENTS.VIEWS.WRITING_MODE, (mode: string) => {
      this.updateWritingMode(mode)
    })

    view.onDisplayed = this.afterDisplayed.bind(this)
    view.onResize = this.afterResized.bind(this)

    return view.display(this.request)
  }

  append(section: Section): View {
    const view = this.createView(section)

    view.on(EVENTS.VIEWS.RESIZED, (bounds: any) => {
      view.expanded = true
    })

    view.on(EVENTS.VIEWS.AXIS, (axis: string) => {
      this.updateAxis(axis)
    })

    view.on(EVENTS.VIEWS.WRITING_MODE, (mode: string) => {
      this.updateWritingMode(mode)
    })

    this.views!.append(view)

    view.onDisplayed = this.afterDisplayed.bind(this)

    return view
  }

  prepend(section: Section): View {
    const view = this.createView(section)

    view.on(EVENTS.VIEWS.RESIZED, (bounds: any) => {
      this.counter(bounds)
      view.expanded = true
    })

    view.on(EVENTS.VIEWS.AXIS, (axis: string) => {
      this.updateAxis(axis)
    })

    view.on(EVENTS.VIEWS.WRITING_MODE, (mode: string) => {
      this.updateWritingMode(mode)
    })

    this.views!.prepend(view)

    view.onDisplayed = this.afterDisplayed.bind(this)

    return view
  }

  counter(bounds: any): void {
    if (this.settings.axis === 'vertical') {
      this.scrollBy(0, bounds.heightDelta, true)
    } else {
      this.scrollBy(bounds.widthDelta, 0, true)
    }
  }

  update(_offset?: number): Promise<void> {
    const container = this.bounds()
    const views = this.views!.all()
    const viewsLength = views.length
    const visible: View[] = []
    const offset = typeof _offset !== 'undefined' ? _offset : this.settings.offset || 0
    let isVisible: boolean
    let view: View

    const updating = new Deferred<void>()
    const promises: Promise<void>[] = []

    for (let i = 0; i < viewsLength; i++) {
      view = views[i]

      isVisible = this.isVisible(view, offset, offset, container)

      if (isVisible === true) {
        if (!view.displayed) {
          const displayed = view.display(this.request).then(
            function (view: View) {
              view.show()
            },
            (err: any) => {
              view.hide()
            }
          )
          promises.push(displayed)
        } else {
          view.show()
        }
        visible.push(view)
      } else {
        this.q.enqueue(view.destroy.bind(view))

        clearTimeout(this.trimTimeout)
        this.trimTimeout = window.setTimeout(
          function () {
            this.q.enqueue(this.trim.bind(this))
          }.bind(this),
          250
        )
      }
    }

    if (promises.length) {
      return Promise.all(promises).catch((err: any) => {
        updating.reject!(err)
      })
    } else {
      updating.resolve!()
      return updating.promise
    }
  }

  check(_offsetLeft?: number, _offsetTop?: number): Promise<boolean> {
    const checking = new Deferred<boolean>()
    const newViews: View[] = []

    const horizontal = this.settings.axis === 'horizontal'
    let delta = this.settings.offset || 0

    if (_offsetLeft && horizontal) {
      delta = _offsetLeft
    }

    if (_offsetTop && !horizontal) {
      delta = _offsetTop
    }

    const bounds = this._bounds // bounds saved this until resize

    let offset = horizontal ? this.scrollLeft : this.scrollTop
    const visibleLength = horizontal ? Math.floor(bounds!.width) : bounds!.height
    const contentLength = horizontal ? this.container!.scrollWidth : this.container!.scrollHeight
    const writingMode =
      this.writingMode && this.writingMode.indexOf('vertical') === 0 ? 'vertical' : 'horizontal'
    const rtlScrollType = this.settings.rtlScrollType
    const rtl = this.settings.direction === 'rtl'

    if (!this.settings.fullsize) {
      // Scroll offset starts at width of element
      if (rtl && rtlScrollType === 'default' && writingMode === 'horizontal') {
        offset = contentLength - visibleLength - offset
      }
      // Scroll offset starts at 0 and goes negative
      if (rtl && rtlScrollType === 'negative' && writingMode === 'horizontal') {
        offset = offset * -1
      }
    } else {
      // Scroll offset starts at 0 and goes negative
      if (
        (horizontal && rtl && rtlScrollType === 'negative') ||
        (!horizontal && rtl && rtlScrollType === 'default')
      ) {
        offset = offset * -1
      }
    }

    const prepend = () => {
      const first = this.views!.first()
      const prev = first && first.section.prev()

      if (prev) {
        newViews.push(this.prepend(prev))
      }
    }

    const append = () => {
      const last = this.views!.last()
      const next = last && last.section.next()

      if (next) {
        newViews.push(this.append(next))
      }
    }

    const end = offset + visibleLength + delta
    const start = offset - delta

    if (end >= contentLength) {
      append()
    }

    if (start < 0) {
      prepend()
    }

    const promises = newViews.map((view: View) => {
      return view.display(this.request)
    })

    if (newViews.length) {
      return Promise.all(promises)
        .then(() => {
          return this.check()
        })
        .then(() => {
          // Check to see if anything new is on screen after rendering
          return this.update(delta)
        })
        .then(
          () => true,
          (err: any) => {
            return err
          }
        )
    } else {
      this.q.enqueue(
        function () {
          this.update()
        }.bind(this)
      )
      checking.resolve!(false)
      return checking.promise
    }
  }

  trim(): Promise<void> {
    const task = new Deferred<void>()
    const displayed = this.views!.displayed()
    const first = displayed[0]
    const last = displayed[displayed.length - 1]
    const firstIndex = this.views!.indexOf(first)
    const lastIndex = this.views!.indexOf(last)
    const above = this.views!.slice(0, firstIndex)
    const below = this.views!.slice(lastIndex + 1)

    // Erase all but last above
    for (let i = 0; i < above.length - 1; i++) {
      this.erase(above[i], above)
    }

    // Erase all except first below
    for (let j = 1; j < below.length; j++) {
      this.erase(below[j])
    }

    task.resolve!()
    return task.promise
  }

  erase(view: View, above?: View[]): void {
    let prevTop: number
    let prevLeft: number

    if (!this.settings.fullsize) {
      prevTop = this.container!.scrollTop
      prevLeft = this.container!.scrollLeft
    } else {
      prevTop = window.scrollY
      prevLeft = window.scrollX
    }

    const bounds = view.bounds()

    this.views!.remove(view)

    if (above) {
      if (this.settings.axis === 'vertical') {
        this.scrollTo(0, prevTop - bounds.height, true)
      } else {
        if (this.settings.direction === 'rtl') {
          if (!this.settings.fullsize) {
            this.scrollTo(prevLeft, 0, true)
          } else {
            this.scrollTo(prevLeft + Math.floor(bounds.width), 0, true)
          }
        } else {
          this.scrollTo(prevLeft - Math.floor(bounds.width), 0, true)
        }
      }
    }
  }

  addEventListeners(stage?: any): void {
    window.addEventListener(
      'unload',
      function (e: Event) {
        this.ignore = true
        this.destroy()
      }.bind(this)
    )

    this.addScrollListeners()

    if (this.isPaginated && this.settings.snap) {
      this.snapper = new Snap(
        this,
        this.settings.snap && typeof this.settings.snap === 'object' && this.settings.snap
      )
    }
  }

  addScrollListeners(): void {
    let scroller: Window | HTMLElement

    this.tick = requestAnimationFrame

    const dir =
      this.settings.direction === 'rtl' && this.settings.rtlScrollType === 'default' ? -1 : 1

    this.scrollDeltaVert = 0
    this.scrollDeltaHorz = 0

    if (!this.settings.fullsize) {
      scroller = this.container!
      this.scrollTop = this.container!.scrollTop
      this.scrollLeft = this.container!.scrollLeft
    } else {
      scroller = window
      this.scrollTop = window.scrollY * dir
      this.scrollLeft = window.scrollX * dir
    }

    this._onScroll = this.onScroll.bind(this)
    scroller.addEventListener('scroll', this._onScroll)
    this._scrolled = debounce(this.scrolled.bind(this), 30)

    this.didScroll = false
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

  onScroll(): void {
    let scrollTop: number
    let scrollLeft: number
    const dir =
      this.settings.direction === 'rtl' && this.settings.rtlScrollType === 'default' ? -1 : 1

    if (!this.settings.fullsize) {
      scrollTop = this.container!.scrollTop
      scrollLeft = this.container!.scrollLeft
    } else {
      scrollTop = window.scrollY * dir
      scrollLeft = window.scrollX * dir
    }

    this.scrollTop = scrollTop
    this.scrollLeft = scrollLeft

    if (!this.ignore) {
      this._scrolled!()
    } else {
      this.ignore = false
    }

    this.scrollDeltaVert += Math.abs(scrollTop - this.prevScrollTop)
    this.scrollDeltaHorz += Math.abs(scrollLeft - this.prevScrollLeft)

    this.prevScrollTop = scrollTop
    this.prevScrollLeft = scrollLeft

    clearTimeout(this.scrollTimeout)
    this.scrollTimeout = window.setTimeout(
      function () {
        this.scrollDeltaVert = 0
        this.scrollDeltaHorz = 0
      }.bind(this),
      150
    )

    clearTimeout(this.afterScrolled)

    this.didScroll = false
  }

  scrolled(): void {
    this.q.enqueue(
      function () {
        return this.check()
      }.bind(this)
    )

    this.emit(EVENTS.MANAGERS.SCROLL, {
      top: this.scrollTop,
      left: this.scrollLeft
    })

    clearTimeout(this.afterScrolled)
    this.afterScrolled = window.setTimeout(
      function () {
        // Don't report scroll if we are about the snap
        if (this.snapper && this.snapper.supportsTouch && this.snapper.needsSnap()) {
          return
        }

        this.emit(EVENTS.MANAGERS.SCROLLED, {
          top: this.scrollTop,
          left: this.scrollLeft
        })
      }.bind(this),
      this.settings.afterScrolledTimeout
    )
  }

  next(): void {
    const delta =
      this.layout!.props.name === 'pre-paginated' && this.layout!.props.spread
        ? this.layout!.props.delta * 2
        : this.layout!.props.delta

    if (!this.views!.length) return

    if (this.isPaginated && this.settings.axis === 'horizontal') {
      this.scrollBy(delta, 0, true)
    } else {
      this.scrollBy(0, this.layout!.height, true)
    }

    this.q.enqueue(
      function () {
        return this.check()
      }.bind(this)
    )
  }

  prev(): void {
    const delta =
      this.layout!.props.name === 'pre-paginated' && this.layout!.props.spread
        ? this.layout!.props.delta * 2
        : this.layout!.props.delta

    if (!this.views!.length) return

    if (this.isPaginated && this.settings.axis === 'horizontal') {
      this.scrollBy(-delta, 0, true)
    } else {
      this.scrollBy(0, -this.layout!.height, true)
    }

    this.q.enqueue(
      function () {
        return this.check()
      }.bind(this)
    )
  }

  updateFlow(flow: string): void {
    if (this.rendered && this.snapper) {
      this.snapper.destroy()
      this.snapper = undefined
    }

    super.updateFlow(flow, 'scroll')

    if (this.rendered && this.isPaginated && this.settings.snap) {
      this.snapper = new Snap(
        this,
        this.settings.snap && typeof this.settings.snap === 'object' && this.settings.snap
      )
    }
  }

  destroy(): void {
    super.destroy()

    if (this.snapper) {
      this.snapper.destroy()
    }
  }
}

export default ContinuousViewManager
