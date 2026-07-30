import { promises as fs } from 'node:fs'
import { isPathAllowed } from './library'

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

export async function writeSidecar(imagePath: string, data: unknown | null): Promise<void> {
  if (!isPathAllowed(imagePath)) throw new Error('Path not in opened folder')
  const target = sidecarPath(imagePath)
  if (data === null) {
    await fs.rm(target, { force: true })
    return
  }
  await fs.writeFile(target, JSON.stringify(data, null, 2), 'utf-8')
}
