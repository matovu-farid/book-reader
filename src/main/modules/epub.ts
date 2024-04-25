import path from 'path'
import getEpubCover from 'get-epub-cover'
import AdmZip from 'adm-zip'
import { app } from 'electron'

function unzipEpub(filePath): string {
  const outputDir = path.join(app.getPath('appData'), 'public', filePath) // Crea
  const zip = new AdmZip(filePath)
  zip.extractAllTo(outputDir, true)
  return outputDir
}
export default async function getCoverImage(filePath: string): Promise<string | null> {
  return getEpubCover(unzipEpub(filePath))
    .then((data) => {
      return data
    })
    .catch((err) => {
      console.log('Failed to get cover image', err)
      return null
    })
}
