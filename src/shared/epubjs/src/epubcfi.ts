import { type, findChildren, RangeObject, isNumber } from './utils/core'

const ELEMENT_NODE = 1
const TEXT_NODE = 3
// const COMMENT_NODE = 8
const DOCUMENT_NODE = 9

interface CFIStep {
  type: 'element' | 'text'
  index: number
  id?: string | null
  tagName?: string
}

interface CFITerminal {
  offset: number | null
  assertion: string | null
}

interface CFIComponent {
  steps: CFIStep[]
  terminal: CFITerminal
}

interface CFIObject {
  str: string
  base: CFIComponent
  spinePos: number
  range: boolean
  path: CFIComponent
  start: CFIComponent | null
  end: CFIComponent | null
}

interface CFIFixResult {
  container: Node
  offset: number
}

/**
 * Parsing and creation of EpubCFIs: http://www.idpf.org/epub/linking/cfi/epub-cfi.html
 *
 * Implements:
 * - Character Offset: epubcfi(/6/4[chap01ref]!/4[body01]/10[para05]/2/1:3)
 * - Simple Ranges : epubcfi(/6/4[chap01ref]!/4[body01]/10[para05],/2/1:1,/3:4)
 *
 * Does Not Implement:
 * - Temporal Offset (~)
 * - Spatial Offset (@)
 * - Temporal-Spatial Offset (~ + @)
 * - Text Location Assertion ([)
 * @class
 * @param {string | Range | Node } [cfiFrom]
 * @param {string | object} [base]
 * @param {string} [ignoreClass] class to ignore when parsing DOM
 */
class EpubCFI {
  public str: string = ''
  public base: CFIComponent = { steps: [], terminal: { offset: null, assertion: null } }
  public spinePos: number = 0 // For compatibility
  public range: boolean = false // true || false;
  public path: CFIComponent = { steps: [], terminal: { offset: null, assertion: null } }
  public start: CFIComponent | null = null
  public end: CFIComponent | null = null

  constructor(
    cfiFrom?: string | Range | Node | EpubCFI,
    base?: string | CFIComponent,
    ignoreClass?: string
  ) {
    const cfiType: string | false = this.checkType(cfiFrom)

    // Allow instantiation without the "new" keyword
    if (!(this instanceof EpubCFI)) {
      return new EpubCFI(cfiFrom, base, ignoreClass)
    }

    if (typeof base === 'string') {
      this.base = this.parseComponent(base)
    } else if (typeof base === 'object' && base && (base as CFIComponent).steps) {
      this.base = base as CFIComponent
    }

    if (cfiType === 'string') {
      this.str = cfiFrom as string
      return Object.assign(this, this.parse(cfiFrom as string)) as this
    } else if (cfiType === 'range') {
      return Object.assign(this, this.fromRange(cfiFrom as Range, this.base, ignoreClass)) as this
    } else if (cfiType === 'node') {
      return Object.assign(this, this.fromNode(cfiFrom as Node, this.base, ignoreClass)) as this
    } else if (cfiType === 'EpubCFI' && (cfiFrom as EpubCFI).path) {
      return cfiFrom as EpubCFI
    } else if (!cfiFrom) {
      return this
    } else {
      throw new TypeError('not a valid argument for EpubCFI')
    }
  }

  /**
   * Check the type of constructor input
   * @private
   */
  checkType(cfi: unknown): string | false {
    if (this.isCfiString(cfi)) {
      return 'string'
      // Is a range object
    } else if (
      cfi &&
      typeof cfi === 'object' &&
      (type(cfi) === 'Range' ||
        typeof (cfi as Record<string, unknown>).startContainer !== 'undefined')
    ) {
      return 'range'
    } else if (
      cfi &&
      typeof cfi === 'object' &&
      typeof (cfi as Record<string, unknown>).nodeType !== 'undefined'
    ) {
      return 'node'
    } else if (cfi && typeof cfi === 'object' && cfi instanceof EpubCFI) {
      return 'EpubCFI'
    } else {
      return false
    }
  }

