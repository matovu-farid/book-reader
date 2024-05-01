import { getEpubCover } from 'src/main/modules/getEpubCover'
import { getManifestFiles } from 'src/main/modules/__mocks__/getManifestFiles'
import { it, describe, expect, vi } from 'vitest'

vi.mock('../../../main/modules/getManifestFiles.ts')

describe('getEbubCover', () => {
  it('should ebup cover link', async () => {
    const { opfFileObj } = await getManifestFiles('bookFolder')
    const cover = await getEpubCover(opfFileObj)
    console.log({ cover })
    expect(cover).toBe('cover.jpg')
  })

  it('should return empty string if the cover is not found', async () => {
    const { opfFileObj } = await getManifestFiles('bookFolder')

    opfFileObj.manifest.item[0]._attributes['media-type'] = 'text/plain'

    const cover = await getEpubCover(opfFileObj)
    expect(cover).toBe('')
  })
})
