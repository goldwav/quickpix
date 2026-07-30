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

export function pathToQpxUrl(absolutePath: string): string {
  return `${QPX_SCHEME}://${QPX_HOST}/${encodeURIComponent(absolutePath)}`
}

export function qpxUrlToPath(url: string): string | null {
  const prefix = `${QPX_SCHEME}://${QPX_HOST}/`
  if (!url.startsWith(prefix)) return null
  try {
    return decodeURIComponent(url.slice(prefix.length))
  } catch {
    return null
  }
}
