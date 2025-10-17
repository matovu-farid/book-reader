import EventEmitter from 'event-emitter'
import { extend, Deferred, isFloat } from './utils/core'
import Hook, { type HookCallback } from './utils/hook'
import EpubCFI from './epubcfi'
import Queue from './utils/queue'
import Layout from './layout'
import Themes from './themes'
import Contents from './contents'
import Annotations, { type HighlightData } from './annotations'
import { EVENTS, DOM_EVENTS } from './utils/constants'

// Default Views
import IframeView from './managers/views/iframe'

// Default View Managers
import DefaultViewManager from './managers/default/index'
import ContinuousViewManager from './managers/continuous/index'
import Section from './section'

// Types
export interface RenditionSettings {
  width?: number | null
  height?: number | null
  ignoreClass?: string
  manager?: string | ((...args: unknown[]) => unknown) | object
  view?: string | ((...args: unknown[]) => unknown)
  flow?: string | null
  layout?: string | null
  spread?: string | null
  minSpreadWidth?: number
  stylesheet?: string | null
  resizeOnOrientationChange?: boolean
  script?: string | null
  snap?: boolean | object
  defaultDirection?: string
  allowScriptedContent?: boolean
  allowPopups?: boolean
  axis?: string
  direction?: string
  globalLayoutProperties?: Record<string, unknown>
  orientation?: string
  [key: string]: unknown
}

// Specific callback types for rendition hooks
type ContentHookCallback = (contents: Contents, rendition?: Rendition) => unknown | Promise<unknown>
type RenderHookCallback = (view: View, rendition: Rendition) => unknown | Promise<unknown>
type UnloadedHookCallback = (view: View, rendition: Rendition) => unknown | Promise<unknown>
type DisplayHookCallback = (view: View, rendition: Rendition) => unknown | Promise<unknown>
type LayoutHookCallback = (layout: Layout, rendition: Rendition) => unknown | Promise<unknown>
type ShowHookCallback = (view: View, rendition: Rendition) => unknown | Promise<unknown>
type SerializeHookCallback = (output: string, section: unknown) => unknown | Promise<unknown>

interface RenditionHooks {
  display: Hook<Rendition, DisplayHookCallback>
  serialize: Hook<Rendition, SerializeHookCallback>
  content: Hook<Rendition, ContentHookCallback>
  unloaded: Hook<Rendition, UnloadedHookCallback>
  layout: Hook<Rendition, LayoutHookCallback>
  render: Hook<Rendition, RenderHookCallback>
  show: Hook<Rendition, ShowHookCallback>
}

export interface DisplayedLocation {
  start: {
    index: number
    href: string
    cfi: string
    displayed: {
      page: number
      total: number
    }
    location?: number
    percentage?: number
    page?: number
  }
  end: {
    index: number
    href: string
    cfi: string
    displayed: {
      page: number
      total: number
    }
    location?: number
    percentage?: number
    page?: number
  }
  atStart?: boolean
  atEnd?: boolean
}

interface Book {
  package: {
    metadata: {
      layout?: string
      spread?: string
      direction?: string
      orientation?: string
      flow?: string
      viewport?: string
      minSpreadWidth?: number
    }
  }
  displayOptions: {
    fixedLayout?: string
  }
  spine: {
    hooks: {
      content: Hook
    }
    get(target: string): unknown
    last(): unknown
    first(): unknown
    each(callback: (item: Section) => void): void
  }
  path: {
    relative(href: string): string
  }
  load: (...args: unknown[]) => unknown
  locations: {
    length(): number
    cfiFromPercentage(percentage: number): string
    locationFromCfi(cfi: string): number | null
    percentageFromLocation(location: number): number
  }
  pageList: {
    pageFromCfi(cfi: string): number
  }
  packaging: {
    metadata: {
      identifier?: string
    }
  }
  opened: Promise<unknown>
}

interface ViewManager {
  render(element: HTMLElement, options: { width?: number; height?: number }): void
  display(section: unknown, target: string): Promise<unknown>
  moveTo(offset: unknown): void
  resize(width?: number, height?: number, epubcfi?: string): void
  clear(): void
  next(): Promise<unknown>
  prev(): Promise<unknown>
  currentLocation(): unknown[] | Promise<unknown[]>
  visible(): unknown[]
  applyLayout(layout: Layout): void
  updateFlow(flow: string): void
  updateLayout(): void
  isRendered(): boolean
  direction(dir: string): void
  destroy(): void
  layout?: Layout
  mapping?: Record<string, unknown>
  settings?: Record<string, unknown>
  views?: {
    find(options: { index: number }): unknown
    getContents(): Contents[]
  }
  on(event: string, handler: (...args: unknown[]) => void): void
}

interface View {
  index: number
  section: unknown
  contents?: Contents
  on(event: string, handler: (...args: unknown[]) => void): void
}

interface ViewManagerClass {
  new (options: {
    view: unknown
    queue: Queue
    request: (...args: unknown[]) => unknown
    settings: RenditionSettings
  }): ViewManager
}

interface ViewClass {
  new (...args: unknown[]): View
}

interface Paragraph {
  text: string
  startCfi: string
  endCfi: string
  cfiRange: string
}

interface ViewText {
  text: string
  startCfi: string
  endCfi: string
}

interface RenditionEventMap {
  locationChanged: (location: DisplayedLocation) => void
  relocated: (location: DisplayedLocation) => void
  selected: (cfiRange: string, contents: Contents) => void
  markClicked: (cfiRange: string, data: unknown, contents: Contents) => void
  rendered: (section: unknown, view: View) => void
  removed: (section: unknown, view: View) => void
  resized: (size: { width: number; height: number }, epubcfi?: string) => void
  orientationchange: (orientation: string) => void
  layout: (props: unknown, changed: unknown) => void
  started: () => void
  attached: () => void
  displayed: (section: unknown) => void
  displayError: (error: unknown) => void
  // DOM events
  keydown: (event: KeyboardEvent, contents: Contents) => void
  keyup: (event: KeyboardEvent, contents: Contents) => void
  click: (event: MouseEvent, contents: Contents) => void
  mousedown: (event: MouseEvent, contents: Contents) => void
  mouseup: (event: MouseEvent, contents: Contents) => void
  touchstart: (event: TouchEvent, contents: Contents) => void
  touchend: (event: TouchEvent, contents: Contents) => void
}

/**
 * Displays an Epub as a series of Views for each Section.
 * Requires Manager and View class to handle specifics of rendering
 * the section content.
 */
class Rendition {
  settings!: RenditionSettings
  manager?: ViewManager
  book: Book
  hooks: RenditionHooks
  themes: Themes
  annotations: Annotations
  epubcfi: EpubCFI
  q: Queue
  location?: DisplayedLocation
  starting: Deferred<unknown>
  started: Promise<unknown>
  displaying?: Deferred<unknown>
  private _layout?: Layout
  private ViewManager?: ViewManagerClass
  private View?: ViewClass

