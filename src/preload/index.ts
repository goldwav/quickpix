import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type {
  ExportBatchItem,
  ExportBatchResult,
  ExportImageOptions,
  ExportImageResult,
  ExportProgress,
  ImageFileInfo,
  ImageInfo,
  OpenFolderResult,
  Preset,
  QuickPixApi,
  SessionInfo
} from '../shared/types'

const api: QuickPixApi = {
  openFolder: (): Promise<OpenFolderResult | null> => ipcRenderer.invoke('dialog:openFolder'),
  listImages: (folder: string): Promise<ImageFileInfo[]> => ipcRenderer.invoke('library:list', folder),
  openPath: (path: string): Promise<OpenFolderResult | null> => ipcRenderer.invoke('library:openPath', path),
  getImageInfo: (imagePath: string): Promise<ImageInfo> => ipcRenderer.invoke('image:info', imagePath),
  getSession: (): Promise<SessionInfo> => ipcRenderer.invoke('session:get'),
  setSelectedPath: (path: string): Promise<void> => ipcRenderer.invoke('session:setSelected', path),
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  exportImage: (imagePath: string, params: unknown, options: ExportImageOptions): Promise<ExportImageResult> =>
    ipcRenderer.invoke('export:image', { imagePath, params, options }),
  exportBatch: (items: ExportBatchItem[], options: ExportImageOptions): Promise<ExportBatchResult> =>
    ipcRenderer.invoke('export:batch', { items, options }),
  onExportProgress: (cb: (p: ExportProgress) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, p: ExportProgress): void => cb(p)
    ipcRenderer.on('export:progress', listener)
    return () => ipcRenderer.removeListener('export:progress', listener)
  },
  readSidecar: (imagePath: string): Promise<unknown | null> => ipcRenderer.invoke('sidecar:read', imagePath),
  writeSidecar: (imagePath: string, data: unknown | null): Promise<void> =>
    ipcRenderer.invoke('sidecar:write', imagePath, data),
  listPresets: (): Promise<Preset[]> => ipcRenderer.invoke('presets:list'),
  savePreset: (preset: Preset): Promise<Preset[]> => ipcRenderer.invoke('presets:save', preset),
  deletePreset: (name: string): Promise<Preset[]> => ipcRenderer.invoke('presets:delete', name)
}

contextBridge.exposeInMainWorld('quickpix', api)
