interface View {
  element: Element
  displayed?: boolean
  section?: {
    index: number
  }
  destroy(): void
  show(): void
  hide(): void
}

class Views {
  private container: Element | null
  private _views: View[]
  public length: number
  public hidden: boolean

  constructor(container: Element | null) {
    this.container = container
    this._views = []
    this.length = 0
    this.hidden = false
  }

  all(): View[] {
    return this._views
  }

  first(): View | undefined {
    return this._views[0]
  }

  last(): View | undefined {
    return this._views[this._views.length - 1]
  }

  indexOf(view: View): number {
    return this._views.indexOf(view)
  }

  slice(...args: any[]): View[] {
    return this._views.slice.apply(this._views, args)
  }

  get(i: number): View | undefined {
    return this._views[i]
  }

  append(view: View): View {
    this._views.push(view)
    if (this.container) {
      this.container.appendChild(view.element)
    }
    this.length++
    return view
  }

  prepend(view: View): View {
    this._views.unshift(view)
    if (this.container) {
      this.container.insertBefore(view.element, this.container.firstChild)
    }
    this.length++
    return view
  }

  insert(view: View, index: number): View {
    this._views.splice(index, 0, view)

    if (this.container) {
      if (index < this.container.children.length) {
        this.container.insertBefore(view.element, this.container.children[index])
      } else {
        this.container.appendChild(view.element)
      }
    }

    this.length++
    return view
  }

  remove(view: View): void {
    const index = this._views.indexOf(view)

    if (index > -1) {
      this._views.splice(index, 1)
    }

    this.destroy(view)

    this.length--
  }

  destroy(view: View): void {
    if (view.displayed) {
      view.destroy()
    }

    if (this.container) {
      this.container.removeChild(view.element)
    }
  }

  // Iterators

  forEach(...args: any[]): void {
    return this._views.forEach.apply(this._views, args)
  }

  clear(): void {
    // Remove all views
    const len = this.length

    if (!this.length) return

    for (let i = 0; i < len; i++) {
      const view = this._views[i]
      this.destroy(view)
    }

    this._views = []
    this.length = 0
  }

  find(section: { index: number }): View | undefined {
    const len = this.length

    for (let i = 0; i < len; i++) {
      const view = this._views[i]
      if (view.displayed && view.section && view.section.index === section.index) {
        return view
      }
    }

    return undefined
  }

  displayed(): View[] {
    const displayed: View[] = []
    const len = this.length

    for (let i = 0; i < len; i++) {
      const view = this._views[i]
      if (view.displayed) {
        displayed.push(view)
      }
    }
    return displayed
  }

  show(): void {
    const len = this.length

    for (let i = 0; i < len; i++) {
      const view = this._views[i]
      if (view.displayed) {
        view.show()
      }
    }
    this.hidden = false
  }

  hide(): void {
    const len = this.length

    for (let i = 0; i < len; i++) {
      const view = this._views[i]
      if (view.displayed) {
        view.hide()
      }
    }
    this.hidden = true
  }
}

export default Views
