import { qs, sprint, locationOf, defer } from './utils/core'
import Queue from './utils/queue'
import EpubCFI from './epubcfi'
import { EVENTS } from './utils/constants'
import EventEmitter from 'event-emitter'

interface RangeObject {
  startContainer?: Node
  startOffset?: number
  endContainer?: Node
  endOffset?: number
}

interface LocationItem {
  cfi: string
  wordCount?: number
}

interface CFIStep {
  type: 'element' | 'text'
  index: number
  id?: string | null
  tagName?: string
}

/**
 * Find Locations for a Book
 * @param {Spine} spine
 * @param {request} request
 * @param {number} [pause=100]
 */
class Locations {
  spine: unknown
  request: (...args: unknown[]) => unknown
  pause: number
  q: Queue
  epubcfi: EpubCFI
  _locations: string[] = []
  _locationsWords: LocationItem[] = []
  total: number = 0
  break: number = 150
  _current: number = 0
  _wordCounter: number = 0
  _currentCfiValue: string = ''
  processingTimeout: ReturnType<typeof setTimeout> | undefined = undefined

  constructor(spine: unknown, request: (...args: unknown[]) => unknown, pause?: number) {
    this.spine = spine
    this.request = request
    this.pause = pause || 100

    this.q = new Queue(this)
    this.epubcfi = new EpubCFI()

    this._locations = []
    this._locationsWords = []
    this.total = 0

    this.break = 150

    this._current = 0

    this._wordCounter = 0

    this._currentCfiValue = ''
    this.processingTimeout = undefined
  }

  /**
   * Load all of sections in the book to generate locations
   * @param  {int} chars how many chars to split on
   * @return {Promise<Array<string>>} locations
   */
  generate(chars?: number): Promise<string[]> {
    if (chars) {
      this.break = chars
    }

    this.q.pause()

    const spineObj = this.spine as Record<string, unknown>
    if (typeof spineObj.each === 'function') {
      ;(spineObj.each as (cb: (s: unknown) => void) => void)((section: unknown) => {
        const sectionObj = section as Record<string, unknown>
        if (sectionObj.linear) {
          this.q.enqueue(this.process.bind(this), section)
        }
      })
    }

    return (this.q.run() as Promise<unknown>).then(() => {
      this.total = this._locations.length - 1

      if (this._currentCfiValue) {
        this._current = this.locationFromCfi(this._currentCfiValue)
      }

      return this._locations
    })
  }

  createRange(): RangeObject {
    return {
      startContainer: undefined,
      startOffset: undefined,
      endContainer: undefined,
      endOffset: undefined
    }
  }

  process(section: unknown): Promise<string[]> {
    const sectionObj = section as Record<string, unknown>
    return (sectionObj.load as (req: (...args: unknown[]) => unknown) => Promise<unknown>)(
      this.request
    ).then((contents: unknown) => {
      const completed = defer()
      const locations = this.parse(
        contents as { ownerDocument: Document },
        section as Record<string, unknown>
      )
      this._locations = this._locations.concat(locations)
      ;(sectionObj.unload as () => void)()

      this.processingTimeout = setTimeout(() => {
        if (completed.resolve) {
          completed.resolve(locations)
        }
      }, this.pause)
      return completed.promise as Promise<string[]>
    })
  }

  parse(
    contents: { ownerDocument: Document },
    cfiBase: Record<string, unknown>,
    chars?: number
  ): string[] {
    const locations: string[] = []
    let range: RangeObject | undefined
    const doc = contents.ownerDocument
    const bodyEl = qs(doc.documentElement, 'body') as Element | null
    let counter = 0
    const _break = chars || this.break
    const parser = (node: Node): boolean | undefined => {
      const len = (node as Text).length
      let dist: number
      let pos = 0

      if (node.textContent!.trim().length === 0) {
        return false // continue
      }

      // Start range
      if (counter === 0) {
        range = this.createRange()
        range.startContainer = node
        range.startOffset = 0
      }

      dist = _break - counter

      // Node is smaller than a break,
      // skip over it
      if (dist > len) {
        counter += len
        pos = len
      }

      while (pos < len) {
        dist = _break - counter

        if (counter === 0) {
          // Start new range
          pos += 1
          range = this.createRange()
          range.startContainer = node
          range.startOffset = pos
        }

        // Gone over
        if (pos + dist >= len) {
          // Continue counter for next node
          counter += len - pos
          // break
          pos = len
          // At End
        } else {
          // Advance pos
          pos += dist

          // End the previous range
          if (range) {
            range.endContainer = node
            range.endOffset = pos
            const cfiBase_val = (cfiBase as Record<string, unknown>).cfiBase as string
            const cfi = new EpubCFI(range as unknown as Range, cfiBase_val).toString()
            locations.push(cfi)
            counter = 0
          }
        }
      }

      return undefined
    }

    if (bodyEl) {
      sprint(bodyEl, parser)
    }

    // Close remaining
    if (range && range.startContainer) {
      range.endContainer = range.startContainer.parentNode as Node
      range.endOffset = range.startContainer.textContent?.length || 0
      const cfiBase_val = (cfiBase as Record<string, unknown>).cfiBase as string
      const cfi = new EpubCFI(range as unknown as Range, cfiBase_val).toString()
      locations.push(cfi)
      counter = 0
    }

    return locations
  }

