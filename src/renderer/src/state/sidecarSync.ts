import { isNeutral, type EditParams } from '@shared/editParams'
import type { PhotoMeta } from '@shared/types'
import { toast } from './uiStore'

/**
 * Single writer for .qpx sidecars. Edit params (editStore) and culling meta
 * (libraryStore) both land in the same file, so all writes route through here
 * to avoid read-modify-write races between the two stores.
 */

const DEBOUNCE_MS = 600
const timers = new Map<string, number>()

interface Providers {
  getParams: (path: string) => EditParams | undefined
  getMeta: (path: string) => PhotoMeta | undefined
}

let providers: Providers | null = null

/** Called once at startup by the store modules (avoids import cycles). */
export function registerSidecarProviders(p: Partial<Providers>): void {
  providers = { ...({ getParams: () => undefined, getMeta: () => undefined } as Providers), ...providers, ...p }
}

export function scheduleSidecarSync(path: string): void {
  window.clearTimeout(timers.get(path))
  timers.set(
    path,
    window.setTimeout(() => {
      timers.delete(path)
      const params = providers?.getParams(path)
      const meta = providers?.getMeta(path)
      const hasEdits = params !== undefined && !isNeutral(params)
      const hasMeta = meta !== undefined && (meta.rating > 0 || meta.flag !== null)

      const payload =
        hasEdits || hasMeta
          ? {
              version: 1,
              savedAt: new Date().toISOString(),
              ...(hasEdits ? { params } : {}),
              ...(hasMeta ? { rating: meta.rating, flag: meta.flag } : {})
            }
          : null

      window.quickpix.writeSidecar(path, payload).catch((err) => {
        console.error('[QuickPix] Sidecar write failed:', err)
        toast('error', "Couldn't save changes — check disk space and folder permissions")
      })
    }, DEBOUNCE_MS)
  )
}
