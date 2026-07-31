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
 * Formats QuickPix can open. Most decode natively in Chromium; TIFF is
 * transcoded by the main process (sharp) behind qpx://; RAW decodes in the
 * renderer via LibRaw (WASM).
 */
export const RAW_EXTENSIONS = ['.cr2', '.cr3', '.nef', '.arw', '.dng', '.raf', '.orf', '.rw2', '.pef'] as const

export const SUPPORTED_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.bmp',
  '.avif',
  '.tif',
  '.tiff',
  ...RAW_EXTENSIONS
] as const

export function isRawPath(path: string): boolean {
  const lower = path.toLowerCase()
  return RAW_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

/** Pre-decoded RGBA pixels (renderer-side LibRaw) handed to export. */
export interface DecodedRgba {
  data: Uint8Array
  width: number
  height: number
}

/** A named, reusable set of edit parameters ("filter"). */
export interface Preset {
  name: string
  /** EditParams shape (typed loosely here to keep shared/types dependency-free). */
  params: unknown
}

/** Culling metadata stored in the .qpx sidecar alongside edit params. */
export interface PhotoMeta {
  /** 0 = unrated, 1..5 stars. */
  rating: number
  flag: 'pick' | 'reject' | null
}

/** Camera/photo metadata for the info strip. All fields optional. */
export interface ImageInfo {
  width?: number
  height?: number
  format?: string
  camera?: string
  lens?: string
  /** Exposure time in seconds. */
  exposureTime?: number
  fNumber?: number
  iso?: number
  /** Focal length in mm. */
  focalLength?: number
  /** ISO date string. */
  takenAt?: string
}

export interface SessionInfo {
  lastFolder?: string
  lastSelectedPath?: string
  recentFolders: string[]
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

export interface ExportBatchItem {
  imagePath: string
  params: unknown
  /** Present for RAW files: pixels decoded in the renderer. */
  decoded?: DecodedRgba
}

export interface ExportBatchResult {
  ok: boolean
  outDir?: string
  done: number
  failed: string[]
  error?: string
}

export interface ExportProgress {
  done: number
  total: number
}

/** API surface exposed to the renderer via the preload contextBridge. */
export interface QuickPixApi {
  /** Show a folder picker; resolves null if the user cancels. */
  openFolder(): Promise<OpenFolderResult | null>
  /** Re-enumerate images in a previously opened folder. */
  listImages(folder: string): Promise<ImageFileInfo[]>
  /** Open a dropped file/folder path (folder of the file is opened). */
  openPath(path: string): Promise<OpenFolderResult | null>
  /** Dimensions + EXIF for the info strip. */
  getImageInfo(imagePath: string): Promise<ImageInfo>
  /** Restore-session info: last folder/photo and recent folders. */
  getSession(): Promise<SessionInfo>
  /** Remember the currently selected photo for next launch. */
  setSelectedPath(path: string): Promise<void>
  /** Resolve the filesystem path of a dropped File object. */
  getPathForFile(file: File): string
  /** Export with edits baked in; shows a save dialog in the main process. */
  exportImage(
    imagePath: string,
    params: unknown,
    options: ExportImageOptions,
    decoded?: DecodedRgba
  ): Promise<ExportImageResult>
  /** Export several photos to a picked folder; progress via onExportProgress. */
  exportBatch(items: ExportBatchItem[], options: ExportImageOptions): Promise<ExportBatchResult>
  /** Subscribe to batch-export progress; returns an unsubscribe function. */
  onExportProgress(cb: (p: ExportProgress) => void): () => void
  /** Read the .qpx sidecar for an image; null when none exists. */
  readSidecar(imagePath: string): Promise<unknown | null>
  /** Ratings/flags for every image in the opened folder (from sidecars). */
  readAllMeta(folder: string): Promise<Record<string, PhotoMeta>>
  /** Write (or delete, when data is null) the .qpx sidecar for an image. */
  writeSidecar(imagePath: string, data: unknown | null): Promise<void>
  /** User preset management (persisted in the app's user-data folder). */
  listPresets(): Promise<Preset[]>
  savePreset(preset: Preset): Promise<Preset[]>
  deletePreset(name: string): Promise<Preset[]>
}