  constructor(book: Book, options?: Partial<RenditionSettings>) {
    this.settings = extend(this.settings || {}, {
      width: null,
      height: null,
      ignoreClass: '',
      manager: 'default',
      view: 'iframe',
      flow: null,
      layout: null,
      spread: null,
      minSpreadWidth: 800,
      stylesheet: null,
      resizeOnOrientationChange: true,
      script: null,
      snap: false,
      defaultDirection: 'ltr',
      allowScriptedContent: false,
      allowPopups: false
    })

    if (options) {
      extend(this.settings, options)
    }

    if (typeof this.settings.manager === 'object') {
      this.manager = this.settings.manager as ViewManager
    }

    this.book = book

    this.hooks = {} as RenditionHooks
    this.hooks.display = new Hook(this)
    this.hooks.serialize = new Hook(this)
    this.hooks.content = new Hook(this)
    this.hooks.unloaded = new Hook(this)
    this.hooks.layout = new Hook(this)
    this.hooks.render = new Hook(this)
    this.hooks.show = new Hook(this)

    this.hooks.content.register(this.handleLinks.bind(this) as HookCallback)
    this.hooks.content.register(this.passEvents.bind(this) as HookCallback)
    this.hooks.content.register(this.adjustImages.bind(this) as HookCallback)

    this.book.spine.hooks.content.register(this.injectIdentifier.bind(this) as HookCallback)

    if (this.settings.stylesheet) {
      this.book.spine.hooks.content.register(this.injectStylesheet.bind(this) as HookCallback)
    }

    if (this.settings.script) {
      this.book.spine.hooks.content.register(this.injectScript.bind(this) as HookCallback)
    }

    this.themes = new Themes(this)
    this.annotations = new Annotations()
    this.epubcfi = new EpubCFI()
    this.q = new Queue(this)

    this.location = undefined

    // Hold queue until book is opened
    this.q.enqueue(this.book.opened)

    this.starting = new Deferred<unknown>()
    this.started = this.starting.promise

    // Block the queue until rendering is started
    this.q.enqueue(this.start)
  }

  /**
   * Set the manager function
   */
  setManager(manager: ViewManager): void {
    this.manager = manager
  }

  /**
   * Require the manager from passed string, or as a class function
   */
  requireManager(manager: string | ((...args: unknown[]) => unknown) | object): ViewManagerClass {
    let viewManager: ViewManagerClass

    // If manager is a string, try to load from imported managers
    if (typeof manager === 'string' && manager === 'default') {
      viewManager = DefaultViewManager as unknown as ViewManagerClass
    } else if (typeof manager === 'string' && manager === 'continuous') {
      viewManager = ContinuousViewManager as unknown as ViewManagerClass
    } else {
      // otherwise, assume we were passed a class function
      viewManager = manager as ViewManagerClass
    }

    return viewManager
  }

  /**
   * Require the view from passed string, or as a class function
   */
  requireView(view: string | ((...args: unknown[]) => unknown)): ViewClass {
    let View: ViewClass

    // If view is a string, try to load from imported views,
    if (typeof view === 'string' && view === 'iframe') {
      View = IframeView as unknown as ViewClass
    } else {
      // otherwise, assume we were passed a class function
      View = view as unknown as ViewClass
    }

    return View
  }

  /**
   * Start the rendering
   */
  start(): Promise<void> {
    if (
      !this.settings.layout &&
      (this.book.package.metadata.layout === 'pre-paginated' ||
        this.book.displayOptions.fixedLayout === 'true')
    ) {
      this.settings.layout = 'pre-paginated'
    }
    switch (this.book.package.metadata.spread) {
      case 'none':
        this.settings.spread = 'none'
        break
      case 'both':
        this.settings.spread = 'true'
        break
    }

    if (!this.manager) {
      this.ViewManager = this.requireManager(this.settings.manager!)
      this.View = this.requireView(this.settings.view!)

      this.manager = new this.ViewManager({
        view: this.View,
        queue: this.q,
        request: this.book.load.bind(this.book),
        settings: this.settings
      })
    }

    this.direction(this.book.package.metadata.direction || this.settings.defaultDirection!)

    // Parse metadata to get layout props
    this.settings.globalLayoutProperties = this.determineLayoutProperties(
      this.book.package.metadata
    )

    this.flow(this.settings.globalLayoutProperties.flow as string)

    this.layout(this.settings.globalLayoutProperties)
    console.log({ manager: this.manager })

    // Listen for displayed views
    this.manager!.on(
      EVENTS.MANAGERS.ADDED,
      this.afterDisplayed.bind(this) as (...args: unknown[]) => void
    )
    this.manager!.on(
      EVENTS.MANAGERS.REMOVED,
      this.afterRemoved.bind(this) as (...args: unknown[]) => void
    )

    // Listen for resizing
    this.manager!.on(
      EVENTS.MANAGERS.RESIZED,
      this.onResized.bind(this) as (...args: unknown[]) => void
    )

    // Listen for rotation
    this.manager!.on(
      EVENTS.MANAGERS.ORIENTATION_CHANGE,
      this.onOrientationChange.bind(this) as (...args: unknown[]) => void
    )

    // Listen for scroll changes
    this.manager?.on(EVENTS.MANAGERS.SCROLLED, this.reportLocation.bind(this))

    this.emit(EVENTS.RENDITION.STARTED)

    // Start processing queue
    if (this.starting && this.starting.resolve) {
      this.starting.resolve(undefined)
    }
    return Promise.resolve()
  }

  /**
   * Call to attach the container to an element in the dom
   * Container must be attached before rendering can begin
   */
  attachTo(element: HTMLElement): Promise<void> {
    return this.q.enqueue(() => {
      // Start rendering
      this.manager!.render(element, {
        width: this.settings.width || undefined,
        height: this.settings.height || undefined
      })

      this.emit(EVENTS.RENDITION.ATTACHED)
    }) as Promise<void>
  }

  /**
   * Display a point in the book
   * The request will be added to the rendering Queue,
   * so it will wait until book is opened, rendering started
   * and all other rendering tasks have finished to be called.
   */
  display(target: string): Promise<unknown> {
    if (this.displaying && this.displaying.resolve) {
      this.displaying.resolve(undefined)
    }
    return this.q.enqueue((this._display as (...args: unknown[]) => unknown).bind(this), target)
  }

  /**
   * Tells the manager what to display immediately
   */
  private _display(target: string): Promise<unknown> {
    if (!this.book) {
      return Promise.resolve()
    }
    // const isCfiString = this.epubcfi.isCfiString(target)
    const displaying = new Deferred<unknown>()
    const displayed = displaying.promise
    const section: unknown = this.book.spine.get(target)
    // let moveTo: any

    this.displaying = displaying

    // Check if this is a book percentage
    if (this.book.locations.length() && isFloat(target)) {
      target = this.book.locations.cfiFromPercentage(parseFloat(target))
    }

    if (!section) {
      if (displaying.reject) {
        displaying.reject(new Error('No Section Found'))
      }
      return displayed
    }

    this.manager?.display(section, target).then(
      () => {
        if (displaying.resolve) {
          displaying.resolve(section)
        }
        this.displaying = undefined

        this.emit(EVENTS.RENDITION.DISPLAYED, section)
        this.reportLocation()
      },
      (err: unknown) => {
        this.emit(EVENTS.RENDITION.DISPLAY_ERROR, err)
      }
    )

    return displayed
  }

  /**
   * Report what section has been displayed
   */
  afterDisplayed(view: View): void {
    view.on(EVENTS.VIEWS.MARK_CLICKED, ((cfiRange: string, data: unknown) =>
      this.triggerMarkEvent(cfiRange, data, view.contents!)) as (...args: unknown[]) => void)

    this.hooks.render.trigger(view, this).then(() => {
      if (view.contents) {
        this.hooks.content.trigger(view.contents, this).then(() => {
          // Re-render any highlights that belong to this view
          this._rerenderHighlightsForView(view)
          this.emit(EVENTS.RENDITION.RENDERED, view.section, view)
        })
      } else {
        this.emit(EVENTS.RENDITION.RENDERED, view.section, view)
      }
    })
  }

