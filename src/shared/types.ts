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

/** API surface exposed to the renderer via the preload contextBridge. */
export interface QuickPixApi {
  /** Show a folder picker; resolves null if the user cancels. */
  openFolder(): Promise<OpenFolderResult | null>
  /** Re-enumerate images in a previously opened folder. */
  listImages(folder: string): Promise<ImageFileInfo[]>
}
