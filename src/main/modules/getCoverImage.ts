import md5 from 'md5'
import fs from 'fs/promises'
import { filetypemime, filetypename } from 'magic-bytes.js'
import { getRouteFromRelativePath } from './getRouteFromRelativePath'
import { getEpubCover } from './getEpubCover'
import { getManifestFiles } from './getManifestFiles'
import { unzipEpub } from './unzipEpub'

export async function getCoverImage(filePath: string): Promise<string | null> {
  try {
    const bookFolder = md5(filePath)
    const { opfFileObj } = await getManifestFiles(bookFolder)
    const file = await fs.readFile(filePath)
    const types = filetypename(file)
    const mimes = filetypemime(file)
    const isEpubOrZip = types.some((type) => type === 'epub' || type === 'zip')
    if (!isEpubOrZip) {
      console.log({ types, mimes })
      return null
    }
    await unzipEpub(filePath, bookFolder)
    const cover = await getEpubCover(opfFileObj)
    const { workingFolder } = await getManifestFiles(bookFolder)

    return getRouteFromRelativePath(workingFolder, cover)
  } catch (e) {
    console.log(e)
    return null
  }
}
