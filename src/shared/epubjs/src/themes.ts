/**
 * Themes module for EPUB rendering
 */

import Rendition from './rendition'
import Url from './utils/url'
import Contents from './contents'

type CSSRuleObject = Record<string, string | number | boolean>
type CSSRulesObject = Record<string, CSSRuleObject | CSSRuleObject[]>
type CSSRuleArray = [string, string | number | boolean, boolean?][]

interface ThemeDefinition {
  rules?: CSSRuleArray[] | CSSRulesObject
  url?: string
  serialized?: string
  injected?: boolean
}

interface OverrideDefinition {
  value: string
  priority: boolean
}

class Themes {
  rendition: Rendition
  _themes: Record<string, ThemeDefinition>
  _overrides: Record<string, OverrideDefinition>
  _current: string
  _injected: string[]

  constructor(rendition: Rendition) {
    this.rendition = rendition
    this._themes = {
      default: {
        rules: {},
        url: '',
        serialized: ''
      }
    }
    this._overrides = {}
    this._current = 'default'
    this._injected = []
    this.rendition.hooks.content.register(this.inject.bind(this))
    this.rendition.hooks.content.register(this.overrides.bind(this))
  }

  /**
   * Add themes to be used by a rendition
   * @param {object | Array<object> | string}
   * @example themes.register("light", "http://example.com/light.css")
   * @example themes.register("light", { "body": { "color": "purple"}})
   * @example themes.register({ "light" : {...}, "dark" : {...}})
   */
  register(...args: unknown[]): void {
    if (args.length === 0) {
      return
    }
    if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
      return this.registerThemes(
        args[0] as Record<string, string | CSSRuleArray[] | CSSRulesObject>
      )
    }
    if (args.length === 1 && typeof args[0] === 'string') {
      return this.default(args[0])
    }
    if (args.length === 2 && typeof args[0] === 'string' && typeof args[1] === 'string') {
      return this.registerUrl(args[0], args[1])
    }
    if (
      args.length === 2 &&
      typeof args[0] === 'string' &&
      typeof args[1] === 'object' &&
      args[1] !== null
    ) {
      return this.registerRules(args[0], args[1] as CSSRuleArray[] | CSSRulesObject)
    }
  }

  /**
   * Add a default theme to be used by a rendition
   * @param {object | string} theme
   * @example themes.register("http://example.com/default.css")
   * @example themes.register({ "body": { "color": "purple"}})
   */
  default(theme: string | CSSRuleArray[] | CSSRulesObject): void {
    if (!theme) {
      return
    }
    if (typeof theme === 'string') {
      return this.registerUrl('default', theme)
    }
    if (typeof theme === 'object') {
      return this.registerRules('default', theme)
    }
  }

  /**
   * Register themes object
   * @param {object} themes
   */
  registerThemes(themes: Record<string, string | CSSRuleArray[] | CSSRulesObject>): void {
    for (const theme in themes) {
      if (Object.prototype.hasOwnProperty.call(themes, theme)) {
        if (typeof themes[theme] === 'string') {
          this.registerUrl(theme, themes[theme] as string)
        } else {
          this.registerRules(theme, themes[theme] as CSSRuleArray[] | CSSRulesObject)
        }
      }
    }
  }

  /**
   * Register a theme by passing its css as string
   * @param {string} name
   * @param {string} css
   */
  registerCss(name: string, css: string): void {
    this._themes[name] = { serialized: css }
    if (this._injected.includes(name) || name == 'default') {
      this.update(name)
    }
  }

  /**
   * Register a url
   * @param {string} name
   * @param {string} input
   */
  registerUrl(name: string, input: string): void {
    const url = new Url(input)
    this._themes[name] = { url: url.toString() }
    if (this._injected.includes(name) || name == 'default') {
      this.update(name)
    }
  }

  /**
   * Register rule
   * @param {string} name
   * @param {object} rules
   */
  registerRules(name: string, rules: CSSRuleArray[] | CSSRulesObject): void {
    this._themes[name] = { rules: rules }
    // TODO: serialize css rules
    if (this._injected.includes(name) || name == 'default') {
      this.update(name)
    }
  }

  /**
   * Select a theme
   * @param {string} name
   */
  select(name: string): void {
    const prev = this._current

    this._current = name
    this.update(name)

    const contents = this.rendition.getContents()
    contents.forEach((content) => {
      content.removeClass(prev)
      content.addClass(name)
    })
  }

  /**
   * Update a theme
   * @param {string} name
   */
  update(name: string): void {
    const contents = this.rendition.getContents()
    contents.forEach((content) => {
      this.add(name, content)
    })
  }

  /**
   * Inject all themes into contents
   * @param {Contents} contents
   */
  inject(contents: Contents): void {
    const links: string[] = []
    const themes = this._themes
    let theme

    for (const name in themes) {
      if (
        Object.prototype.hasOwnProperty.call(themes, name) &&
        (name === this._current || name === 'default')
      ) {
        theme = themes[name]
        if (
          (theme.rules && Object.keys(theme.rules).length > 0) ||
          (theme.url && links.indexOf(theme.url) === -1)
        ) {
          this.add(name, contents)
        }
        this._injected.push(name)
      }
    }

    if (this._current != 'default') {
      contents.addClass(this._current)
    }
  }

  /**
   * Add Theme to contents
   * @param {string} name
   * @param {Contents} contents
   */
  add(name: string, contents: Contents): void {
    const theme = this._themes[name]

    if (!theme || !contents) {
      return
    }

    if (theme.url) {
      contents.addStylesheet(theme.url)
    } else if (theme.serialized) {
      contents.addStylesheetCss(theme.serialized, name)
      theme.injected = true
    } else if (theme.rules) {
      contents.addStylesheetRules(theme.rules, name)
      theme.injected = true
    }
  }

  /**
   * Add override
   * @param {string} name
   * @param {string} value
   * @param {boolean} priority
   */
  override(name: string, value: string | number, priority?: boolean): void {
    const contents = this.rendition.getContents()
    const valueStr = typeof value === 'number' ? value.toString() : value

    this._overrides[name] = {
      value: valueStr,
      priority: priority === true
    }

    contents.forEach((content) => {
      content.css(name, this._overrides[name].value, this._overrides[name].priority)
    })
  }

  removeOverride(name: string): void {
    const contents = this.rendition.getContents()

    delete this._overrides[name]

    contents.forEach((content) => {
      content.css(name)
    })
  }

  /**
   * Add all overrides
   * @param {Content} content
   */
  overrides(contents: Contents): void {
    const overrides = this._overrides

    for (const rule in overrides) {
      if (Object.prototype.hasOwnProperty.call(overrides, rule)) {
        contents.css(rule, overrides[rule].value, overrides[rule].priority)
      }
    }
  }

  /**
   * Adjust the font size of a rendition
   * @param {number} size
   */
  fontSize(size: string | number): void {
    this.override('font-size', size, false)
  }

  /**
   * Adjust the font-family of a rendition
   * @param {string} f
   */
  font(f: string): void {
    this.override('font-family', f, true)
  }

  destroy(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.rendition = undefined as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this._themes = undefined as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this._overrides = undefined as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this._current = undefined as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this._injected = undefined as any
  }
}

export default Themes
