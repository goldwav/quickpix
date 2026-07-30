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
export function registerQpxProtocol(): void {
  protocol.handle(QPX_SCHEME, async (request) => {
    const url = new URL(request.url)
    const filePath = qpxUrlToPath(request.url)
    if (!filePath || !isPathAllowed(filePath)) {
      return new Response('Forbidden', { status: 403 })
    }

    try {
      if (url.host === QPX_THUMB_HOST) {
        return await net.fetch(pathToFileURL(await getThumbnail(filePath)).toString())
      }
      if (url.host === QPX_HOST && needsTranscode(filePath)) {
        return await net.fetch(pathToFileURL(await getTranscode(filePath)).toString())
      }
      return await net.fetch(pathToFileURL(filePath).toString())
    } catch (err) {
      console.error('[QuickPix] qpx:// failed for', filePath, err)
      return new Response('Failed to read image', { status: 500 })
    }
  })
}
