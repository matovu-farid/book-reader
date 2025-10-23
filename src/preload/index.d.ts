import { Book } from 'src/shared/types'

interface TTSAudioReadyEvent {
  bookId: string
  cfiRange: string
  audioPath: string
}

interface ElectronEvent {
  sender: unknown
  senderId: number
}

type TTSCallback = (event: ElectronEvent, data: TTSAudioReadyEvent) => void

declare global {
  interface Window {
    api: unknown
    functions: {
      shouldDebug: () => Promise<boolean>
      chooseFiles: () => Promise<string[]>
      getCoverImage: (filePath: string) => Promise<string | null>
      getBooks: () => Promise<Book[]>
      updateCurrentBookId: (bookFolder: string, currentBookId: string) => Promise<void>
      deleteBook: (bookFolder: string) => Promise<void>
      // TTS functions
      requestTTSAudio: (
        bookId: string,
        cfiRange: string,
        text: string,
        priority?: number
      ) => Promise<string>
      getTTSAudioPath: (bookId: string, cfiRange: string) => Promise<string | null>
      getTTSQueueStatus: () => Promise<{ pending: number; isProcessing: boolean; active: number }>
      clearTTSCache: (bookId: string) => Promise<void>
      getTTSCacheSize: (bookId: string) => Promise<number>
      onTTSAudioReady: (callback: TTSCallback) => void
      removeTTSAudioReadyListener: (callback: TTSCallback) => void
    }
  }
}
