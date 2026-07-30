import { app, BrowserWindow, protocol, shell } from 'electron'
import { join } from 'node:path'
import { registerIpcHandlers } from './ipc'
import { registerQpxProtocol } from './qpxProtocol'
import { QPX_SCHEME } from '@shared/protocol'

// Must run before app.whenReady: grants qpx:// the privileges needed for
// <img> loading and fetch/streaming from the renderer.
protocol.registerSchemesAsPrivileged([
  {
    scheme: QPX_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: false }
  }
])

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#181818',
    autoHideMenuBar: true,
    title: 'QuickPix',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())

  // Open target="_blank" links (e.g. About → GitHub) in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerQpxProtocol()
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
