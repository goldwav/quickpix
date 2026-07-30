import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  ExportImageOptions,
  ExportImageResult,
  ImageFileInfo,
  OpenFolderResult,
  Preset,
  QuickPixApi
} from '../shared/types'

const api: QuickPixApi = {
  openFolder: (): Promise<OpenFolderResult | null> => ipcRenderer.invoke('dialog:openFolder'),
  listImages: (folder: string): Promise<ImageFileInfo[]> => ipcRenderer.invoke('library:list', folder),
  openPath: (path: string): Promise<OpenFolderResult | null> => ipcRenderer.invoke('library:openPath', path),
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  exportImage: (imagePath: string, params: unknown, options: ExportImageOptions): Promise<ExportImageResult> =>
    ipcRenderer.invoke('export:image', { imagePath, params, options }),
  readSidecar: (imagePath: string): Promise<unknown | null> => ipcRenderer.invoke('sidecar:read', imagePath),
  writeSidecar: (imagePath: string, data: unknown | null): Promise<void> =>
    ipcRenderer.invoke('sidecar:write', imagePath, data),
  listPresets: (): Promise<Preset[]> => ipcRenderer.invoke('presets:list'),
  savePreset: (preset: Preset): Promise<Preset[]> => ipcRenderer.invoke('presets:save', preset),
  deletePreset: (name: string): Promise<Preset[]> => ipcRenderer.invoke('presets:delete', name)
}

contextBridge.exposeInMainWorld('quickpix', api)