  /**
   * Re-render all highlights for a specific view
   */
  private _rerenderHighlightsForView(view: View): void {
    if (!view.contents) return

    const allAnnotations = this.annotations.getAll()
    const highlights = allAnnotations.filter((a) => a.type === 'highlight')

    for (const highlight of highlights) {
      try {
        const rangeCfi = new EpubCFI(highlight.cfi)

        // Check if this highlight belongs to this view
        if (rangeCfi.spinePos === view.index) {
          const domRange = rangeCfi.toRange(view.contents.document, this.settings.ignoreClass)
          if (domRange) {
            // Get color from annotation or use default yellow
            const color = highlight.color || 'yellow'

            // Convert color to styles
            const styles = {
              fill: color,
              'fill-opacity': '0.3',
              'mix-blend-mode': 'multiply'
            }

            this._createHighlightElement(
              domRange,
              highlight.cfi,
              'epubjs-hl',
              styles,
              view.contents
            )
          }
        }
      } catch (e) {
        console.error('Error re-rendering highlight:', e)
      }
    }
  }

  /**
   * Report what has been removed
   */
  afterRemoved(view: View): void {
    this.hooks.unloaded.trigger(view, this).then(() => {
      this.emit(EVENTS.RENDITION.REMOVED, view.section, view)
    })
  }

  /**
   * Report resize events and display the last seen location
   */
  onResized(size: { width: number; height: number }, epubcfi?: string): void {
    this.emit(
      EVENTS.RENDITION.RESIZED,
      {
        width: size.width,
        height: size.height
      },
      epubcfi
    )

    if (this.location && this.location.start) {
      this.display(epubcfi || this.location.start.cfi)
    }
  }

  /**
   * Report orientation events and display the last seen location
   */
  onOrientationChange(orientation: string): void {
    this.emit(EVENTS.RENDITION.ORIENTATION_CHANGE, orientation)
  }

  /**
   * Move the Rendition to a specific offset
   * Usually you would be better off calling display()
   */
  moveTo(offset: unknown): void {
    this.manager?.moveTo(offset)
  }

  /**
   * Trigger a resize of the views
   */
  resize(width?: number, height?: number, epubcfi?: string): void {
    if (width) {
      this.settings.width = width
    }
    if (height) {
      this.settings.height = height
    }
    this.manager?.resize(width, height, epubcfi)
  }

  /**
   * Clear all rendered views
   */
  clear(): void {
    this.manager?.clear()
  }

  /**
   * Go to the next "page" in the rendition
   */
  next(): Promise<unknown> {
    return this.q
      .enqueue(this.manager!.next.bind(this.manager!))
      .then(this.reportLocation.bind(this))
  }

  /**
   * Go to the previous "page" in the rendition
   */
  prev(): Promise<unknown> {
    return this.q
      .enqueue(this.manager!.prev.bind(this.manager!))
      .then(this.reportLocation.bind(this))
  }

  /**
   * Determine the Layout properties from metadata and settings
   */
  private determineLayoutProperties(metadata: Record<string, unknown>): Record<string, unknown> {
    const layout = this.settings.layout || metadata.layout || 'reflowable'
    const spread = this.settings.spread || metadata.spread || 'auto'
    const orientation = this.settings.orientation || metadata.orientation || 'auto'
    const flow = this.settings.flow || metadata.flow || 'auto'
    const viewport = metadata.viewport || ''
    const minSpreadWidth = this.settings.minSpreadWidth || metadata.minSpreadWidth || 800
    const direction = this.settings.direction || metadata.direction || 'ltr'

    const properties = {
      layout: layout,
      spread: spread,
      orientation: orientation,
      flow: flow,
      viewport: viewport,
      minSpreadWidth: minSpreadWidth,
      direction: direction
    }

    return properties
  }

  /**
   * Adjust the flow of the rendition to paginated or scrolled
   */
  flow(flow?: string): void {
    let _flow = flow
    if (flow === 'scrolled' || flow === 'scrolled-doc' || flow === 'scrolled-continuous') {
      _flow = 'scrolled'
    }

    if (flow === 'auto' || flow === 'paginated') {
      _flow = 'paginated'
    }

    this.settings.flow = flow

    if (this._layout) {
      this._layout.flow(_flow!)
    }

    if (this.manager && this._layout) {
      this.manager.applyLayout(this._layout)
    }

    if (this.manager) {
      this.manager.updateFlow(_flow!)
    }

    if (this.manager && this.manager.isRendered() && this.location) {
      this.manager.clear()
      this.display(this.location.start.cfi)
    }
  }

  /**
   * Adjust the layout of the rendition to reflowable or pre-paginated
   */
  layout(settings?: Record<string, unknown>): Layout | undefined {
    if (settings) {
      this._layout = new Layout(settings)
      this._layout.spread(settings.spread as string, this.settings.minSpreadWidth)

      this._layout.on(EVENTS.LAYOUT.UPDATED, (props: unknown, changed: unknown) => {
        this.emit(EVENTS.RENDITION.LAYOUT, props, changed)
      })
    }

    if (this.manager && this._layout) {
      this.manager.applyLayout(this._layout)
    }

    return this._layout
  }

  /**
   * Adjust if the rendition uses spreads
   */
  spread(spread?: string, min?: number): void {
    this.settings.spread = spread

    if (min) {
      this.settings.minSpreadWidth = min
    }

    if (this._layout) {
      this._layout.spread(spread, min)
    }

    if (this.manager && this.manager.isRendered()) {
      this.manager.updateLayout()
    }
  }

  /**
   * Adjust the direction of the rendition
   */
  direction(dir?: string): void {
    this.settings.direction = dir || 'ltr'

    if (this.manager) {
      this.manager.direction(this.settings.direction)
    }

    if (this.manager && this.manager.isRendered() && this.location) {
      this.manager.clear()
      this.display(this.location.start.cfi)
    }
  }

  /**
   * Report the current location
   */
  reportLocation(): Promise<void> {
    return this.q.enqueue(() => {
      requestAnimationFrame(() => {
        const location = this.manager!.currentLocation()
        if (location && Array.isArray(location) && location.length > 0) {
          // Handle array result
          const located = this.located(location)

          if (located && 'start' in located && 'end' in located) {
            this.location = located as DisplayedLocation

            this.emit(EVENTS.RENDITION.LOCATION_CHANGED, {
              index: this.location.start.index,
              href: this.location.start.href,
              start: this.location.start.cfi,
              end: this.location.end.cfi,
              percentage: this.location.start.percentage
            })

            this.emit(EVENTS.RENDITION.RELOCATED, this.location)
          }
        } else if (
          location &&
          typeof location === 'object' &&
          'then' in location &&
          typeof (location as Promise<unknown[]>).then === 'function'
        ) {
          // Handle Promise result
          ;(location as Promise<unknown[]>).then((result: unknown[]) => {
            const located = this.located(result)

            if (located && 'start' in located && 'end' in located) {
              this.location = located as DisplayedLocation

              this.emit(EVENTS.RENDITION.LOCATION_CHANGED, {
                index: this.location.start.index,
                href: this.location.start.href,
                start: this.location.start.cfi,
                end: this.location.end.cfi,
                percentage: this.location.start.percentage
              })

              this.emit(EVENTS.RENDITION.RELOCATED, this.location)
            }
          })
        }
      })
    }) as Promise<void>
  }

  /**
   * Get the Current Location object
   */
  currentLocation(): DisplayedLocation | Promise<DisplayedLocation | undefined> | undefined {
    const location = this.manager!.currentLocation()
    if (location && Array.isArray(location) && location.length > 0) {
      // Handle array result
      const located = this.located(location)
      return located && 'start' in located && 'end' in located
        ? (located as DisplayedLocation)
        : undefined
    } else if (
      location &&
      typeof location === 'object' &&
      'then' in location &&
      typeof (location as Promise<unknown[]>).then === 'function'
    ) {
      // Handle Promise result
      return (location as Promise<unknown[]>).then((result: unknown[]) => {
        const located = this.located(result)
        return located && 'start' in located && 'end' in located
          ? (located as DisplayedLocation)
          : undefined
      })
    }
    return undefined
  }

