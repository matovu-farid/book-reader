import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('functions', {
      getCoverImage: (filePath: string) => ipcRenderer.invoke('getCoverImage', filePath),
      getBooks: () => ipcRenderer.invoke('getBooks'),
      updateCurrentBookId: (bookFolder: string, currentBookId: number) =>
        ipcRenderer.invoke('updateCurrentBookId', bookFolder, currentBookId),
      deleteBook: (bookFolder: string) => ipcRenderer.invoke('deleteBook', bookFolder)
    })
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
