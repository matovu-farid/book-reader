import { extend } from './utils/core'
import { EVENTS } from './utils/constants'
import EventEmitter from 'event-emitter'

interface LayoutSettings {
  layout?: string
  spread?: string
  minSpreadWidth?: number
  evenSpreads?: boolean
  flow?: string
  direction?: string
}

interface LayoutProps {
  name: string
  spread: boolean
  flow: string
  width: number
  height: number
  spreadWidth: number
  delta: number
  columnWidth: number
  gap: number
  divisor: number
}

interface Contents {
  fit(width: number, height: number, section?: any): void
  columns(width: number, height: number, columnWidth: number, gap: number, direction?: string): void
  size(width: number | null, height: number | null): void
}

interface Section {
  // Define section properties as needed
}

interface CountResult {
  spreads: number
  pages: number
}

/**
 * Figures out the CSS values to apply for a layout
 */
class Layout {
  settings: LayoutSettings
  name: string
  private _spread: boolean
  private _minSpreadWidth: number
  private _evenSpreads: boolean
  private _flow: string

  width: number
  height: number
  spreadWidth: number
  delta: number
  columnWidth: number
  gap: number
  divisor: number
  pageWidth: number

  props: LayoutProps

  constructor(settings: LayoutSettings) {
    this.settings = settings
    this.name = settings.layout || 'reflowable'
    this._spread = settings.spread === 'none' ? false : true
    this._minSpreadWidth = settings.minSpreadWidth || 800
    this._evenSpreads = settings.evenSpreads || false

    if (
      settings.flow === 'scrolled' ||
      settings.flow === 'scrolled-continuous' ||
      settings.flow === 'scrolled-doc'
    ) {
      this._flow = 'scrolled'
    } else {
      this._flow = 'paginated'
    }

    this.width = 0
    this.height = 0
    this.spreadWidth = 0
    this.delta = 0

    this.columnWidth = 0
    this.gap = 0
    this.divisor = 1

    this.props = {
      name: this.name,
      spread: this._spread,
      flow: this._flow,
      width: 0,
      height: 0,
      spreadWidth: 0,
      delta: 0,
      columnWidth: 0,
      gap: 0,
      divisor: 1
    }
  }

  /**
   * Switch the flow between paginated and scrolled
   */
  flow(flow?: string): string {
    if (typeof flow !== 'undefined') {
      if (flow === 'scrolled' || flow === 'scrolled-continuous' || flow === 'scrolled-doc') {
        this._flow = 'scrolled'
      } else {
        this._flow = 'paginated'
      }
      this.update({ flow: this._flow })
    }
    return this._flow
  }

  /**
   * Switch between using spreads or not, and set the
   * width at which they switch to single.
   */
  spread(spread?: string, min?: number): boolean {
    if (spread) {
      this._spread = spread === 'none' ? false : true
      this.update({ spread: this._spread })
    }

    if (min !== undefined && min >= 0) {
      this._minSpreadWidth = min
    }

    return this._spread
  }

  /**
   * Calculate the dimensions of the pagination
   */
  calculate(_width: number, _height: number, _gap?: number): void {
    let divisor = 1
    let gap = _gap || 0

    // Check the width and create even width columns
    const width = _width
    const height = _height

    const section = Math.floor(width / 12)

    let columnWidth: number
    let spreadWidth: number
    let pageWidth: number
    let delta: number

    if (this._spread && width >= this._minSpreadWidth) {
      divisor = 2
    } else {
      divisor = 1
    }

    if (
      this.name === 'reflowable' &&
      this._flow === 'paginated' &&
      !(_gap !== undefined && _gap >= 0)
    ) {
      gap = section % 2 === 0 ? section : section - 1
    }

    if (this.name === 'pre-paginated') {
      gap = 0
    }

    // Double Page
    if (divisor > 1) {
      columnWidth = width / divisor - gap
      pageWidth = columnWidth + gap
    } else {
      columnWidth = width
      pageWidth = width
    }

    if (this.name === 'pre-paginated' && divisor > 1) {
      // width = columnWidth; // This line was commented out in original
    }

    spreadWidth = columnWidth * divisor + gap

    delta = width

    this.width = width
    this.height = height
    this.spreadWidth = spreadWidth
    this.pageWidth = pageWidth
    this.delta = delta

    this.columnWidth = columnWidth
    this.gap = gap
    this.divisor = divisor

    this.update({
      width,
      height,
      spreadWidth,
      pageWidth,
      delta,
      columnWidth,
      gap,
      divisor
    })
  }

  /**
   * Apply Css to a Document
   */
  format(contents: Contents, section?: Section, axis?: string): any {
    let formating: any

    if (this.name === 'pre-paginated') {
      formating = contents.fit(this.columnWidth, this.height, section)
    } else if (this._flow === 'paginated') {
      formating = contents.columns(
        this.width,
        this.height,
        this.columnWidth,
        this.gap,
        this.settings.direction
      )
    } else if (axis && axis === 'horizontal') {
      formating = contents.size(0, this.height)
    } else {
      formating = contents.size(this.width, 0)
    }

    return formating // might be a promise in some View Managers
  }

  /**
   * Count number of pages
   */
  count(totalLength: number, pageLength?: number): CountResult {
    let spreads: number
    let pages: number

    if (this.name === 'pre-paginated') {
      spreads = 1
      pages = 1
    } else if (this._flow === 'paginated') {
      pageLength = pageLength || this.delta
      spreads = Math.ceil(totalLength / pageLength)
      pages = spreads * this.divisor
    } else {
      // scrolled
      pageLength = pageLength || this.height
      spreads = Math.ceil(totalLength / pageLength)
      pages = spreads
    }

    return {
      spreads,
      pages
    }
  }

  /**
   * Update props that have changed
   */
  update(props: Partial<LayoutProps>): void {
    // Remove props that haven't changed
    Object.keys(props).forEach((propName) => {
      const key = propName as keyof LayoutProps
      if (this.props[key] === props[key]) {
        delete props[key]
      }
    })

    if (Object.keys(props).length > 0) {
      const newProps = extend(this.props, props) as LayoutProps
      this.emit(EVENTS.LAYOUT.UPDATED, newProps, props)
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

EventEmitter(Layout.prototype)

export default Layout
