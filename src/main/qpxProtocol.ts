import { net, protocol } from 'electron'
import { pathToFileURL } from 'node:url'
import { QPX_SCHEME, QPX_HOST, QPX_THUMB_HOST, qpxUrlToPath } from '@shared/protocol'
import { isPathAllowed } from './library'
import { getThumbnail, getTranscode, needsTranscode } from './imageCache'

/**
 * Serve local image files to the renderer, restricted to the opened folder.
 *   qpx://local/<path>  original file (TIFF is transparently transcoded to PNG)
 *   qpx://thumb/<path>  cached filmstrip thumbnail (JPEG)
 */
/**
 * The renderer's origin (http://localhost in dev, file:// in prod) differs
 * from qpx://, so viewer fetch() calls are cross-origin — without this header
 * they are silently blocked and only <img> tags (no-cors) would work.
 */
function withCors(response: Response): Response {
  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Origin', '*')
  return new Response(response.body, { status: response.status, headers })
}

export function registerQpxProtocol(): void {
  protocol.handle(QPX_SCHEME, async (request) => {
    const url = new URL(request.url)
    const filePath = qpxUrlToPath(request.url)
    if (!filePath || !isPathAllowed(filePath)) {
      return withCors(new Response('Forbidden', { status: 403 }))
    }

    try {
      if (url.host === QPX_THUMB_HOST) {
        return withCors(await net.fetch(pathToFileURL(await getThumbnail(filePath)).toString()))
      }
      if (url.host === QPX_HOST && needsTranscode(filePath)) {
        return withCors(await net.fetch(pathToFileURL(await getTranscode(filePath)).toString()))
      }
      return withCors(await net.fetch(pathToFileURL(filePath).toString()))
    } catch (err) {
      console.error('[QuickPix] qpx:// failed for', filePath, err)
      return withCors(new Response('Failed to read image', { status: 500 }))
    }
  })
}