  /**
   * Parse a cfi string to a CFI object representation
   * @param {string} cfiStr
   * @returns {object} cfi
   */
  parse(cfiStr: string): Partial<CFIObject> {
    const cfi: Partial<CFIObject> = {
      spinePos: -1,
      range: false,
      base: { steps: [], terminal: { offset: null, assertion: null } },
      path: { steps: [], terminal: { offset: null, assertion: null } },
      start: null,
      end: null
    }

    const baseComponent = this.getChapterComponent(cfiStr)
    const pathComponent = this.getPathComponent(cfiStr)
    const rangeResult = this.getRange(cfiStr)

    if (typeof cfiStr !== 'string') {
      return { spinePos: -1 }
    }

    let normalizedStr = cfiStr
    if (
      normalizedStr.indexOf('epubcfi(') === 0 &&
      normalizedStr[normalizedStr.length - 1] === ')'
    ) {
      // Remove initial epubcfi( and ending )
      normalizedStr = normalizedStr.slice(8, normalizedStr.length - 1)
    }

    // Make sure this is a valid cfi or return
    if (!baseComponent) {
      return { spinePos: -1 }
    }

    cfi.base = this.parseComponent(baseComponent)

    cfi.path = this.parseComponent(pathComponent || '')

    if (rangeResult) {
      cfi.range = true
      cfi.start = this.parseComponent(rangeResult[0])
      cfi.end = this.parseComponent(rangeResult[1])
    }

    // Get spine node position
    // cfi.spineSegment = cfi.base.steps[1];

    // Chapter segment is always the second step
    cfi.spinePos = (cfi.base as CFIComponent).steps[1].index

    return cfi
  }

  parseComponent(componentStr: string): CFIComponent {
    const component: CFIComponent = {
      steps: [],
      terminal: {
        offset: null,
        assertion: null
      }
    }

    const parts = componentStr.split(':')
    const steps = parts[0].split('/')
    let terminal: string

    if (parts.length > 1) {
      terminal = parts[1]
      component.terminal = this.parseTerminal(terminal)
    }

    if (steps[0] === '') {
      steps.shift() // Ignore the first slash
    }

    component.steps = steps
      .map((step) => {
        return this.parseStep(step)
      })
      .filter(Boolean) as CFIStep[]

    return component
  }

  parseStep(stepStr: string): CFIStep | undefined {
    let stepType: 'element' | 'text', index: number
    let id: string | undefined

    const hasBracketsResult = stepStr.match(/\[(.*)\]/)
    if (hasBracketsResult && hasBracketsResult[1]) {
      id = hasBracketsResult[1]
    }

    //-- Check if step is a text node or element
    const numValue = parseInt(stepStr)

    if (isNaN(numValue)) {
      return
    }

    const num = numValue
    if (num % 2 === 0) {
      // Even = is an element
      stepType = 'element'
      index = num / 2 - 1
    } else {
      stepType = 'text'
      index = (num - 1) / 2
    }

    return {
      type: stepType,
      index: index,
      id: id || null
    }
  }

  parseTerminal(terminalStr: string): CFITerminal {
    let characterOffset: number | null, textLocationAssertion: string | undefined
    const assertion = terminalStr.match(/\[(.*)\]/)

    if (assertion && assertion[1]) {
      characterOffset = parseInt(terminalStr.split('[')[0])
      textLocationAssertion = assertion[1]
    } else {
      characterOffset = parseInt(terminalStr)
    }

    if (!isNumber(characterOffset)) {
      characterOffset = null
    }

    return {
      offset: characterOffset,
      assertion: textLocationAssertion || null
    }
  }

  getChapterComponent(cfiStr: string): string {
    const indirection = cfiStr.split('!')
    return indirection[0] || ''
  }

  getPathComponent(cfiStr: string): string | undefined {
    const indirection = cfiStr.split('!')

    if (indirection[1]) {
      const ranges = indirection[1].split(',')
      return ranges[0] || undefined
    }
    return undefined
  }

  getRange(cfiStr: string): string[] | false {
    const ranges = cfiStr.split(',')

    if (ranges.length === 3) {
      return [ranges[1], ranges[2]]
    }

    return false
  }

  getCharacterOffsetComponent(cfiStr: string): string {
    const splitStr = cfiStr.split(':')
    return (splitStr[1] as string) || ''
  }

