import { extend, Deferred, requestAnimationFrame, prefixed } from '../../utils/core'
import { EVENTS, DOM_EVENTS } from '../../utils/constants'
import EventEmitter from 'event-emitter'

// easing equations from https://github.com/danro/easing-js/blob/master/easing.js
const PI_D2 = Math.PI / 2

interface EasingFunction {
  (pos: number): number
}

interface EasingEquations {
  easeOutSine: EasingFunction
  easeInOutSine: EasingFunction
  easeInOutQuint: EasingFunction
  easeInCubic: EasingFunction
}

const EASING_EQUATIONS: EasingEquations = {
  easeOutSine: function (pos: number): number {
    return Math.sin(pos * PI_D2)
  },
  easeInOutSine: function (pos: number): number {
    return -0.5 * (Math.cos(Math.PI * pos) - 1)
  },
  easeInOutQuint: function (pos: number): number {
    if ((pos /= 0.5) < 1) {
      return 0.5 * Math.pow(pos, 5)
    }
    return 0.5 * (Math.pow(pos - 2, 5) + 2)
  },
  easeInCubic: function (pos: number): number {
    return Math.pow(pos, 3)
  }
}

interface SnapSettings {
  duration: number
  minVelocity: number
  minDistance: number
  easing: EasingFunction
}

interface Manager {
  layout: any
  settings: any
  stage: {
    element: Element
    container: Element
  }
  isPaginated: boolean
  on: (event: string, handler: Function) => void
  off: (event: string, handler: Function) => void
}

class Snap {
  private settings: SnapSettings
  private supportsTouch: boolean
  private manager?: Manager
  private layout?: any
  private fullsize?: boolean
  private element?: Element
  private scroller?: Element | Window
  private isVertical?: boolean
  private touchCanceler?: boolean
  private resizeCanceler?: boolean
  private snapping?: boolean
  private scrollLeft?: number
  private scrollTop?: number
  private startTouchX?: number
  private startTouchY?: number
  private startTime?: number
  private endTouchX?: number
  private endTouchY?: number
  private endTime?: number

  // Event handlers
  private _onResize?: (e: Event) => void
  private _onScroll?: (e: Event) => void
  private _onTouchStart?: (e: TouchEvent) => void
  private _onTouchMove?: (e: TouchEvent) => void
  private _onTouchEnd?: (e: TouchEvent) => void
  private _afterDisplayed?: (view: any) => void

  constructor(manager: Manager, options?: Partial<SnapSettings>) {
    this.settings = extend(
      {
        duration: 80,
        minVelocity: 0.2,
        minDistance: 10,
        easing: EASING_EQUATIONS['easeInCubic']
      },
      options || {}
    )

    this.supportsTouch = this.supportsTouch()

    if (this.supportsTouch) {
      this.setup(manager)
    }
  }

  setup(manager: Manager): void {
    this.manager = manager

    this.layout = this.manager.layout

    this.fullsize = this.manager.settings.fullsize
    if (this.fullsize) {
      this.element = this.manager.stage.element
      this.scroller = window
      this.disableScroll()
    } else {
      this.element = this.manager.stage.container
      this.scroller = this.element
      ;(this.element as HTMLElement).style['WebkitOverflowScrolling'] = 'touch'
    }

    // set lookahead offset to page width
    this.manager.settings.offset = this.layout.width
    this.manager.settings.afterScrolledTimeout = this.settings.duration * 2

    this.isVertical = this.manager.settings.axis === 'vertical'

    // disable snapping if not paginated or axis in not horizontal
    if (!this.manager.isPaginated || this.isVertical) {
      return
    }

    this.touchCanceler = false
    this.resizeCanceler = false
    this.snapping = false

    this.scrollLeft = 0
    this.scrollTop = 0

    this.startTouchX = undefined
    this.startTouchY = undefined
    this.startTime = undefined
    this.endTouchX = undefined
    this.endTouchY = undefined
    this.endTime = undefined

    this.addListeners()
  }

  supportsTouch(): boolean {
    if ('ontouchstart' in window || (window.DocumentTouch && document instanceof DocumentTouch)) {
      return true
    }

    return false
  }

  disableScroll(): void {
    if (this.element) {
      ;(this.element as HTMLElement).style.overflow = 'hidden'
    }
  }

  enableScroll(): void {
    if (this.element) {
      ;(this.element as HTMLElement).style.overflow = ''
    }
  }

  addListeners(): void {
    this._onResize = this.onResize.bind(this)
    window.addEventListener('resize', this._onResize)

    this._onScroll = this.onScroll.bind(this)
    if (this.scroller) {
      this.scroller.addEventListener('scroll', this._onScroll)
    }

    this._onTouchStart = this.onTouchStart.bind(this)
    if (this.scroller) {
      this.scroller.addEventListener('touchstart', this._onTouchStart, {
        passive: true
      })
    }
    this.on('touchstart', this._onTouchStart)

    this._onTouchMove = this.onTouchMove.bind(this)
    if (this.scroller) {
      this.scroller.addEventListener('touchmove', this._onTouchMove, {
        passive: true
      })
    }
    this.on('touchmove', this._onTouchMove)

    this._onTouchEnd = this.onTouchEnd.bind(this)
    if (this.scroller) {
      this.scroller.addEventListener('touchend', this._onTouchEnd, {
        passive: true
      })
    }
    this.on('touchend', this._onTouchEnd)

    this._afterDisplayed = this.afterDisplayed.bind(this)
    this.manager!.on(EVENTS.MANAGERS.ADDED, this._afterDisplayed)
  }