  /**
   * Load all of sections in the book to generate locations
   * @param  {string} startCfi start position
   * @param  {int} wordCount how many words to split on
   * @param  {int} count result count
   * @return {object} locations
   */
  generateFromWords(
    startCfi?: string,
    wordCount?: number,
    count?: number
  ): Promise<LocationItem[]> {
    const start = startCfi ? new EpubCFI(startCfi) : undefined
    this.q.pause()
    this._locationsWords = []
    this._wordCounter = 0

    const spineObj = this.spine as Record<string, unknown>
    if (typeof spineObj.each === 'function') {
      ;(spineObj.each as (cb: (s: unknown) => void) => void)((section: unknown) => {
        const sectionObj = section as Record<string, unknown>
        if (sectionObj.linear) {
          if (start) {
            if ((sectionObj.index as number) >= start.spinePos) {
              this.q.enqueue(
                (this.processWords as (...args: unknown[]) => unknown).bind(this),
                section,
                wordCount,
                start,
                count
              )
            }
          } else {
            this.q.enqueue(
              (this.processWords as (...args: unknown[]) => unknown).bind(this),
              section,
              wordCount,
              start,
              count
            )
          }
        }
      })
    }

    return (this.q.run() as Promise<unknown>).then(() => {
      if (this._currentCfiValue) {
        this._current = this.locationFromCfi(this._currentCfiValue)
      }

      return this._locationsWords
    })
  }

  processWords(
    section: unknown,
    wordCount?: number,
    startCfi?: EpubCFI,
    count?: number
  ): Promise<LocationItem[]> {
    if (count && this._locationsWords.length >= count) {
      return Promise.resolve([])
    }

    const sectionObj = section as Record<string, unknown>
    return (sectionObj.load as (req: (...args: unknown[]) => unknown) => Promise<unknown>)(
      this.request
    ).then((contents: unknown) => {
      const completed = defer()
      const locations = this.parseWords(
        contents as { ownerDocument: Document },
        section as Record<string, unknown>,
        wordCount,
        startCfi
      )
      const remainingCount = (count || 0) - this._locationsWords.length
      this._locationsWords = this._locationsWords.concat(
        locations.length >= (count || 0) ? locations.slice(0, remainingCount) : locations
      )
      ;(sectionObj.unload as () => void)()

      this.processingTimeout = setTimeout(() => {
        if (completed.resolve) {
          completed.resolve(locations)
        }
      }, this.pause)
      return completed.promise as Promise<LocationItem[]>
    })
  }

  countWords(s: string): number {
    const str = s.replace(/(^\s*)|(\s*$)/gi, '') // exclude start and end white-space
    const str2 = str.replace(/[ ]{2,}/gi, ' ') // 2 or more space to 1
    const str3 = str2.replace(/\n /, '\n') // exclude newline with a start spacing
    return str3.split(' ').length
  }

  parseWords(
    contents: { ownerDocument: Document },
    section: Record<string, unknown>,
    wordCount?: number,
    startCfi?: EpubCFI
  ): LocationItem[] {
    const cfiBase = section.cfiBase as string
    const locations: LocationItem[] = []
    const doc = contents.ownerDocument
    const bodyEl = qs(doc.documentElement, 'body') as Element | null
    let foundStartNode = startCfi ? startCfi.spinePos !== (section.index as number) : true
    let startNode: Node | undefined
    if (startCfi && (section.index as number) === startCfi.spinePos) {
      const pathStepsVal = (startCfi.path as unknown as Record<string, unknown>).steps as CFIStep[]
      const steps = startCfi.range
        ? pathStepsVal.concat(
            (startCfi.start as unknown as Record<string, unknown>).steps as CFIStep[]
          )
        : pathStepsVal
      startNode = startCfi.findNode(steps, doc) as unknown as Node
    }
    const parser = (node: Node): boolean | undefined => {
      if (!foundStartNode) {
        if (node === startNode) {
          foundStartNode = true
        } else {
          return false
        }
      }
      if (node.textContent!.length < 10) {
        if (node.textContent!.trim().length === 0) {
          return false
        }
      }
      const len = this.countWords(node.textContent || '')
      let dist: number
      let pos = 0

      if (len === 0) {
        return false // continue
      }

      dist = (wordCount || 0) - this._wordCounter

      // Node is smaller than a break,
      // skip over it
      if (dist > len) {
        this._wordCounter += len
        pos = len
      }

      while (pos < len) {
        dist = (wordCount || 0) - this._wordCounter

        // Gone over
        if (pos + dist >= len) {
          // Continue counter for next node
          this._wordCounter += len - pos
          // break
          pos = len
          // At End
        } else {
          // Advance pos
          pos += dist

          const cfi = new EpubCFI(node, cfiBase)
          locations.push({
            cfi: cfi.toString(),
            wordCount: this._wordCounter
          })
          this._wordCounter = 0
        }
      }

      return undefined
    }

    if (bodyEl) {
      sprint(bodyEl, parser)
    }

    return locations
  }