  joinSteps(steps: CFIStep[]): string {
    if (!steps) {
      return ''
    }

    return steps
      .map((part) => {
        let segment = ''

        if (part.type === 'element') {
          segment += (part.index + 1) * 2
        }

        if (part.type === 'text') {
          segment += 1 + 2 * part.index // TODO: double check that this is odd
        }

        if (part.id) {
          segment += '[' + part.id + ']'
        }

        return segment
      })
      .join('/')
  }

  segmentString(segment: CFIComponent): string {
    let segmentString = '/'

    segmentString += this.joinSteps(segment.steps)

    if (segment.terminal && segment.terminal.offset !== null) {
      segmentString += ':' + segment.terminal.offset
    }

    if (segment.terminal && segment.terminal.assertion !== null) {
      segmentString += '[' + segment.terminal.assertion + ']'
    }

    return segmentString
  }

  /**
   * Convert CFI to a epubcfi(...) string
   * @returns {string} epubcfi
   */
  toString(): string {
    let cfiString = 'epubcfi('

    cfiString += this.segmentString(this.base)

    cfiString += '!'
    cfiString += this.segmentString(this.path)

    // Add Range, if present
    if (this.range && this.start) {
      cfiString += ','
      cfiString += this.segmentString(this.start)
    }

    if (this.range && this.end) {
      cfiString += ','
      cfiString += this.segmentString(this.end)
    }

    cfiString += ')'

    return cfiString
  }

  /**
   * Compare which of two CFIs is earlier in the text
   * @returns {number} First is earlier = -1, Second is earlier = 1, They are equal = 0
   */
  compare(cfiOne: string | EpubCFI, cfiTwo: string | EpubCFI): number {
    let stepsA: CFIStep[], stepsB: CFIStep[]
    let terminalA: CFITerminal, terminalB: CFITerminal

    if (typeof cfiOne === 'string') {
      cfiOne = new EpubCFI(cfiOne)
    }
    if (typeof cfiTwo === 'string') {
      cfiTwo = new EpubCFI(cfiTwo)
    }

    const cfi1 = cfiOne as EpubCFI
    const cfi2 = cfiTwo as EpubCFI

    // Compare Spine Positions
    if (cfi1.spinePos > cfi2.spinePos) {
      return 1
    }
    if (cfi1.spinePos < cfi2.spinePos) {
      return -1
    }

    if (cfi1.range) {
      stepsA = cfi1.path.steps.concat(cfi1.start!.steps)
      terminalA = cfi1.start!.terminal
    } else {
      stepsA = cfi1.path.steps
      terminalA = cfi1.path.terminal
    }

    if (cfi2.range) {
      stepsB = cfi2.path.steps.concat(cfi2.start!.steps)
      terminalB = cfi2.start!.terminal
    } else {
      stepsB = cfi2.path.steps
      terminalB = cfi2.path.terminal
    }

    // Compare Each Step in the First item
    for (let i = 0; i < stepsA.length; i++) {
      if (!stepsA[i]) {
        return -1
      }
      if (!stepsB[i]) {
        return 1
      }
      if (stepsA[i].index > stepsB[i].index) {
        return 1
      }
      if (stepsA[i].index < stepsB[i].index) {
        return -1
      }
      // Otherwise continue checking
    }

    // All steps in First equal to Second and First is Less Specific
    if (stepsA.length < stepsB.length) {
      return -1
    }

    // Compare the character offset of the text node
    if (terminalA.offset! > terminalB.offset!) {
      return 1
    }
    if (terminalA.offset! < terminalB.offset!) {
      return -1
    }

    // CFI's are equal
    return 0
  }

  step(node: Node): CFIStep {
    const nodeType = node.nodeType === TEXT_NODE ? 'text' : 'element'

    return {
      id: (node as Element).id,
      tagName: (node as Element).tagName,
      type: nodeType,
      index: this.position(node)
    }
  }

  filteredStep(node: Node, ignoreClass?: string): CFIStep | undefined {
    const filteredNode = this.filter(node, ignoreClass)
    const nodeType: 'text' | 'element' =
      filteredNode && filteredNode.nodeType === TEXT_NODE ? 'text' : 'element'

    // Node filtered, so ignore
    if (!filteredNode) {
      return
    }

    // Otherwise add the filter node in
    return {
      id: (filteredNode as Element).id,
      tagName: (filteredNode as Element).tagName,
      type: nodeType,
      index: this.filteredPosition(filteredNode, ignoreClass || '')
    }
  }

