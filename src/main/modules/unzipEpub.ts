import path from 'path'
import AdmZip from 'adm-zip'
import fs from 'fs/promises'
import { getRouteFromRelativePath } from './getRouteFromRelativePath'
import { getBookPath } from './getBookPath'
import { updateBookStore } from './getBookStore'

export async function unzipEpub(filePath: string, outDir: string): Promise<string> {
  const outputDirUrl = path.join(getBookPath(), outDir) // Crea

  const zip = new AdmZip(filePath)

  zip.extractAllTo(outputDirUrl, true)

  const newZipFilePath = path.join(outputDirUrl, path.basename(filePath))
  fs.copyFile(filePath, newZipFilePath).then(() => {
    console.log('File was copied to destination', newZipFilePath)
    const epubUrl = getRouteFromRelativePath(outDir, path.basename(filePath))

    updateBookStore({ epubUrl }, outDir)
  })
  return outputDirUrl
}
