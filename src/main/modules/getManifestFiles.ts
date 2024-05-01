import path from 'path'
import convert from 'xml-js'
import fs from 'fs/promises'
import type { ManifestAttr, OPF, Container } from '../../shared/types'
import { getBookPath } from './getBookPath'

export async function getManifestFiles(bookFolder: string) {
  const absoluteBookPath = path.join(getBookPath(), bookFolder)
  const containerPath = path.join(absoluteBookPath, 'META-INF', 'container.xml')
  const containerData = await fs.readFile(containerPath, 'utf8')
  const containerObj = convert.xml2js(containerData, { compact: true }) as Container
  const opfFilePath = containerObj.container.rootfiles.rootfile._attributes['full-path']
  const workingFolder = path.join(absoluteBookPath, path.dirname(opfFilePath))
  const opfFileData = await fs.readFile(path.join(absoluteBookPath, opfFilePath), 'utf8')
  const opf: OPF = convert.xml2js(opfFileData, { compact: true }) as OPF

  const opfFileObj = opf.package
  const manifest: ManifestAttr[] = opfFileObj.manifest.item.map((item) => item._attributes)
  return { manifest, opfFileObj, opfFilePath, workingFolder }
}