  pathTo(node: Node, offset: number | null, ignoreClass?: string): CFIComponent {
    const segment: CFIComponent = {
      steps: [],
      terminal: {
        offset: null,
        assertion: null
      }
    }

    let currentNode: Node | null = node
    let step: CFIStep | undefined

    while (
      currentNode &&
      currentNode.parentNode &&
      currentNode.parentNode.nodeType !== DOCUMENT_NODE
    ) {
      if (ignoreClass) {
        step = this.filteredStep(currentNode, ignoreClass)
      } else {
        step = this.step(currentNode)
      }

      if (step) {
        segment.steps.unshift(step)
      }

      currentNode = currentNode.parentNode
    }

    if (offset !== null && offset >= 0) {
      segment.terminal.offset = offset

      // Make sure we are getting to a textNode if there is an offset
      if (segment.steps[segment.steps.length - 1].type !== 'text') {
        segment.steps.push({
          type: 'text',
          index: 0
        })
      }
    }

    return segment
  }

  equalStep(stepA: CFIStep | undefined, stepB: CFIStep | undefined): boolean {
    if (!stepA || !stepB) {
      return false
    }

    if (stepA.index === stepB.index && stepA.id === stepB.id && stepA.type === stepB.type) {
      return true
    }

    return false
  }

  /**
   * Create a CFI object from a Range
   * @param {Range} range
   * @param {string | object} base
   * @param {string} [ignoreClass]
   * @returns {object} cfi
   */
  fromRange(range: Range, base: string | CFIComponent, ignoreClass?: string): Partial<CFIObject> {
    const cfi: Partial<CFIObject> = {
      range: false,
      base: { steps: [], terminal: { offset: null, assertion: null } },
      path: { steps: [], terminal: { offset: null, assertion: null } },
      start: null,
      end: null
    }

    const start = range.startContainer
    const end = range.endContainer

    let startOffset = range.startOffset
    let endOffset = range.endOffset

    let needsIgnoring = false
    const normalizedIgnoreClass = ignoreClass || ''

    if (ignoreClass) {
      // Tell pathTo if / what to ignore
      needsIgnoring = start.ownerDocument!.querySelector('.' + ignoreClass) !== null
    }

    if (typeof base === 'string') {
      cfi.base = this.parseComponent(base)
      cfi.spinePos = (cfi.base as CFIComponent).steps[1].index
    } else if (typeof base === 'object') {
      cfi.base = base
    }

    if (range.collapsed) {
      if (needsIgnoring) {
        startOffset = this.patchOffset(start, startOffset, normalizedIgnoreClass)
      }
      cfi.path = this.pathTo(start, startOffset, ignoreClass)
    } else {
      cfi.range = true

      if (needsIgnoring) {
        startOffset = this.patchOffset(start, startOffset, normalizedIgnoreClass)
      }

      cfi.start = this.pathTo(start, startOffset, ignoreClass)
      if (needsIgnoring) {
        endOffset = this.patchOffset(end, endOffset, normalizedIgnoreClass)
      }

      cfi.end = this.pathTo(end, endOffset, ignoreClass)

      // Create a new empty path
      cfi.path = {
        steps: [],
        terminal: { offset: null, assertion: null }
      }

      // Push steps that are shared between start and end to the common path
      const len = (cfi.start as CFIComponent).steps.length
      let i: number

      for (i = 0; i < len; i++) {
        if (
          this.equalStep((cfi.start as CFIComponent).steps[i], (cfi.end as CFIComponent).steps[i])
        ) {
          if (i === len - 1) {
            // Last step is equal, check terminals
            if ((cfi.start as CFIComponent).terminal === (cfi.end as CFIComponent).terminal) {
              // CFI's are equal
              ;(cfi.path as CFIComponent).steps.push((cfi.start as CFIComponent).steps[i])
              // Not a range
              cfi.range = false
            }
          } else {
            ;(cfi.path as CFIComponent).steps.push((cfi.start as CFIComponent).steps[i])
          }
        } else {
          break
        }
      }

      ;(cfi.start as CFIComponent).steps = (cfi.start as CFIComponent).steps.slice(
        (cfi.path as CFIComponent).steps.length
      )
      ;(cfi.end as CFIComponent).steps = (cfi.end as CFIComponent).steps.slice(
        (cfi.path as CFIComponent).steps.length
      )

      // TODO: Add Sanity check to make sure that the end if greater than the start
    }

    return cfi
  }

