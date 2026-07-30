import { app } from 'electron'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

/**
 * Derived-image cache: filmstrip thumbnails and PNG transcodes of formats
 * Chromium cannot decode (TIFF). Keyed by content identity (path hash +
 * mtime), so an edited/replaced file simply gets a new key — stale entries
 * are never served and old ones are swept opportunistically.
 */

const THUMB_SIZE = 320
// NOT "cache": Windows is case-insensitive and Chromium owns userData/Cache —
// sharing that directory would let our sweeper touch Chromium's files.
const cacheDir = (): string => join(app.getPath('userData'), 'derived-images')

const keyFor = (imagePath: string, mtimeMs: number, kind: string): string =>
  `${createHash('sha1').update(imagePath.toLowerCase()).digest('hex')}-${Math.round(mtimeMs)}-${kind}`

async function ensureCacheDir(): Promise<string> {
  const dir = cacheDir()
  await fs.mkdir(dir, { recursive: true })
  return dir
}

/** True for formats the renderer cannot decode natively. */
export function needsTranscode(imagePath: string): boolean {
  return /\.(tif|tiff)$/i.test(imagePath)
}

/** Path to a cached JPEG thumbnail, generating it on first request. */
export async function getThumbnail(imagePath: string): Promise<string> {
  const stat = await fs.stat(imagePath)
  const dir = await ensureCacheDir()
  const target = join(dir, keyFor(imagePath, stat.mtimeMs, `t${THUMB_SIZE}`) + '.jpg')
  try {
    await fs.access(target)
    return target
  } catch {
    // not cached yet
  }
  const buf = await sharp(imagePath)
    .rotate()
    .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer()
  await fs.writeFile(target, buf)
  return target
}

/** Path to a cached full-size PNG transcode (for TIFF etc.). */
export async function getTranscode(imagePath: string): Promise<string> {
  const stat = await fs.stat(imagePath)
  const dir = await ensureCacheDir()
  const target = join(dir, keyFor(imagePath, stat.mtimeMs, 'full') + '.png')
  try {
    await fs.access(target)
    return target
  } catch {
    // not cached yet
  }
  const buf = await sharp(imagePath).rotate().png().toBuffer()
  await fs.writeFile(target, buf)
  return target
}

/** Best-effort sweep of cache entries older than maxAgeDays. */
export async function sweepCache(maxAgeDays = 30): Promise<void> {
  try {
    const dir = await ensureCacheDir()
    const cutoff = Date.now() - maxAgeDays * 24 * 3600 * 1000
    for (const name of await fs.readdir(dir)) {
      const p = join(dir, name)
      try {
        const stat = await fs.stat(p)
        if (stat.atimeMs < cutoff && stat.mtimeMs < cutoff) await fs.rm(p, { force: true })
      } catch {
        // ignore individual failures
      }
    }
  } catch {
    // cache sweeping must never break startup
  }
}
