import { qs } from './core'
import Url from './url'

interface Section {
  url: string
  canonical?: string
  idref?: string
}

export function replaceBase(doc: Document, section: Section): void {
  const head = qs(doc.documentElement, 'head')
  const url = section.url
  const absolute = url.indexOf('://') > -1

  if (!doc || !head) {
    return
  }

  let base = qs(head, 'base')

  if (!base) {
    base = doc.createElement('base')
    head.insertBefore(base, head.firstChild)
  }

  // Fix for Safari crashing if the url doesn't have an origin
  if (!absolute && typeof window !== 'undefined' && window.location) {
    base.setAttribute('href', window.location.origin + url)
  } else {
    base.setAttribute('href', url)
  }
}

export function replaceCanonical(doc: Document, section: Section): void {
  const head = qs(doc.documentElement, 'head')
  const url = section.canonical

  if (!doc || !head || !url) {
    return
  }

  let link = qs(head, "link[rel='canonical']")

  if (link) {
    link.setAttribute('href', url)
  } else {
    link = doc.createElement('link')
    link.setAttribute('rel', 'canonical')
    link.setAttribute('href', url)
    head.appendChild(link)
  }
}

export function replaceMeta(doc: Document, section: Section): void {
  const head = qs(doc.documentElement, 'head')
  const id = section.idref

  if (!doc || !head || !id) {
    return
  }

  let meta = qs(head, "link[property='dc.identifier']")

  if (meta) {
    meta.setAttribute('content', id)
  } else {
    meta = doc.createElement('meta')
    meta.setAttribute('name', 'dc.identifier')
    meta.setAttribute('content', id)
    head.appendChild(meta)
  }
}

// TODO: move me to Contents
export function replaceLinks(contents: Element, fn: (href: string) => void): void {
  const links = contents.querySelectorAll('a[href]')

  if (!links.length) {
    return
  }

  const base = qs(contents.ownerDocument!.documentElement, 'base')
  const location = base ? base.getAttribute('href') : undefined

  const replaceLink = function (link: Element): void {
    const href = link.getAttribute('href')
    if (!href) return

    if (href.indexOf('mailto:') === 0) {
      return
    }

    const absolute = href.indexOf('://') > -1

    if (absolute) {
      link.setAttribute('target', '_blank')
    } else {
      let linkUrl: Url | undefined
      try {
        linkUrl = new Url(href, location || false)
      } catch (error) {
        // NOOP
      }

      if (link instanceof HTMLAnchorElement) {
        link.onclick = function () {
          if (linkUrl && linkUrl.hash) {
            fn(linkUrl.path().path + linkUrl.hash)
          } else if (linkUrl) {
            fn(linkUrl.path().path)
          } else {
            fn(href)
          }

          return false
        }
      }
    }
  }

  for (let i = 0; i < links.length; i++) {
    replaceLink(links[i])
  }
}

export function substitute(content: string, urls: string[], replacements: string[]): string {
  urls.forEach(function (url, i) {
    if (url && replacements[i]) {
      // Account for special characters in the file name.
      // See https://stackoverflow.com/a/6318729.
      const escapedUrl = url.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')
      content = content.replace(new RegExp(escapedUrl, 'g'), replacements[i])
    }
  })
  return content
}
