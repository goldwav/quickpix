import { contextBridge, ipcRenderer } from 'electron'
import type { ImageFileInfo, OpenFolderResult, Preset, QuickPixApi } from '../shared/types'

const api: QuickPixApi = {
  openFolder: (): Promise<OpenFolderResult | null> => ipcRenderer.invoke('dialog:openFolder'),
  listImages: (folder: string): Promise<ImageFileInfo[]> => ipcRenderer.invoke('library:list', folder),
  readSidecar: (imagePath: string): Promise<unknown | null> => ipcRenderer.invoke('sidecar:read', imagePath),
  writeSidecar: (imagePath: string, data: unknown | null): Promise<void> =>
    ipcRenderer.invoke('sidecar:write', imagePath, data),
  listPresets: (): Promise<Preset[]> => ipcRenderer.invoke('presets:list'),
  savePreset: (preset: Preset): Promise<Preset[]> => ipcRenderer.invoke('presets:save', preset),
  deletePreset: (name: string): Promise<Preset[]> => ipcRenderer.invoke('presets:delete', name)
}

contextBridge.exposeInMainWorld('quickpix', api)