  removeListeners(): void {
    if (this._onResize) {
      window.removeEventListener('resize', this._onResize)
      this._onResize = undefined
    }

    if (this._onScroll && this.scroller) {
      this.scroller.removeEventListener('scroll', this._onScroll)
      this._onScroll = undefined
    }

    if (this._onTouchStart && this.scroller) {
      this.scroller.removeEventListener('touchstart', this._onTouchStart, {
        passive: true
      })
      this.off('touchstart', this._onTouchStart)
      this._onTouchStart = undefined
    }

    if (this._onTouchMove && this.scroller) {
      this.scroller.removeEventListener('touchmove', this._onTouchMove, {
        passive: true
      })
      this.off('touchmove', this._onTouchMove)
      this._onTouchMove = undefined
    }

    if (this._onTouchEnd && this.scroller) {
      this.scroller.removeEventListener('touchend', this._onTouchEnd, {
        passive: true
      })
      this.off('touchend', this._onTouchEnd)
      this._onTouchEnd = undefined
    }

    if (this._afterDisplayed && this.manager) {
      this.manager.off(EVENTS.MANAGERS.ADDED, this._afterDisplayed)
      this._afterDisplayed = undefined
    }
  }

  afterDisplayed(view: any): void {
    const contents = view.contents
    ;['touchstart', 'touchmove', 'touchend'].forEach((e) => {
      contents.on(e, (ev: Event) => this.triggerViewEvent(ev, contents))
    })
  }

  triggerViewEvent(e: Event, contents: any): void {
    this.emit((e as TouchEvent).type, e, contents)
  }

  onScroll(e: Event): void {
    this.scrollLeft = this.fullsize ? window.scrollX : (this.scroller as Element).scrollLeft
    this.scrollTop = this.fullsize ? window.scrollY : (this.scroller as Element).scrollTop
  }

  onResize(e: Event): void {
    this.resizeCanceler = true
  }

  onTouchStart(e: TouchEvent): void {
    const { screenX, screenY } = e.touches[0]

    if (this.fullsize) {
      this.enableScroll()
    }

    this.touchCanceler = true

    if (!this.startTouchX) {
      this.startTouchX = screenX
      this.startTouchY = screenY
      this.startTime = this.now()
    }

    this.endTouchX = screenX
    this.endTouchY = screenY
    this.endTime = this.now()
  }

  onTouchMove(e: TouchEvent): void {
    const { screenX, screenY } = e.touches[0]
    const deltaY = Math.abs(screenY - (this.endTouchY || 0))

    this.touchCanceler = true

    if (!this.fullsize && deltaY < 10) {
      ;(this.element as HTMLElement).scrollLeft -= screenX - (this.endTouchX || 0)
    }

    this.endTouchX = screenX
    this.endTouchY = screenY
    this.endTime = this.now()
  }

  onTouchEnd(e: TouchEvent): void {
    if (this.fullsize) {
      this.disableScroll()
    }

    this.touchCanceler = false

    const swipped = this.wasSwiped()

    if (swipped !== 0) {
      this.snap(swipped)
    } else {
      this.snap()
    }

    this.startTouchX = undefined
    this.startTouchY = undefined
    this.startTime = undefined
    this.endTouchX = undefined
    this.endTouchY = undefined
    this.endTime = undefined
  }

  wasSwiped(): number {
    const snapWidth = this.layout.pageWidth * this.layout.divisor
    const distance = (this.endTouchX || 0) - (this.startTouchX || 0)
    const absolute = Math.abs(distance)
    const time = (this.endTime || 0) - (this.startTime || 0)
    const velocity = distance / time
    const minVelocity = this.settings.minVelocity

    if (absolute <= this.settings.minDistance || absolute >= snapWidth) {
      return 0
    }

    if (velocity > minVelocity) {
      // previous
      return -1
    } else if (velocity < -minVelocity) {
      // next
      return 1
    }

    return 0
  }

  needsSnap(): boolean {
    const left = this.scrollLeft || 0
    const snapWidth = this.layout.pageWidth * this.layout.divisor
    return left % snapWidth !== 0
  }

  snap(howMany: number = 0): Promise<any> {
    const left = this.scrollLeft || 0
    const snapWidth = this.layout.pageWidth * this.layout.divisor
    let snapTo = Math.round(left / snapWidth) * snapWidth

    if (howMany) {
      snapTo += howMany * snapWidth
    }

    return this.smoothScrollTo(snapTo)
  }

  smoothScrollTo(destination: number): Promise<any> {
    const deferred = new Deferred()
    const start = this.scrollLeft || 0
    const startTime = this.now()

    const duration = this.settings.duration
    const easing = this.settings.easing

    this.snapping = true

    // add animation loop
    const tick = () => {
      const now = this.now()
      const time = Math.min(1, (now - startTime) / duration)
      const timeFunction = easing(time)

      if (this.touchCanceler || this.resizeCanceler) {
        this.resizeCanceler = false
        this.snapping = false
        deferred.resolve!()
        return
      }

      if (time < 1) {
        window.requestAnimationFrame(tick)
        this.scrollTo(start + (destination - start) * time, 0)
      } else {
        this.scrollTo(destination, 0)
        this.snapping = false
        deferred.resolve!()
      }
    }

    tick()

    return deferred.promise
  }

  scrollTo(left: number = 0, top: number = 0): void {
    if (this.fullsize) {
      window.scroll(left, top)
    } else {
      ;(this.scroller as Element).scrollLeft = left
      ;(this.scroller as Element).scrollTop = top
    }
  }

  now(): number {
    return 'now' in window.performance ? performance.now() : new Date().getTime()
  }

  destroy(): void {
    if (!this.scroller) {
      return
    }

    if (this.fullsize) {
      this.enableScroll()
    }

    this.removeListeners()

    this.scroller = undefined
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

EventEmitter(Snap.prototype)

export default Snap
