import { BrowserWindow, dialog, ipcMain } from 'electron'
import type { OpenFolderResult } from '@shared/types'
import { isPathAllowed, listImages, setAllowedFolder } from './library'

export function registerIpcHandlers(): void {
  ipcMain.handle('dialog:openFolder', async (event): Promise<OpenFolderResult | null> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null

    const result = await dialog.showOpenDialog(win, {
      title: 'Open photo folder',
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null

    const folder = result.filePaths[0]
    setAllowedFolder(folder)
    return { folder, images: await listImages(folder) }
  })

  ipcMain.handle('library:list', async (_event, folder: string) => {
    if (!isPathAllowed(folder)) throw new Error('Folder not opened')
    return listImages(folder)
  })
}
