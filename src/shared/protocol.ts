/**
 * The custom protocol used to serve local image files to the renderer.
 * URL shape: qpx://local/<encodeURIComponent(absolutePath)>
 *
 * Serving files through a protocol (instead of IPC buffers) lets <img> use
 * Chromium's native decoders, cache, and lazy loading. The main process
 * validates every request against the currently opened folder.
 */
export const QPX_SCHEME = 'qpx'
export const QPX_HOST = 'local'
export const QPX_THUMB_HOST = 'thumb'

export function pathToQpxUrl(absolutePath: string): string {
  return `${QPX_SCHEME}://${QPX_HOST}/${encodeURIComponent(absolutePath)}`
}

export function pathToQpxThumbUrl(absolutePath: string): string {
  return `${QPX_SCHEME}://${QPX_THUMB_HOST}/${encodeURIComponent(absolutePath)}`
}

/** Extract the file path from either qpx:// host. */
export function qpxUrlToPath(url: string): string | null {
  for (const host of [QPX_HOST, QPX_THUMB_HOST]) {
    const prefix = `${QPX_SCHEME}://${host}/`
    if (url.startsWith(prefix)) {
      try {
        return decodeURIComponent(url.slice(prefix.length))
      } catch {
        return null
      }
    }
  }
  return null
}
