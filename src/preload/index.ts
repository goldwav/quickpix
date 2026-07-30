import { contextBridge, ipcRenderer } from 'electron'
import type { ImageFileInfo, OpenFolderResult, QuickPixApi } from '../shared/types'

const api: QuickPixApi = {
  openFolder: (): Promise<OpenFolderResult | null> => ipcRenderer.invoke('dialog:openFolder'),
  listImages: (folder: string): Promise<ImageFileInfo[]> => ipcRenderer.invoke('library:list', folder)
}

contextBridge.exposeInMainWorld('quickpix', api)
