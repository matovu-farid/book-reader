import { ElectronAPI } from '@electron-toolkit/preload'
interface Book {
  cover: string
  spine: { idref: string; route: string; mediaType: string }[]
  title: string
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: unknown
    functions: {
      getCoverImage: (filePath: string) => Promise<string | null>
      getBooks: () => Promise<Book[]>
    }
  }
}
