import { app, BrowserWindow, protocol, shell } from 'electron'
import { join } from 'node:path'
import { registerIpcHandlers } from './ipc'
import { registerQpxProtocol } from './qpxProtocol'
import { sweepCache } from './imageCache'
import { flushSettings, getSettings, updateSettings } from './settings'
import { QPX_SCHEME } from '@shared/protocol'

// Must run before app.whenReady: grants qpx:// the privileges needed for
// <img> loading and fetch/streaming from the renderer.
protocol.registerSchemesAsPrivileged([
  {
    scheme: QPX_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      bypassCSP: false
    }
  }
])

// CDP endpoint for dev tooling (headless renderer tests). Never in production.
if (!app.isPackaged) {
  app.commandLine.appendSwitch('remote-debugging-port', '9223')
}

async function createWindow(): Promise<void> {
  const settings = await getSettings()
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    ...settings.windowBounds,
    minWidth: 960,
    minHeight: 600,
    show: false,
    // Dev taskbar icon; packaged builds get it from the exe resources.
    icon: join(app.getAppPath(), 'build/icon.ico'),
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

  win.once('ready-to-show', () => win.show())
  // Never leave the window invisible if the first paint stalls (slow dev
  // server, GPU init hiccup) — an unshown window looks like a failed launch.
  setTimeout(() => {
    if (!win.isDestroyed() && !win.isVisible()) win.show()
  }, 3000)

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[QuickPix] Renderer failed to load (${code}) ${desc} — ${url}`)
  })
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error(`[QuickPix] Renderer process gone: ${details.reason}`)
  })

  const saveBounds = (): void => {
    if (!win.isDestroyed() && !win.isMaximized() && !win.isMinimized()) {
      updateSettings({ windowBounds: win.getBounds() })
    }
  }
  win.on('resized', saveBounds)
  win.on('moved', saveBounds)

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
  void createWindow()
  void sweepCache()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('before-quit', () => flushSettings())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
