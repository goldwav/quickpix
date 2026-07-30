import { promises as fs } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import { SUPPORTED_EXTENSIONS, type ImageFileInfo } from '@shared/types'

/**
 * The folder the user has opened. qpx:// requests and listImages calls are
 * only served for paths inside it — the renderer can never read arbitrary
 * files even if compromised.
 */
let allowedFolder: string | null = null

export function setAllowedFolder(folder: string): void {
  allowedFolder = normalize(folder)
}

export function isPathAllowed(filePath: string): boolean {
  if (!allowedFolder) return false
  const normalized = normalize(filePath)
  return normalized === allowedFolder || normalized.startsWith(allowedFolder + sep)
}

export async function listImages(folder: string): Promise<ImageFileInfo[]> {
  const entries = await fs.readdir(folder, { withFileTypes: true })
  const supported = new Set<string>(SUPPORTED_EXTENSIONS)
  const images: ImageFileInfo[] = []

  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!supported.has(extname(entry.name).toLowerCase())) continue
    const path = join(folder, entry.name)
    try {
      const stat = await fs.stat(path)
      images.push({ path, name: entry.name, size: stat.size, mtimeMs: stat.mtimeMs })
    } catch {
      // File vanished between readdir and stat — skip it.
    }
  }

  images.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  return images
}
