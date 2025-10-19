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

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
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
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.webContents.openDevTools()
  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function iPCHandlers(): void {
  ipcMain.handle('files:choose', async () => {
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

  ipcMain.handle('getCoverImage', (_, filePath) => getCoverImage(filePath))
  ipcMain.handle('getBooks', () => getBooks())
  ipcMain.handle('updateCurrentBookId', (_, bookFolder: string, currentBookId: string) =>
    updateCurrentBookId(bookFolder, currentBookId)
  )
  ipcMain.handle('deleteBook', (_, bookFolder: string) => deleteBook(bookFolder))

  // TTS handlers
  ipcMain.handle(
    'tts:request-audio',
    async (_, bookId: string, cfiRange: string, text: string, priority = 0) => {
      try {
        return await ttsService.requestAudio(bookId, cfiRange, text, priority)
      } catch (error) {
        console.error('TTS request failed:', error)
        throw error
      }
    }
  )

  ipcMain.handle('tts:get-audio-path', async (_, bookId: string, cfiRange: string) => {
    try {
      return await ttsService.getAudioPath(bookId, cfiRange)
    } catch (error) {
      console.error('Failed to get audio path:', error)
      return null
    }
  })

  ipcMain.handle('tts:get-api-key-status', () => {
    try {
      return ttsService.hasApiKey()
    } catch (error) {
      console.error('Failed to get API key status:', error)
      return false
    }
  })

  ipcMain.handle('tts:get-queue-status', () => {
    try {
      return ttsService.getQueueStatus()
    } catch (error) {
      console.error('Failed to get queue status:', error)
      return { pending: 0, isProcessing: false, active: 0 }
    }
  })

  ipcMain.handle('tts:clear-book-cache', async (_, bookId: string) => {
    try {
      await ttsService.clearBookCache(bookId)
    } catch (error) {
      console.error('Failed to clear book cache:', error)
      throw error
    }
  })

  ipcMain.handle('tts:get-book-cache-size', async (_, bookId: string) => {
    try {
      return await ttsService.getBookCacheSize(bookId)
    } catch (error) {
      console.error('Failed to get book cache size:', error)
      return 0
    }
  })

  // Forward TTS events to renderer
  ttsService.on('audio-ready', (event) => {
    mainWindow?.webContents.send('tts:audio-ready', event)
  })

  // Forward TTS error events to renderer
  ttsService.on('error', (event) => {
    mainWindow?.webContents.send('tts:error', event)
  })
}
// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  installExtension([REDUX_DEVTOOLS, REACT_DEVELOPER_TOOLS]).then(() => {
    // Set app user model id for windows
    electronApp.setAppUserModelId('com.electron')

    // Default open or close DevTools by F12 in development
    // and ignore CommandOrControl + R in production.
    // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })
    iPCHandlers()

    createWindow()

    app.on('activate', function () {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
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