  /**
   * Creates a Rendition#locationRange from location
   * passed by the Manager
   */
  private located(location: unknown[]): DisplayedLocation | Record<string, never> {
    if (!location.length) {
      return {}
    }
    const start = location[0] as Record<string, unknown>
    const end = location[location.length - 1] as Record<string, unknown>

    const located: DisplayedLocation = {
      start: {
        index: start.index as number,
        href: start.href as string,
        cfi: (start.mapping as Record<string, unknown>).start as string,
        displayed: {
          page: (start.pages as number[])[0] || 1,
          total: start.totalPages as number
        }
      },
      end: {
        index: end.index as number,
        href: end.href as string,
        cfi: (end.mapping as Record<string, unknown>).end as string,
        displayed: {
          page: (end.pages as number[])[(end.pages as number[]).length - 1] || 1,
          total: end.totalPages as number
        }
      }
    }

    const locationStart = this.book.locations.locationFromCfi(
      (start.mapping as Record<string, unknown>).start as string
    )
    const locationEnd = this.book.locations.locationFromCfi(
      (end.mapping as Record<string, unknown>).end as string
    )

    if (locationStart != null) {
      located.start.location = locationStart
      located.start.percentage = this.book.locations.percentageFromLocation(locationStart)
    }
    if (locationEnd != null) {
      located.end.location = locationEnd
      located.end.percentage = this.book.locations.percentageFromLocation(locationEnd)
    }

    const pageStart = this.book.pageList.pageFromCfi(
      (start.mapping as Record<string, unknown>).start as string
    )
    const pageEnd = this.book.pageList.pageFromCfi(
      (end.mapping as Record<string, unknown>).end as string
    )

    if (pageStart != -1) {
      located.start.page = pageStart
    }
    if (pageEnd != -1) {
      located.end.page = pageEnd
    }

    if (
      end.index === ((this.book.spine.last() as Record<string, unknown>).index as number) &&
      located.end.displayed.page >= located.end.displayed.total
    ) {
      located.atEnd = true
    }

    if (
      start.index === ((this.book.spine.first() as Record<string, unknown>).index as number) &&
      located.start.displayed.page === 1
    ) {
      located.atStart = true
    }

    return located
  }

  /**
   * Remove and Clean Up the Rendition
   */
  destroy(): void {
    this.manager && this.manager.destroy()
    this.book = undefined as unknown as Book
  }

  /**
   * Pass the events from a view's Contents
   */
  private passEvents(contents: Contents): void {
    DOM_EVENTS.forEach((e) => {
      contents.on(e, (...args: unknown[]) => this.triggerViewEvent(args[0] as Event, contents))
    })

    contents.on(EVENTS.CONTENTS.SELECTED, (...args: unknown[]) =>
      this.triggerSelectedEvent(args[0] as string, contents)
    )
  }

  /**
   * Emit events passed by a view
   */
  private triggerViewEvent(e: Event, contents: Contents): void {
    this.emit((e as Event & { type: string }).type, e, contents)
  }

  /**
   * Emit a selection event's CFI Range passed from a a view
   */
  private triggerSelectedEvent(cfirange: string, contents: Contents): void {
    this.emit(EVENTS.RENDITION.SELECTED, cfirange, contents)
  }

  /**
   * Emit a markClicked event with the cfiRange and data from a mark
   */
  private triggerMarkEvent(cfiRange: string, data: unknown, contents: Contents): void {
    this.emit(EVENTS.RENDITION.MARK_CLICKED, cfiRange, data, contents)
  }

  /**
   * Get a Range from a Visible CFI
   */
  getRange(cfi: string, ignoreClass?: string): Range | null | undefined {
    const _cfi = new EpubCFI(cfi)
    const found = this.manager!.visible().filter((view: unknown) => {
      const v = view as Record<string, unknown>
      return _cfi.spinePos === (v.index as number)
    })

    // Should only every return 1 item
    if (found.length) {
      return ((found[0] as Record<string, unknown>).contents as Contents).range(
        _cfi.toString(),
        ignoreClass
      )
    }
    return undefined
  }

  /**
   * Highlight a CFI range with default styles
   */
  highlightRange(
    cfiRange: string,
    data: Partial<HighlightData> = {},
    cb?: (...args: unknown[]) => void,
    className: string = 'epubjs-hl',
    styles: Record<string, unknown> = {}
  ): Promise<unknown> {
    console.log('highlightRange called with CFI:', cfiRange)

    if (!this.manager) {
      console.error('highlightRange: No manager available')
      return Promise.reject(new Error('Rendition manager not available'))
    }

    try {
      // Parse the CFI range to validate it
      const rangeCfi = new EpubCFI(cfiRange)
      console.log('highlightRange: Parsed CFI, range?', rangeCfi.range)

      // Check if this is a range CFI (should have start and end)
      if (!rangeCfi.range) {
        console.error('highlightRange: CFI is not a range')
        return Promise.reject(new Error('CFI string is not a range: ' + cfiRange))
      }

      // Apply default yellow highlight styles if no custom styles provided
      const defaultStyles = {
        fill: 'yellow',
        'fill-opacity': '0.3',
        'mix-blend-mode': 'multiply'
      }

      const mergedStyles = { ...defaultStyles, ...styles }
      console.log('highlightRange: Merged styles:', mergedStyles)

      // Store the annotation first
      const annotation = this.annotations.highlight(
        rangeCfi.toString(),
        {
          data: data as HighlightData,
          className,
          styles: mergedStyles
        },
        cb || (() => {})
      )
      console.log('highlightRange: Annotation created:', annotation)

      // Now render the highlight visually on any visible views
      console.log('highlightRange: Rendering on visible views...')
      this._renderHighlightOnVisibleViews(rangeCfi, className, mergedStyles)

      return Promise.resolve(annotation)
    } catch (error: unknown) {
      console.error('highlightRange: Error:', error)
      return Promise.reject(new Error('Error highlighting range: ' + (error as Error).message))
    }
  }

  /**
   * Render a highlight on all visible views that contain the CFI
   */
  private _renderHighlightOnVisibleViews(
    rangeCfi: EpubCFI,
    className: string,
    styles: Record<string, unknown>
  ): void {
    if (!this.manager) {
      console.warn('_renderHighlightOnVisibleViews: No manager')
      return
    }

    const visibleViews = this.manager.visible()
    console.log('_renderHighlightOnVisibleViews: Found', visibleViews.length, 'visible views')
    console.log('_renderHighlightOnVisibleViews: CFI spinePos =', rangeCfi.spinePos)

    for (const view of visibleViews) {
      const v = view as Record<string, unknown>
      console.log('_renderHighlightOnVisibleViews: Checking view index', v.index)

      // Check if this view contains the CFI
      if (rangeCfi.spinePos === (v.index as number)) {
        console.log('_renderHighlightOnVisibleViews: View matches CFI!')
        const contents = v.contents as Contents
        if (!contents) {
          console.warn('_renderHighlightOnVisibleViews: No contents in view')
          continue
        }

        try {
          // Convert CFI to DOM range
          console.log('_renderHighlightOnVisibleViews: Converting CFI to DOM range...')
          const domRange = rangeCfi.toRange(contents.document, this.settings.ignoreClass)
          if (!domRange) {
            console.warn('_renderHighlightOnVisibleViews: Could not convert CFI to range')
            continue
          }

          console.log(
            '_renderHighlightOnVisibleViews: DOM range created, calling _createHighlightElement'
          )
          // Create highlight element
          this._createHighlightElement(domRange, rangeCfi.toString(), className, styles, contents)
        } catch (e) {
          console.error('Error rendering highlight on view:', e)
        }
      }
    }
  }