  /**
   * Get a location from an EpubCFI
   * @param {EpubCFI} cfi
   * @return {number}
   */
  locationFromCfi(cfi: string | EpubCFI): number {
    let cfiBased = cfi
    if (EpubCFI.prototype.isCfiString(cfi)) {
      cfiBased = new EpubCFI(cfi as string)
    }
    // Check if the location has not been set yet
    if (this._locations.length === 0) {
      return -1
    }

    const loc = locationOf(cfiBased, this._locations, this.epubcfi.compare)

    if (loc > this.total) {
      return this.total
    }

    return loc
  }

  /**
   * Get a percentage position in locations from an EpubCFI
   * @param {EpubCFI} cfi
   * @return {number}
   */
  percentageFromCfi(cfi: string | EpubCFI): number | null {
    if (this._locations.length === 0) {
      return null
    }
    // Find closest cfi
    const loc = this.locationFromCfi(cfi)
    // Get percentage in total
    return this.percentageFromLocation(loc)
  }

  /**
   * Get a percentage position from a location index
   * @param {number} location
   * @return {number}
   */
  percentageFromLocation(loc: number): number {
    if (!loc || !this.total) {
      return 0
    }

    return loc / this.total
  }

  /**
   * Get an EpubCFI from location index
   * @param {number} loc
   * @return {EpubCFI} cfi
   */
  cfiFromLocation(loc: string | number): string {
    let cfiLoc = -1
    // check that pg is an int
    let locNum = loc
    if (typeof locNum !== 'number') {
      locNum = parseInt(locNum as string)
    }

    if (locNum >= 0 && locNum < this._locations.length) {
      cfiLoc = locNum
    }

    return this._locations[cfiLoc]
  }

  /**
   * Get an EpubCFI from location percentage
   * @param {number} percentage
   * @return {EpubCFI} cfi
   */
  cfiFromPercentage(percentage: number): string {
    if (percentage > 1) {
      console.warn('Normalize cfiFromPercentage value to between 0 - 1')
    }

    // Make sure 1 goes to very end
    if (percentage >= 1) {
      const cfi = new EpubCFI(this._locations[this.total])
      cfi.collapse()
      return cfi.toString()
    }

    const loc = Math.ceil(this.total * percentage)
    return this.cfiFromLocation(loc)
  }

  /**
   * Load locations from JSON
   * @param {json} locations
   */
  load(locations: string | string[]): string[] {
    if (typeof locations === 'string') {
      this._locations = JSON.parse(locations) as string[]
    } else {
      this._locations = locations
    }
    this.total = this._locations.length - 1
    return this._locations
  }

  /**
   * Save locations to JSON
   * @return {json}
   */
  save(): string {
    return JSON.stringify(this._locations)
  }

  getCurrent(): number {
    return this._current
  }

  setCurrent(curr: string | number): void {
    let loc: number

    if (typeof curr === 'string') {
      this._currentCfiValue = curr
    } else if (typeof curr === 'number') {
      this._current = curr
    } else {
      return
    }

    if (this._locations.length === 0) {
      return
    }

    if (typeof curr === 'string') {
      loc = this.locationFromCfi(curr)
      this._current = loc
    } else {
      loc = curr
    }

    this.emit(EVENTS.LOCATIONS.CHANGED, {
      percentage: this.percentageFromLocation(loc)
    })
  }

  /**
   * Get the current location
   */
  get currentLocation(): string {
    return this._currentCfiValue
  }

  /**
   * Set the current location
   */
  set currentLocation(curr: string) {
    this._currentCfiValue = curr
    this.setCurrent(curr)
  }

  /**
   * Locations length
   */
  length(): number {
    return this._locations.length
  }

  destroy(): void {
    this.spine = undefined
    this.request = undefined as unknown as (...args: unknown[]) => unknown
    this.pause = undefined as unknown as number

    this.q.stop()
    this.q = undefined as unknown as Queue
    this.epubcfi = undefined as unknown as EpubCFI

    this._locations = undefined as unknown as string[]
    this.total = undefined as unknown as number

    this.break = undefined as unknown as number
    this._current = undefined as unknown as number

    this._currentCfiValue = undefined as unknown as string
    clearTimeout(this.processingTimeout)
  }

  // EventEmitter methods
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  emit(_event: string, ..._args: unknown[]): void {
    // Implementation will be added by EventEmitter mixin
  }
}

EventEmitter(Locations.prototype)

export default Locations