  /**
   * Create a CFI object from a Node
   * @param {Node} anchor
   * @param {string | object} base
   * @param {string} [ignoreClass]
   * @returns {object} cfi
   */
  fromNode(anchor: Node, base: string | CFIComponent, ignoreClass?: string): Partial<CFIObject> {
    const cfi: Partial<CFIObject> = {
      range: false,
      base: { steps: [], terminal: { offset: null, assertion: null } },
      path: { steps: [], terminal: { offset: null, assertion: null } },
      start: null,
      end: null
    }

    if (typeof base === 'string') {
      cfi.base = this.parseComponent(base)
      cfi.spinePos = (cfi.base as CFIComponent).steps[1].index
    } else if (typeof base === 'object') {
      cfi.base = base
    }

    cfi.path = this.pathTo(anchor, null, ignoreClass)

    return cfi
  }

  filter(anchor: Node, ignoreClass?: string): Node | false {
    let needsIgnoring: boolean
    let sibling: Node | undefined // to join with
    let parent: Node | null = null
    let previousSibling: Node | null, nextSibling: Node | null
    let isText = false

    if (anchor.nodeType === TEXT_NODE) {
      isText = true
      parent = anchor.parentNode
      needsIgnoring = (parent as Element).classList.contains(ignoreClass!)
    } else {
      isText = false
      needsIgnoring = (anchor as Element).classList.contains(ignoreClass!)
    }

    if (needsIgnoring && isText && parent) {
      previousSibling = parent.previousSibling
      nextSibling = parent.nextSibling

      // If the sibling is a text node, join the nodes
      if (previousSibling && previousSibling.nodeType === TEXT_NODE) {
        sibling = previousSibling
      } else if (nextSibling && nextSibling.nodeType === TEXT_NODE) {
        sibling = nextSibling
      }

      if (sibling) {
        return sibling
      } else {
        // Parent will be ignored on next step
        return anchor
      }
    } else if (needsIgnoring && !isText) {
      // Otherwise just skip the element node
      return false
    } else {
      // No need to filter
      return anchor
    }
  }

  patchOffset(anchor: Node, offset: number, ignoreClass: string): number {
    if (anchor.nodeType !== TEXT_NODE) {
      throw new Error('Anchor must be a text node')
    }

    let curr: Node = anchor
    let totalOffset = offset

    // If the parent is a ignored node, get offset from it's start
    if ((anchor.parentNode as Element).classList.contains(ignoreClass)) {
      curr = anchor.parentNode!
    }

    while ((curr as Element).previousSibling) {
      if ((curr as Element).previousSibling!.nodeType === ELEMENT_NODE) {
        const prevSibling = (curr as Element).previousSibling as Element
        // Originally a text node, so join
        if (prevSibling.classList.contains(ignoreClass)) {
          totalOffset += prevSibling.textContent!.length
        } else {
          break // Normal node, dont join
        }
      } else {
        // If the previous sibling is a text node, join the nodes
        totalOffset += ((curr as Element).previousSibling as ChildNode).textContent!.length
      }

      curr = (curr as Element).previousSibling!
    }

    return totalOffset
  }

  normalizedMap(
    children: NodeListOf<ChildNode>,
    nodeType: number,
    ignoreClass: string
  ): { [key: number]: number } {
    const output: { [key: number]: number } = {}
    let prevIndex = -1
    const len = children.length
    let i: number
    let currNodeType: number
    let prevNodeType = -1

    for (i = 0; i < len; i++) {
      currNodeType = children[i].nodeType

      // Check if needs ignoring
      if (
        currNodeType === ELEMENT_NODE &&
        (children[i] as Element).classList.contains(ignoreClass)
      ) {
        currNodeType = TEXT_NODE
      }

      if (i > 0 && currNodeType === TEXT_NODE && prevNodeType === TEXT_NODE) {
        // join text nodes
        output[i] = prevIndex
      } else if (nodeType === currNodeType) {
        prevIndex = prevIndex + 1
        output[i] = prevIndex
      }

      prevNodeType = currNodeType
    }

    return output
  }