  /**
   * Create a visual highlight element for a range
   */
  private _createHighlightElement(
    range: Range,
    cfi: string,
    className: string,
    styles: Record<string, unknown>,
    contents: Contents
  ): void {
    console.log('_createHighlightElement called for CFI:', cfi)
    try {
      const doc = contents.document
      const highlightId = 'epubjs-hl-' + encodeURIComponent(cfi)

      // Remove existing highlight if present
      const existing = doc.getElementById(highlightId)
      if (existing) {
        console.log('_createHighlightElement: Removing existing highlight')
        existing.remove()
      }

      // Get all client rects for the range (handles multi-line selections)
      const rects = range.getClientRects()
      console.log('_createHighlightElement: Found', rects.length, 'rects')
      if (!rects || rects.length === 0) {
        console.warn('_createHighlightElement: No rects found, returning')
        return
      }

      // Ensure the content container is positioned so absolutely positioned SVG aligns correctly
      try {
        const computedPos = contents.window.getComputedStyle(contents.content).position
        if (!computedPos || computedPos === 'static') {
          contents.content.style.position = 'relative'
        }
      } catch (e) {
        // ignore
      }

      // Also get the iframe rect if this is in an iframe
      let iframeRect: DOMRect | null = null
      try {
        const iframe = contents.content.ownerDocument.defaultView?.frameElement as HTMLIFrameElement
        if (iframe) {
          iframeRect = iframe.getBoundingClientRect()
        }
      } catch (e) {
        // Not in an iframe
      }

      // Create an SVG container for the highlights
      let svgContainer = doc.getElementById(
        'epubjs-highlights-container'
      ) as unknown as SVGSVGElement
      if (!svgContainer) {
        svgContainer = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
        svgContainer.id = 'epubjs-highlights-container'
        svgContainer.style.position = 'absolute'
        svgContainer.style.top = '0'
        svgContainer.style.left = '0'
        svgContainer.style.width = '100%'
        svgContainer.style.height = '100%'
        svgContainer.style.pointerEvents = 'none'
        svgContainer.style.zIndex = '1000' // Higher z-index to ensure visibility
        // Set explicit width/height attributes so SVG coordinates match CSS pixels
        try {
          let cw = contents.content.clientWidth
          let ch = contents.content.clientHeight

          // If in an iframe, use iframe dimensions instead
          if (iframeRect) {
            cw = iframeRect.width
            ch = iframeRect.height
          }

          if (cw > 0 && ch > 0) {
            svgContainer.setAttribute('width', String(cw))
            svgContainer.setAttribute('height', String(ch))
            svgContainer.setAttribute('viewBox', `0 0 ${cw} ${ch}`)
          }
        } catch (e) {
          // ignore
        }
        contents.content.appendChild(svgContainer)
      }

      // Create a group for this highlight
      const group = doc.createElementNS('http://www.w3.org/2000/svg', 'g')
      group.id = highlightId
      group.classList.add(className)
      group.setAttribute('data-cfi', cfi)
      // Apply mix-blend-mode on the group if provided in styles
      if (styles && typeof styles['mix-blend-mode'] !== 'undefined') {
        try {
          ;(group.style as unknown as Record<string, unknown>).mixBlendMode = String(
            styles['mix-blend-mode']
          )
        } catch (e) {
          // ignore
        }
      }

      // Compute coordinates relative to the content container
      const containerRect = contents.content.getBoundingClientRect()
      console.log('Container rect:', containerRect)

      let rectCount = 0
      // Create rectangles for each line of text
      for (let i = 0; i < rects.length; i++) {
        const rect = rects[i]

        // Skip empty rects
        if (rect.width === 0 || rect.height === 0) continue

        const rectElement = doc.createElementNS('http://www.w3.org/2000/svg', 'rect')

        // Calculate coordinates relative to the content container
        let x = rect.left - containerRect.left
        let y = rect.top - containerRect.top

        // If in an iframe, adjust coordinates for iframe positioning
        if (iframeRect) {
          x = rect.left - iframeRect.left
          y = rect.top - iframeRect.top
        }

        rectElement.setAttribute('x', x.toString())
        rectElement.setAttribute('y', y.toString())
        rectElement.setAttribute('width', rect.width.toString())
        rectElement.setAttribute('height', rect.height.toString())

        // Apply styles: handle common attributes and CSS styles
        const fill = (styles && styles['fill']) || 'yellow'
        const fillOpacity = (styles && styles['fill-opacity']) || '0.3'
        rectElement.setAttribute('fill', String(fill))
        rectElement.setAttribute('fill-opacity', String(fillOpacity))
        // Optional rounded corners if provided
        if (styles && typeof styles['rx'] !== 'undefined') {
          rectElement.setAttribute('rx', String(styles['rx']))
        }
        if (styles && typeof styles['ry'] !== 'undefined') {
          rectElement.setAttribute('ry', String(styles['ry']))
        }

        group.appendChild(rectElement)
        rectCount++
      }

      if (rectCount > 0) {
        svgContainer.appendChild(group)
        console.log(
          `_createHighlightElement: Successfully added highlight group with ${rectCount} rectangles to SVG`
        )
        console.log('_createHighlightElement: SVG container parent:', svgContainer.parentElement)
        console.log('_createHighlightElement: Group element:', group)
      } else {
        console.warn('_createHighlightElement: No valid rectangles created')
      }
    } catch (e) {
      console.error('Error creating highlight element:', e)
    }
  }

  /**
   * Remove a highlight from a CFI range
   */
  removeHighlight(cfiRange: string): Promise<boolean> {
    if (!this.manager) {
      return Promise.reject(new Error('Rendition manager not available'))
    }

    try {
      // Parse the CFI range to validate it
      const rangeCfi = new EpubCFI(cfiRange)

      // Check if this is a range CFI (should have start and end)
      if (!rangeCfi.range) {
        return Promise.reject(new Error('CFI string is not a range: ' + cfiRange))
      }

      // Check if the annotation exists before removal
      const annotationExists = this.annotations.has(cfiRange, 'highlight')

      // Remove the highlight annotation from store
      this.annotations.remove(cfiRange, 'highlight')

      // Remove visual highlight elements from all views
      this._removeHighlightFromViews(rangeCfi.toString())

      return Promise.resolve(annotationExists)
    } catch (error: unknown) {
      return Promise.reject(new Error('Error removing highlight: ' + (error as Error).message))
    }
  }

  /**
   * Remove highlight visual elements from all views
   */
  private _removeHighlightFromViews(cfi: string): void {
    if (!this.manager) return

    const highlightId = 'epubjs-hl-' + encodeURIComponent(cfi)
    const visibleViews = this.manager.visible()

    for (const view of visibleViews) {
      const v = view as Record<string, unknown>
      const contents = v.contents as Contents
      if (!contents) continue

      try {
        const doc = contents.document
        const highlightElement = doc.getElementById(highlightId)
        if (highlightElement) {
          highlightElement.remove()
        }
      } catch (e) {
        console.error('Error removing highlight from view:', e)
      }
    }
  }

  /**
   * Get all highlights
   */
  getAllHighlights(): readonly unknown[] {
    return this.annotations.getByType('highlight')
  }

  /**
   * Clear all highlights
   */
  clearAllHighlights(): void {
    const highlights = this.annotations.getByType('highlight')

    // Remove all highlight annotations and their visual elements
    for (const highlight of highlights) {
      try {
        this.annotations.remove(highlight.cfi, 'highlight')
        this._removeHighlightFromViews(highlight.cfi)
      } catch (e) {
        console.error('Error clearing highlight:', e)
      }
    }
  }

