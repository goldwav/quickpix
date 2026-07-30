import { pathToQpxUrl } from '@shared/protocol'

/**
 * Resolves an image path to a loadable URL. In Electron this is the qpx://
 * protocol; the browser dev mock registers blob: URL overrides instead.
 */
const overrides = new Map<string, string>()

export function registerImageUrlOverride(path: string, url: string): void {
  overrides.set(path, url)
}

export function getImageUrl(path: string): string {
  return overrides.get(path) ?? pathToQpxUrl(path)
}
