import { BrowserWindow, dialog, ipcMain } from 'electron'
import type { OpenFolderResult, Preset } from '@shared/types'
import { isPathAllowed, listImages, setAllowedFolder } from './library'
import { readSidecar, writeSidecar } from './sidecar'
import { deletePreset, listPresets, savePreset } from './presets'

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

  ipcMain.handle('sidecar:read', (_event, imagePath: string) => readSidecar(imagePath))
  ipcMain.handle('sidecar:write', (_event, imagePath: string, data: unknown | null) =>
    writeSidecar(imagePath, data)
  )

  ipcMain.handle('presets:list', () => listPresets())
  ipcMain.handle('presets:save', (_event, preset: Preset) => savePreset(preset))
  ipcMain.handle('presets:delete', (_event, name: string) => deletePreset(name))
}
