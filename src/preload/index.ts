import { contextBridge, ipcRenderer } from 'electron'

// Custom APIs for renderer
const api = {}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
    contextBridge.exposeInMainWorld('functions', {
      chooseFiles: () => ipcRenderer.invoke('files:choose'),
      getCoverImage: (filePath: string) => ipcRenderer.invoke('getCoverImage', filePath),
      getBooks: () => ipcRenderer.invoke('getBooks'),
      updateCurrentBookId: (bookFolder: string, currentBookId: number) =>
        ipcRenderer.invoke('updateCurrentBookId', bookFolder, currentBookId),
      deleteBook: (bookFolder: string) => ipcRenderer.invoke('deleteBook', bookFolder),
      // TTS functions
      requestTTSAudio: (bookId: string, cfiRange: string, text: string, priority = 0) =>
        ipcRenderer.invoke('tts:request-audio', bookId, cfiRange, text, priority),
      getTTSAudioPath: (bookId: string, cfiRange: string) =>
        ipcRenderer.invoke('tts:get-audio-path', bookId, cfiRange),
      getTTSApiKeyStatus: () => ipcRenderer.invoke('tts:get-api-key-status'),
      shouldDebug: () => ipcRenderer.invoke('tts:should-debug'),
      getTTSQueueStatus: () => ipcRenderer.invoke('tts:get-queue-status'),
      clearTTSCache: (bookId: string) => ipcRenderer.invoke('tts:clear-book-cache', bookId),
      getTTSCacheSize: (bookId: string) => ipcRenderer.invoke('tts:get-book-cache-size', bookId),
      onTTSAudioReady: (callback: (event: any, data: any) => void) =>
        ipcRenderer.on('tts:audio-ready', callback),
      removeTTSAudioReadyListener: (callback: (event: any, data: any) => void) =>
        ipcRenderer.removeListener('tts:audio-ready', callback)
    })
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api
}
