import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { deleteBook, getBooks, updateCurrentBookId } from './modules/epub'
import { getCoverImage } from './modules/getCoverImage'
import { ttsService } from './modules/ttsService'
import './modules/express'
import {
  installExtension,
  REDUX_DEVTOOLS,
  REACT_DEVELOPER_TOOLS
} from 'electron-devtools-installer'
import config from './config.json'
import { IPC_HANDLERS, TTS_EVENTS } from './ipc_handles'

let mainWindow: BrowserWindow | null = null

async function createWindow(): Promise<void> {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 770,
    title: 'Rishi',
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev) {
    mainWindow.webContents.openDevTools()
  }
  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    await mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function iPCHandlers(): void {
  ipcMain.handle(IPC_HANDLERS.FILES_CHOOSE, async () => {
    if (!mainWindow) return []

    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'EPUB Books', extensions: ['epub'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (canceled) return []
    return filePaths // Returns real absolute paths
  })

  ipcMain.handle(IPC_HANDLERS.GET_COVER_IMAGE, (_, filePath) => getCoverImage(filePath))
  ipcMain.handle(IPC_HANDLERS.GET_BOOKS, () => getBooks())
  ipcMain.handle(
    IPC_HANDLERS.UPDATE_CURRENT_BOOK_ID,
    (_, bookFolder: string, currentBookId: string) => updateCurrentBookId(bookFolder, currentBookId)
  )
  ipcMain.handle(IPC_HANDLERS.DELETE_BOOK, (_, bookFolder: string) => deleteBook(bookFolder))

  // TTS handlers
  ipcMain.handle(
    IPC_HANDLERS.TTS_REQUEST_AUDIO,
    async (_, bookId: string, cfiRange: string, text: string, priority = 0) => {
      try {
        return await ttsService.requestAudio(bookId, cfiRange, text, priority)
      } catch (error) {
        console.error('TTS request failed:', error)
        throw error
      }
    }
  )

  ipcMain.handle(IPC_HANDLERS.TTS_GET_AUDIO_PATH, async (_, bookId: string, cfiRange: string) => {
    try {
      return await ttsService.getAudioPath(bookId, cfiRange)
    } catch (error) {
      console.error('Failed to get audio path:', error)
      return null
    }
  })


  ipcMain.handle(IPC_HANDLERS.TTS_SHOULD_DEBUG, (): boolean => {
    if (process.env.NODE_ENV === 'development') {
      return config.development.player.recordPlayingState
    }
    return config.production.player.recordPlayingState
  })

  ipcMain.handle(IPC_HANDLERS.TTS_GET_QUEUE_STATUS, () => {
    try {
      return ttsService.getQueueStatus()
    } catch (error) {
      console.error('Failed to get queue status:', error)
      return { pending: 0, isProcessing: false, active: 0 }
    }
  })

  ipcMain.handle(IPC_HANDLERS.TTS_CLEAR_BOOK_CACHE, async (_, bookId: string) => {
    try {
      await ttsService.clearBookCache(bookId)
    } catch (error) {
      console.error('Failed to clear book cache:', error)
      throw error
    }
  })

  ipcMain.handle(IPC_HANDLERS.TTS_GET_BOOK_CACHE_SIZE, async (_, bookId: string) => {
    try {
      return await ttsService.getBookCacheSize(bookId)
    } catch (error) {
      console.error('Failed to get book cache size:', error)
      return 0
    }
  })

  // Forward TTS events to renderer
  ttsService.on(TTS_EVENTS.AUDIO_READY, (event) => {
    mainWindow?.webContents.send(IPC_HANDLERS.TTS_AUDIO_READY, event)
  })

  // Forward TTS error events to renderer
  ttsService.on(TTS_EVENTS.ERROR, (event) => {
    mainWindow?.webContents.send(IPC_HANDLERS.TTS_ERROR, event)
  })
}
// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
void app.whenReady().then(() => {
  void installExtension([REDUX_DEVTOOLS, REACT_DEVELOPER_TOOLS]).then(() => {
    // Set app user model id for windows
    electronApp.setAppUserModelId('com.electron')

    // Default open or close DevTools by F12 in development
    // and ignore CommandOrControl + R in production.
    // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })
    iPCHandlers()

    void createWindow()

    app.on('activate', async function () {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (BrowserWindow.getAllWindows().length === 0) await createWindow()
    })
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
