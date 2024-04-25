import path from 'path'
import getEpubCover from 'get-epub-cover'
import AdmZip from 'adm-zip'
import { app } from 'electron'
import { PORT } from './express'
import md5 from 'md5'

function unzipEpub(filePath: string, outDir: string): string {
  const outputDirUrl = path.join(app.getPath('appData'), 'public', outDir) // Crea
  const zip = new AdmZip(filePath)
  zip.extractAllTo(outputDirUrl, true)
  return outputDirUrl
}
export default async function getCoverImage(filePath: string): Promise<string | null> {
  const outDir = md5(filePath)
  const outDirUrl = unzipEpub(filePath, outDir)
  return getEpubCover(outDirUrl)
    .then((fileUrl) => {
      const regex = /public\/(.*)$/
      const match = fileUrl.match(regex)
      if (!match) {
        return null
      }

      const strippedFileUrl = match[1]
      const route = `http://localhost:${PORT}/${strippedFileUrl}`
      return route
    })
    .catch((err) => {
      console.log('Failed to get cover image', err)
      return null
    })
}
