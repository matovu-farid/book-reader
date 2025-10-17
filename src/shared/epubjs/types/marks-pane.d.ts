declare module 'marks-pane' {
  export class Pane {
    constructor(iframe: HTMLIFrameElement, element: HTMLElement)
    render(): void
    addMark(mark: any): any
    removeMark(mark: any): void
    element: HTMLElement
  }

  export class Highlight {
    constructor(range: Range, className: string, data: any, attributes: any)
  }

  export class Underline {
    constructor(range: Range, className: string, data: any, attributes: any)
  }
}
