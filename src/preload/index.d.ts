import { ElectronAPI } from '@electron-toolkit/preload'
import { Book } from 'src/shared/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: unknown
    functions: {
      getCoverImage: (filePath: string) => Promise<string | null>
      getBooks: () => Promise<Book[]>
      updateCurrentBookId: (bookFolder: string, currentBookId: string) => Promise<void>
    }
  }
}
