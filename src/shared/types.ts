/** An image file discovered in the opened folder. */
export interface ImageFileInfo {
  /** Absolute path on disk. */
  path: string
  /** File name including extension. */
  name: string
  /** Size in bytes. */
  size: number
  /** Last-modified time (ms since epoch). */
  mtimeMs: number
}

export interface OpenFolderResult {
  folder: string
  images: ImageFileInfo[]
}

/**
 * Image formats Chromium can decode natively in <img>/createImageBitmap.
 * TIFF is intentionally absent — it needs a decoder (sharp) and lands with the
 * export pipeline; RAW lands later still (see README roadmap).
 */
export const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif'] as const

/** A named, reusable set of edit parameters ("filter"). */
export interface Preset {
  name: string
  /** EditParams shape (typed loosely here to keep shared/types dependency-free). */
  params: unknown
}

export interface ExportImageOptions {
  format: 'jpeg' | 'png' | 'webp'
  quality: number
  resizeLongEdge?: number
}

export interface ExportImageResult {
  ok: boolean
  outPath?: string
  error?: string
}

/** API surface exposed to the renderer via the preload contextBridge. */
export interface QuickPixApi {
  /** Show a folder picker; resolves null if the user cancels. */
  openFolder(): Promise<OpenFolderResult | null>
  /** Re-enumerate images in a previously opened folder. */
  listImages(folder: string): Promise<ImageFileInfo[]>
  /** Open a dropped file/folder path (folder of the file is opened). */
  openPath(path: string): Promise<OpenFolderResult | null>
  /** Resolve the filesystem path of a dropped File object. */
  getPathForFile(file: File): string
  /** Export with edits baked in; shows a save dialog in the main process. */
  exportImage(imagePath: string, params: unknown, options: ExportImageOptions): Promise<ExportImageResult>
  /** Read the .qpx sidecar for an image; null when none exists. */
  readSidecar(imagePath: string): Promise<unknown | null>
  /** Write (or delete, when data is null) the .qpx sidecar for an image. */
  writeSidecar(imagePath: string, data: unknown | null): Promise<void>
  /** User preset management (persisted in the app's user-data folder). */
  listPresets(): Promise<Preset[]>
  savePreset(preset: Preset): Promise<Preset[]>
  deletePreset(name: string): Promise<Preset[]>
}
