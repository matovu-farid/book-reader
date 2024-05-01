export interface ManifestAttr {
  id: string
  href: string
  'media-type': string
  properties?: Record<string, string>
}

export interface OPF {
  package: {
    metadata: { 'dc:title': { _text: string } }
    manifest: { item: { _attributes: ManifestAttr }[] }
    spine: { itemref: { _attributes: { idref: string } }[] }
    guide: unknown
  }
}

export interface Container {
  container: {
    rootfiles: {
      rootfile: { _attributes: { 'full-path': string } }
    }
  }
}

export type Asset = 'css' | 'font' | 'xml' | 'other'
export interface Book {
  currentBookId: string | number
  cover: string
  spine: { idref: string; route: string; mediaType: string }[]
  title: string
  id: string
  internalFolderName: string
  assets: Partial<Record<Asset, ManifestAttr[]>>
  epubUrl: string
}

export interface Store {
  currentBookId: string | number
  epubUrl: string
}
export type OPFFileObj = OPF['package']
