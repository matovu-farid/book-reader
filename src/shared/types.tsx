export interface ManifestAttr {
  id: string
  href: string
  'media-type': string
  properties?: string
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

export type Asset = 'css' | 'font' | 'other'
export interface Book {
  currentBookId: number
  cover: string
  spine: { idref: string; route: string; mediaType: string }[]
  title: string
  id: string
  internalFolderName: string
  assets: Partial<Record<Asset, ManifestAttr[]>>
}

export interface Store {
  currentBookId: number
}
