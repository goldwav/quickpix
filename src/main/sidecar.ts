import { promises as fs } from 'node:fs'
import type { PhotoMeta } from '@shared/types'
import { isPathAllowed, listImages } from './library'

/**
 * Sidecar files hold the non-destructive edit state, next to the original:
 * photo.jpg -> photo.jpg.qpx (JSON). Originals are never touched.
 */
const SIDECAR_EXT = '.qpx'

export function sidecarPath(imagePath: string): string {
  return imagePath + SIDECAR_EXT
}

export async function readSidecar(imagePath: string): Promise<unknown | null> {
  if (!isPathAllowed(imagePath)) throw new Error('Path not in opened folder')
  try {
    const raw = await fs.readFile(sidecarPath(imagePath), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** Ratings/flags for every image in a folder — one pass over its sidecars. */
export async function readAllMeta(folder: string): Promise<Record<string, PhotoMeta>> {
  if (!isPathAllowed(folder)) throw new Error('Folder not opened')
  const result: Record<string, PhotoMeta> = {}
  const images = await listImages(folder)
  await Promise.all(
    images.map(async (img) => {
      try {
        const raw = JSON.parse(await fs.readFile(sidecarPath(img.path), 'utf-8')) as {
          rating?: unknown
          flag?: unknown
        }
        const rating = typeof raw.rating === 'number' ? Math.min(5, Math.max(0, Math.round(raw.rating))) : 0
        const flag = raw.flag === 'pick' || raw.flag === 'reject' ? raw.flag : null
        if (rating > 0 || flag) result[img.path] = { rating, flag }
      } catch {
        // no sidecar / unreadable — no meta
      }
    })
  )
  return result
}

export async function writeSidecar(imagePath: string, data: unknown | null): Promise<void> {
  if (!isPathAllowed(imagePath)) throw new Error('Path not in opened folder')
  const target = sidecarPath(imagePath)
  if (data === null) {
    await fs.rm(target, { force: true })
    return
  }
  await fs.writeFile(target, JSON.stringify(data, null, 2), 'utf-8')
}
