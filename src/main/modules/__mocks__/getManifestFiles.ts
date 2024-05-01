export async function getManifestFiles(bookFolder: string) {
  return {
    manifest: [],
    opfFileObj: {
      manifest: {
        item: [{ _attributes: { href: 'cover.jpg', 'media-type': 'image/jpeg', id: 'id' } }]
      },
      guide: {},
      metadata: { 'dc:title': { _text: 'title' } },
      spine: { itemref: [{ _attributes: { idref: 'id' } }] }
    },
    opfFilePath: '',
    workingFolder: bookFolder
  }
}