  position(anchor: Node): number {
    let children: HTMLCollection | Node[], index: number
    if (anchor.nodeType === ELEMENT_NODE) {
      children = (anchor.parentNode as Element).children
      if (!children) {
        children = findChildren(anchor.parentNode as Element)
      }
      index = Array.prototype.indexOf.call(children, anchor)
    } else {
      children = this.textNodes(anchor.parentNode as Element)
      index = children.indexOf(anchor)
    }

    return index
  }

  filteredPosition(anchor: Node, ignoreClass: string): number {
    let children: NodeListOf<ChildNode>, map: { [key: number]: number }

    if (anchor.nodeType === ELEMENT_NODE) {
      const childNodes = (anchor.parentNode as Element).children
      children = childNodes as unknown as NodeListOf<ChildNode>
      map = this.normalizedMap(children, ELEMENT_NODE, ignoreClass)
    } else {
      children = anchor.parentNode!.childNodes
      // Inside an ignored node
      if ((anchor.parentNode as Element).classList.contains(ignoreClass)) {
        anchor = anchor.parentNode!
        children = anchor.parentNode!.childNodes
      }
      map = this.normalizedMap(children, TEXT_NODE, ignoreClass)
    }

    const index = Array.prototype.indexOf.call(children, anchor)

    return map[index]
  }

  stepsToXpath(steps: CFIStep[]): string {
    const xpath = ['.', '*']

    steps.forEach((step) => {
      const position = step.index + 1

      if (step.id) {
        xpath.push('*[position()=' + position + " and @id='" + step.id + "']")
      } else if (step.type === 'text') {
        xpath.push('text()[' + position + ']')
      } else {
        xpath.push('*[' + position + ']')
      }
    })

    return xpath.join('/')
  }

  stepsToQuerySelector(steps: CFIStep[]): string {
    const query = ['html']

    steps.forEach((step) => {
      const position = step.index + 1

      if (step.id) {
        query.push('#' + step.id)
      } else if (step.type === 'text') {
        // unsupported in querySelector
        // query.push("text()[" + position + "]");
      } else {
        query.push('*:nth-child(' + position + ')')
      }
    })

    return query.join('>')
  }

  textNodes(container: Element, ignoreClass?: string): Node[] {
    return Array.prototype.slice.call(container.childNodes).filter((node: Node) => {
      if (node.nodeType === TEXT_NODE) {
        return true
      } else if (ignoreClass && (node as Element).classList.contains(ignoreClass)) {
        return true
      }
      return false
    })
  }

  walkToNode(steps: CFIStep[], doc?: Document, ignoreClass?: string): Node | null {
    const document = doc || globalThis.document
    let container: Element = document.documentElement
    let children: HTMLCollection | Node[]
    let step: CFIStep
    const len = steps.length
    let i: number

    for (i = 0; i < len; i++) {
      step = steps[i]

      if (step.type === 'element') {
        //better to get a container using id as some times step.index may not be correct
        //For ex.https://github.com/futurepress/epub.js/issues/561
        if (step.id) {
          container = document.getElementById(step.id)!
        } else {
          children = container.children || findChildren(container)
          container = children[step.index] as Element
        }
      } else if (step.type === 'text') {
        container = this.textNodes(container, ignoreClass)[step.index] as unknown as Element
      }
      if (!container) {
        //Break the for loop as due to incorrect index we can get error if
        //container is undefined so that other functionailties works fine
        //like navigation
        break
      }
    }

    return container
  }

  findNode(steps: CFIStep[], doc?: Document, ignoreClass?: string): Node | null {
    const document = doc || globalThis.document
    let container: Node | null
    let xpath: string

    if (!ignoreClass && typeof document.evaluate !== 'undefined') {
      xpath = this.stepsToXpath(steps)
      container = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      ).singleNodeValue
    } else if (ignoreClass) {
      container = this.walkToNode(steps, document, ignoreClass)
    } else {
      container = this.walkToNode(steps, document)
    }

