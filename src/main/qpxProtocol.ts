import { net, protocol } from 'electron'
import { pathToFileURL } from 'node:url'
import { QPX_SCHEME, qpxUrlToPath } from '@shared/protocol'
import { isPathAllowed } from './library'

/** Serve local image files to the renderer, restricted to the opened folder. */
export function registerQpxProtocol(): void {
  protocol.handle(QPX_SCHEME, (request) => {
    const filePath = qpxUrlToPath(request.url)
    if (!filePath || !isPathAllowed(filePath)) {
      return new Response('Forbidden', { status: 403 })
    }
    return net.fetch(pathToFileURL(filePath).toString())
  })
}