  /**
   * Hook to adjust images to fit in columns
   */
  private adjustImages(contents: Contents): Promise<void> {
    if (this._layout!.name === 'pre-paginated') {
      return Promise.resolve()
    }

    const computed = contents.window.getComputedStyle(contents.content, null)
    const height =
      (contents.content.offsetHeight -
        (parseFloat(computed.paddingTop) + parseFloat(computed.paddingBottom))) *
      0.95
    const horizontalPadding = parseFloat(computed.paddingLeft) + parseFloat(computed.paddingRight)

    contents.addStylesheetRules({
      img: {
        'max-width':
          (this._layout!.columnWidth
            ? this._layout!.columnWidth - horizontalPadding + 'px'
            : '100%') + '!important',
        'max-height': height + 'px' + '!important',
        'object-fit': 'contain',
        'page-break-inside': 'avoid',
        'break-inside': 'avoid',
        'box-sizing': 'border-box'
      },
      svg: {
        'max-width':
          (this._layout!.columnWidth
            ? this._layout!.columnWidth - horizontalPadding + 'px'
            : '100%') + '!important',
        'max-height': height + 'px' + '!important',
        'page-break-inside': 'avoid',
        'break-inside': 'avoid'
      }
    })

    return new Promise((resolve) => {
      setTimeout(() => {
        resolve()
      }, 1)
    })
  }

  /**
   * Get the Contents object of each rendered view
   */
  getContents(): Contents[] {
    return this.manager ? this.manager.views!.getContents() : []
  }

  /**
   * Get the views member from the manager
   */
  views(): unknown {
    const views = this.manager ? this.manager.views : undefined
    return views || []
  }

  /**
   * Get the text content of the currently viewed page
   */
  getCurrentViewText(): ViewText | null {
    if (!this.manager) {
      return null
    }

    const location = this.manager.currentLocation()

    if (!location || !Array.isArray(location) || !location.length || !location[0]) {
      return null
    }

    const visibleSection = location[0] as Record<string, unknown>

    if (
      !(visibleSection.mapping as Record<string, unknown>) ||
      !(visibleSection.mapping as Record<string, unknown>).start ||
      !(visibleSection.mapping as Record<string, unknown>).end
    ) {
      return null
    }

    const view = (
      (this.manager.views as Record<string, unknown>).find as (options: {
        index: number
      }) => unknown
    )({ index: visibleSection.index as number })

    if (
      !view ||
      !(view as Record<string, unknown>).contents ||
      !((view as Record<string, unknown>).contents as Record<string, unknown>).document
    ) {
      return null
    }

    try {
      const startCfi = new EpubCFI(
        (visibleSection.mapping as Record<string, unknown>).start as string
      )
      const endCfi = new EpubCFI((visibleSection.mapping as Record<string, unknown>).end as string)

      const contentsObj = (view as Record<string, unknown>).contents as Record<string, unknown>
      const document = contentsObj.document as Document

      const startRange = startCfi.toRange(document)
      const endRange = endCfi.toRange(document)

      if (!startRange || !endRange) {
        return null
      }

      const range = document.createRange() as Range
      range.setStart(startRange.startContainer, startRange.startOffset)
      range.setEnd(endRange.endContainer, endRange.endOffset)

      const text = range.toString()

      return {
        text: text,
        startCfi: (visibleSection.mapping as Record<string, unknown>).start as string,
        endCfi: (visibleSection.mapping as Record<string, unknown>).end as string
      }
    } catch (e) {
      console.error('Error extracting visible text:', e)
      return null
    }
  }

  /**
   * Get the paragraphs from the currently viewed page
   */
  getCurrentViewParagraphs(): Paragraph[] | null {
    if (!this.manager) {
      return null
    }

    const location = this.manager.currentLocation()

    if (!location || !Array.isArray(location) || !location.length || !location[0]) {
      return null
    }

    const visibleSection = location[0] as Record<string, unknown>

    if (
      !(visibleSection.mapping as Record<string, unknown>) ||
      !(visibleSection.mapping as Record<string, unknown>).start ||
      !(visibleSection.mapping as Record<string, unknown>).end
    ) {
      return null
    }

    const view = (
      (this.manager.views as Record<string, unknown>).find as (options: {
        index: number
      }) => unknown
    )({ index: visibleSection.index as number })

    if (
      !view ||
      !(view as Record<string, unknown>).contents ||
      !((view as Record<string, unknown>).contents as Record<string, unknown>).document
    ) {
      return null
    }

    try {
      const startCfi = new EpubCFI(
        (visibleSection.mapping as Record<string, unknown>).start as string
      )
      const endCfi = new EpubCFI((visibleSection.mapping as Record<string, unknown>).end as string)

      const contentsObj = (view as Record<string, unknown>).contents as Record<string, unknown>
      const document = contentsObj.document as Document

      const startRange = startCfi.toRange(document)
      const endRange = endCfi.toRange(document)

      if (!startRange || !endRange) {
        return null
      }

      const range = document.createRange() as Range
      range.setStart(startRange.startContainer, startRange.startOffset)
      range.setEnd(endRange.endContainer, endRange.endOffset)

      const paragraphs = this._getParagraphsFromRange(
        range,
        (view as Record<string, unknown>).contents as Contents
      )
      return paragraphs
    } catch (e) {
      console.error('Error extracting paragraphs:', e)
      return null
    }
  }

  /**
   * Get the paragraphs from the next view/page
   */
  async getNextViewParagraphs(options: { minLength?: number } = {}): Promise<Paragraph[]> {
    const { minLength = 50 } = options
    if (!this.manager) {
      return []
    }

    const location = this.manager.currentLocation()

    if (!location || !Array.isArray(location) || !location.length || !location[0]) {
      return []
    }

    const currentSection = location[0] as Record<string, unknown>
    if (
      !(currentSection.mapping as Record<string, unknown>) ||
      !(currentSection.mapping as Record<string, unknown>).start ||
      !(currentSection.mapping as Record<string, unknown>).end
    ) {
      return []
    }

    const currentView = (
      (this.manager.views as Record<string, unknown>).find as (options: {
        index: number
      }) => unknown
    )({
      index: currentSection.index as number
    })

    if (
      !currentView ||
      !(currentView as Record<string, unknown>).section ||
      !(currentView as Record<string, unknown>).contents
    ) {
      return []
    }

    const hasNextPageInSection = this._hasNextPageInCurrentSection(
      currentView as Record<string, unknown>,
      currentSection
    )

    let paragraphs: Paragraph[]
    if (hasNextPageInSection) {
      paragraphs = await this._getNextPageParagraphsInSectionAsync(
        currentView as Record<string, unknown>,
        currentSection
      )
    } else {
      const nextSectionParagraphs = await this._getFirstPageParagraphsInNextSection(
        currentView as Record<string, unknown>
      )
      paragraphs = nextSectionParagraphs
    }

    if (minLength > 0) {
      paragraphs = paragraphs.filter((p) => p.text.length >= minLength)
    }

    return paragraphs
  }

  /**
   * Check if there's a next page within the current section
   */
  private _hasNextPageInCurrentSection(
    _currentView: Record<string, unknown>,
    currentSection: Record<string, unknown>
  ): boolean {
    if (!(currentSection.pages as number[]) || !(currentSection.totalPages as number)) {
      return false
    }

    const currentPage = (currentSection.pages as number[])[
      (currentSection.pages as number[]).length - 1
    ]
    const hasNext = currentPage < (currentSection.totalPages as number)

    return hasNext
  }