    return container
  }

  fixMiss(steps: CFIStep[], offset: number, doc?: Document, ignoreClass?: string): CFIFixResult {
    const container = this.findNode(steps.slice(0, -1), doc, ignoreClass)
    const children = container!.childNodes
    const map = this.normalizedMap(children as NodeListOf<ChildNode>, TEXT_NODE, ignoreClass || '')
    let child: Node
    let len: number
    const lastStepIndex = steps[steps.length - 1].index

    for (const childIndex in map) {
      if (!Object.prototype.hasOwnProperty.call(map, childIndex)) continue

      if (map[childIndex] === lastStepIndex) {
        child = children[parseInt(childIndex)]
        len = child.textContent!.length
        if (offset > len) {
          offset = offset - len
        } else {
          if (child.nodeType === ELEMENT_NODE) {
            return {
              container: child.childNodes[0],
              offset: offset
            }
          } else {
            return {
              container: child,
              offset: offset
            }
          }
        }
      }
    }

    return {
      container: container!,
      offset: offset
    }
  }

  /**
   * Creates a DOM range representing a CFI
   * @param {document} _doc document referenced in the base
   * @param {string} [ignoreClass]
   * @return {Range}
   */
  toRange(_doc?: Document, ignoreClass?: string): Range | null {
    const doc = _doc || globalThis.document
    let range: Range
    let start: CFIComponent,
      end: CFIComponent | undefined,
      startContainer: Node | null = null,
      endContainer: Node | null = null
    let startSteps: CFIStep[], endSteps: CFIStep[] | undefined
    const needsIgnoring = ignoreClass ? doc.querySelector('.' + ignoreClass) !== null : false
    let missed: CFIFixResult

    if (typeof doc.createRange !== 'undefined') {
      range = doc.createRange()
    } else {
      range = new (RangeObject as unknown as typeof Range)()
    }

    if (this.range) {
      start = this.start!
      startSteps = this.path.steps.concat(start.steps)
      startContainer = this.findNode(startSteps, doc, needsIgnoring ? ignoreClass : undefined)
      end = this.end!
      endSteps = this.path.steps.concat(end.steps)
      endContainer = this.findNode(endSteps, doc, needsIgnoring ? ignoreClass : undefined)
    } else {
      start = this.path
      startSteps = this.path.steps
      startContainer = this.findNode(this.path.steps, doc, needsIgnoring ? ignoreClass : undefined)
    }

    if (startContainer) {
      try {
        if (start.terminal.offset !== null) {
          range.setStart(startContainer, start.terminal.offset)
        } else {
          range.setStart(startContainer, 0)
        }
      } catch (e) {
        missed = this.fixMiss(
          startSteps,
          start.terminal.offset!,
          doc,
          needsIgnoring ? ignoreClass : undefined
        )
        range.setStart(missed.container, missed.offset)
      }
    } else {
      console.log('No startContainer found for', this.toString())
      // No start found
      return null
    }

    if (endContainer) {
      try {
        if (end!.terminal.offset !== null) {
          range.setEnd(endContainer, end!.terminal.offset)
        } else {
          range.setEnd(endContainer, 0)
        }
      } catch (e) {
        missed = this.fixMiss(
          endSteps!,
          this.end!.terminal.offset!,
          doc,
          needsIgnoring ? ignoreClass : undefined
        )
        range.setEnd(missed.container, missed.offset)
      }
    }

    return range
  }

  /**
   * Check if a string is wrapped with "epubcfi()"
   * @param {string} str
   * @returns {boolean}
   */
  isCfiString(str: unknown): boolean {
    if (typeof str === 'string' && str.indexOf('epubcfi(') === 0 && str[str.length - 1] === ')') {
      return true
    }

    return false
  }

  generateChapterComponent(_spineNodeIndex: number, _pos: number, id?: string): string {
    const pos = parseInt(String(_pos))
    const spineNodeIndex = (_spineNodeIndex + 1) * 2
    let cfi = `/${spineNodeIndex}/`

    cfi += String((pos + 1) * 2)

    if (id) {
      cfi += `[${id}]`
    }

    return cfi
  }

  /**
   * Collapse a CFI Range to a single CFI Position
   * @param {boolean} [toStart=false]
   */
  collapse(toStart?: boolean): void {
    if (!this.range) {
      return
    }

    this.range = false

    if (toStart) {
      this.path.steps = this.path.steps.concat(this.start!.steps)
      this.path.terminal = this.start!.terminal
    } else {
      this.path.steps = this.path.steps.concat(this.end!.steps)
      this.path.terminal = this.end!.terminal
    }
  }
}

export default EpubCFI