  /**
   * Get paragraphs from the next page within the current section
   */
  private async _getNextPageParagraphsInSectionAsync(
    currentView: Record<string, unknown>,
    currentSection: Record<string, unknown>
  ): Promise<Paragraph[]> {
    try {
      const layout = this.manager!.layout!
      const currentPage = (currentSection.pages as number[])[
        (currentSection.pages as number[]).length - 1
      ]

      const nextPageStart = currentPage * layout.pageWidth
      const nextPageEnd = nextPageStart + layout.pageWidth

      const nextPageMapping = (
        (this.manager!.mapping as Record<string, unknown>).page as (
          contents: Contents,
          cfiBase: string,
          start: number,
          end: number
        ) => Record<string, unknown>
      )(
        currentView.contents as Contents,
        (currentView.section as Record<string, unknown>).cfiBase as string,
        nextPageStart,
        nextPageEnd
      )

      if (!nextPageMapping || !nextPageMapping.start || !nextPageMapping.end) {
        return []
      }

      const startCfi = new EpubCFI(nextPageMapping.start as string)
      const endCfi = new EpubCFI(nextPageMapping.end as string)

      let startRange = startCfi.toRange((currentView.contents as Contents).document)
      let endRange = endCfi.toRange((currentView.contents as Contents).document)

      if (!startRange || !endRange) {
        return []
      }

      try {
        const comparison = startRange.compareBoundaryPoints(Range.START_TO_START, endRange)
        if (comparison > 0) {
          const temp = startRange
          startRange = endRange
          endRange = temp
        }
      } catch (e) {
        console.error('Error comparing range boundaries:', e)
      }

      const range = (currentView.contents as Contents).document.createRange()
      range.setStart(startRange.startContainer, startRange.startOffset)
      range.setEnd(endRange.endContainer, endRange.endOffset)

      const paragraphs = this._getParagraphsFromRange(range, currentView.contents as Contents)

      return paragraphs
    } catch (e) {
      console.error('Error extracting next page paragraphs:', e)
      return []
    }
  }

  /**
   * Get paragraphs from the first page of the next section
   */
  private async _getFirstPageParagraphsInNextSection(
    currentView: Record<string, unknown>
  ): Promise<Paragraph[]> {
    const nextSection = (
      (currentView.section as Record<string, unknown>).next as () => Record<string, unknown> | null
    )()

    if (!nextSection) {
      console.log('_getFirstPageParagraphsInNextSection: No next section available')
      return []
    }

    const nextView = (
      (this.manager!.views as Record<string, unknown>).find as (options: {
        index: number
      }) => unknown
    )({ index: nextSection.index as number })

    if (!nextView) {
      try {
        const loadPromise = (
          nextSection.load as (loader: (...args: unknown[]) => unknown) => Promise<unknown>
        )(this.book.load.bind(this.book))
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Section load timeout')), 10000)
        )

        const loadedContent = (await Promise.race([loadPromise, timeoutPromise])) as Record<
          string,
          unknown
        >

        if (!loadedContent || !(loadedContent.document as Document)) {
          return []
        }

        const document = loadedContent.document as Document
        const body = document.body

        if (!body) {
          return []
        }

        const contents = new Contents(
          document,
          body,
          nextSection.cfiBase as string,
          nextSection.index as number
        )

        const firstPageMapping = this._getFirstPageMapping(contents, nextSection)

        if (!firstPageMapping || !firstPageMapping.start || !firstPageMapping.end) {
          return []
        }

        const startCfi = new EpubCFI(firstPageMapping.start as string)
        const endCfi = new EpubCFI(firstPageMapping.end as string)

        const startRange = startCfi.toRange(document)
        const endRange = endCfi.toRange(document)

        if (!startRange || !endRange) {
          return []
        }

        const range = document.createRange()
        range.setStart(startRange.startContainer, startRange.startOffset)
        range.setEnd(endRange.endContainer, endRange.endOffset)

        const paragraphs = this._getParagraphsFromRange(range, contents)
        console.log(
          '_getFirstPageParagraphsInNextSection: Found',
          paragraphs.length,
          'paragraphs in loaded section'
        )
        return paragraphs
      } catch (e) {
        console.error('Error loading next section content:', e)
        return []
      }
    }

    if (
      !(nextView as Record<string, unknown>).contents ||
      !((nextView as Record<string, unknown>).contents as Record<string, unknown>).document
    ) {
      return []
    }

    try {
      const firstPageMapping = this._getFirstPageMapping(
        (nextView as Record<string, unknown>).contents as Contents,
        (nextView as Record<string, unknown>).section as Record<string, unknown>
      )

      if (!firstPageMapping || !firstPageMapping.start || !firstPageMapping.end) {
        return []
      }

      const startCfi = new EpubCFI(firstPageMapping.start as string)
      const endCfi = new EpubCFI(firstPageMapping.end as string)

      const nextView_ = nextView as Record<string, unknown>
      const nextContentsObj = nextView_.contents as Record<string, unknown>
      const nextDocument = nextContentsObj.document as Document

      const startRange = startCfi.toRange(nextDocument)
      const endRange = endCfi.toRange(nextDocument)

      if (!startRange || !endRange) {
        return []
      }

      const range = nextDocument.createRange() as Range
      range.setStart(startRange.startContainer, startRange.startOffset)
      range.setEnd(endRange.endContainer, endRange.endOffset)

      const paragraphs = this._getParagraphsFromRange(
        range,
        (nextView as Record<string, unknown>).contents as Contents
      )
      console.log(
        '_getFirstPageParagraphsInNextSection: Found',
        paragraphs.length,
        'paragraphs in existing view'
      )
      return paragraphs
    } catch (e) {
      console.error('Error extracting paragraphs from next view:', e)
      return []
    }
  }

  /**
   * Get the CFI mapping for the first page of a section
   */
  private _getFirstPageMapping(
    contents: Contents,
    section: Record<string, unknown>
  ): Record<string, unknown> {
    const layout = this.manager!.layout!

    const start = 0
    let end: number

    if (this.manager!.settings!.axis === 'horizontal') {
      end = layout.pageWidth
    } else {
      end = layout.height
    }

    return (
      (this.manager!.mapping as Record<string, unknown>).page as (
        contents: Contents,
        cfiBase: string,
        start: number,
        end: number
      ) => Record<string, unknown>
    )(contents, section.cfiBase as string, start, end)
  }

  /**
   * Get paragraphs from a range by extracting text and splitting it logically
   */
  private _getParagraphsFromRange(range: Range, contents: Contents): Paragraph[] {
    const paragraphs: Paragraph[] = []

    try {
      const fullText = range.toString()
      console.log(
        '_getParagraphsFromRange: Starting extraction, text length:',
        fullText.length,
        'preview:',
        fullText.substring(0, 100)
      )

      if (!fullText.trim()) {
        console.log('_getParagraphsFromRange: No text in range')
        return []
      }

      const document = range.commonAncestorContainer.ownerDocument
      if (!document) {
        console.log('_getParagraphsFromRange: No document found')
        return []
      }

      const textNodes = this._getTextNodesInRange(range)
      console.log('_getParagraphsFromRange: Found text nodes:', textNodes.length)

      if (textNodes.length === 0) {
        console.log('_getParagraphsFromRange: No text nodes in range')
        return []
      }

      const blockElementToTextNodes = new Map<Element, Text[]>()

      for (const textNode of textNodes) {
        const blockElement = this._findContainingBlockElement(textNode)
        if (blockElement) {
          if (!blockElementToTextNodes.has(blockElement)) {
            blockElementToTextNodes.set(blockElement, [])
          }
          blockElementToTextNodes.get(blockElement)!.push(textNode)
        }
      }

      console.log('_getParagraphsFromRange: Block elements found:', blockElementToTextNodes.size)

      for (const [blockElement, textNodes] of Array.from(blockElementToTextNodes)) {
        try {
          let elementText = ''
          let firstTextNode: Text | null = null
          let lastTextNode: Text | null = null
          let firstTextOffset = 0
          let lastTextOffset = 0

          for (const textNode of textNodes) {
            const nodeText = textNode.textContent || ''

            if (!firstTextNode) {
              firstTextNode = textNode
            }
            lastTextNode = textNode

            if (textNode === range.startContainer && textNode === range.endContainer) {
              elementText += nodeText.substring(range.startOffset, range.endOffset)
              firstTextOffset = range.startOffset
              lastTextOffset = range.endOffset
            } else if (textNode === range.startContainer) {
              elementText += nodeText.substring(range.startOffset)
              firstTextOffset = range.startOffset
              if (textNode === lastTextNode) {
                lastTextOffset = nodeText.length
              }
            } else if (textNode === range.endContainer) {
              elementText += nodeText.substring(0, range.endOffset)
              lastTextOffset = range.endOffset
              if (textNode === firstTextNode) {
                firstTextOffset = 0
              }
            } else {
              elementText += nodeText
              if (textNode === firstTextNode) {
                firstTextOffset = 0
              }
              if (textNode === lastTextNode) {
                lastTextOffset = nodeText.length
              }
            }
          }

          elementText = elementText.trim()

          if (!elementText || !firstTextNode || !lastTextNode) {
            continue
          }

          const paragraphRange = document.createRange()

          const maxStartOffset = firstTextNode.textContent ? firstTextNode.textContent.length : 0
          const maxEndOffset = lastTextNode.textContent ? lastTextNode.textContent.length : 0

          const validFirstOffset = Math.min(Math.max(firstTextOffset, 0), maxStartOffset)
          const validLastOffset = Math.min(Math.max(lastTextOffset, 0), maxEndOffset)

          paragraphRange.setStart(firstTextNode, validFirstOffset)
          paragraphRange.setEnd(lastTextNode, validLastOffset)

          const elementCfi = new EpubCFI(blockElement, contents.cfiBase, this.settings.ignoreClass)

          const mainCfi = elementCfi.toString()
          const startCfi: string = mainCfi
          const endCfi: string = mainCfi
          let cfiRange: string

          const rangeCfiObj = new EpubCFI(
            paragraphRange,
            contents.cfiBase,
            this.settings.ignoreClass
          )
          cfiRange = rangeCfiObj.toString()

          try {
            const testCfi = new EpubCFI(mainCfi)
            if (!testCfi.path || !testCfi.base) {
              continue
            }

            const testRangeCfi = new EpubCFI(cfiRange)
            if (!testRangeCfi.path || !testRangeCfi.base) {
              cfiRange = mainCfi
            }
          } catch (e) {
            continue
          }

          paragraphs.push({
            text: elementText,
            startCfi: startCfi,
            endCfi: endCfi,
            cfiRange: cfiRange
          })
        } catch (e) {
          console.error('❌ Error processing block element:', e)
          continue
        }
      }

      if (paragraphs.length === 0 && fullText.trim()) {
        console.log('_getParagraphsFromRange: No block elements found, using fallback extraction')
        try {
          const cfi = new EpubCFI(range, contents.cfiBase, this.settings.ignoreClass)
          const cfiString = cfi.toString()
          paragraphs.push({
            text: fullText.trim(),
            cfiRange: cfiString,
            startCfi: cfiString,
            endCfi: cfiString
          })
        } catch (e) {
          console.error('Error creating fallback paragraph:', e)
        }
      }

      console.log('_getParagraphsFromRange: Returning', paragraphs.length, 'paragraphs')
      return paragraphs
    } catch (e) {
      console.error('Error getting paragraphs from range:', e)
      return []
    }
  }

  /**
   * Get all text nodes within a range
   */
  private _getTextNodesInRange(range: Range): Text[] {
    const textNodes: Text[] = []

    try {
      if (!range || !range.commonAncestorContainer) {
        console.error('_getTextNodesInRange: Invalid range provided')
        return textNodes
      }

      const walker = range.commonAncestorContainer.ownerDocument!.createTreeWalker(
        range.commonAncestorContainer,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: function (node: Node) {
            try {
              if (!node.textContent || !node.textContent.trim()) {
                return NodeFilter.FILTER_REJECT
              }
              return range.intersectsNode(node)
                ? NodeFilter.FILTER_ACCEPT
                : NodeFilter.FILTER_REJECT
            } catch (e) {
              return NodeFilter.FILTER_REJECT
            }
          }
        }
      )

      let node: Node | null
      while ((node = walker.nextNode())) {
        textNodes.push(node as Text)
      }
    } catch (e) {
      console.error('Error getting text nodes in range:', e)
    }

    return textNodes
  }

  /**
   * Find the containing block element for a text node
   */
  private _findContainingBlockElement(textNode: Text): Element | null {
    const blockSelectors =
      'p, div, h1, h2, h3, h4, h5, h6, li, blockquote, pre, article, section, aside, header, footer, main, nav, figure, figcaption, dd, dt'

    let element = textNode.parentElement

    while (element) {
      try {
        if (element.matches && element.matches(blockSelectors)) {
          return element
        }
      } catch (e) {
        const selectors = blockSelectors.split(', ')
        for (const selector of selectors) {
          try {
            if (element.matches && element.matches(selector)) {
              return element
            }
          } catch (e2) {
            continue
          }
        }
      }
      element = element.parentElement
    }

    return null
  }

  /**
   * Hook to handle link clicks in rendered content
   */
  private handleLinks(contents: Contents): void {
    if (contents) {
      contents.on(EVENTS.CONTENTS.LINK_CLICKED, (...args: unknown[]) => {
        const href = args[0] as string
        const relative = this.book.path.relative(href)
        this.display(relative)
      })
    }
  }

  /**
   * Hook to handle injecting stylesheet before
   * a Section is serialized
   */
  private injectStylesheet(doc: Document): void {
    const style = doc.createElement('link')
    style.setAttribute('type', 'text/css')
    style.setAttribute('rel', 'stylesheet')
    style.setAttribute('href', this.settings.stylesheet!)
    doc.getElementsByTagName('head')[0].appendChild(style)
  }

  /**
   * Hook to handle injecting scripts before
   * a Section is serialized
   */
  private injectScript(doc: Document): void {
    const script = doc.createElement('script')
    script.setAttribute('type', 'text/javascript')
    script.setAttribute('src', this.settings.script!)
    script.textContent = ' '
    doc.getElementsByTagName('head')[0].appendChild(script)
  }

  /**
   * Hook to handle the document identifier before
   * a Section is serialized
   */
  private injectIdentifier(doc: Document): void {
    const ident = this.book.packaging.metadata.identifier
    const meta = doc.createElement('meta')
    meta.setAttribute('name', 'dc.relation.ispartof')
    if (ident) {
      meta.setAttribute('content', ident)
    }
    doc.getElementsByTagName('head')[0].appendChild(meta)
  }

  // EventEmitter methods
  on<K extends keyof RenditionEventMap>(event: K, handler: RenditionEventMap[K]): void
  on(event: string, handler: (...args: unknown[]) => void): void
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  on(_event: string, _handler: (...args: unknown[]) => void): void {
    // Implementation will be added by EventEmitter mixin
  }

  off<K extends keyof RenditionEventMap>(event: K, handler: RenditionEventMap[K]): void
  off(event: string, handler: (...args: unknown[]) => void): void
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  off(_event: string, _handler: (...args: unknown[]) => void): void {
    // Implementation will be added by EventEmitter mixin
  }

  emit<K extends keyof RenditionEventMap>(event: K, ...args: Parameters<RenditionEventMap[K]>): void
  emit(event: string, ...args: unknown[]): void
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  emit(_event: string, ..._args: unknown[]): void {
    // Implementation will be added by EventEmitter mixin
  }
}

// Enable binding events to Renderer
EventEmitter(Rendition.prototype)

export default Rendition
