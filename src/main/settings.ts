import { app, type Rectangle } from 'electron'
import { promises as fs, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** Persisted app state (userData/settings.json). All fields optional. */
export interface AppSettings {
  windowBounds?: Rectangle
  lastFolder?: string
  lastSelectedPath?: string
  recentFolders: string[]
}

const settingsFile = (): string => join(app.getPath('userData'), 'settings.json')

let cached: AppSettings | null = null
let saveTimer: NodeJS.Timeout | undefined

export async function getSettings(): Promise<AppSettings> {
  if (cached) return cached
  try {
    const raw = JSON.parse(await fs.readFile(settingsFile(), 'utf-8')) as Partial<AppSettings>
    cached = { recentFolders: [], ...raw }
  } catch {
    cached = { recentFolders: [] }
  }
  return cached
}

export function updateSettings(partial: Partial<AppSettings>): void {
  cached = { recentFolders: [], ...cached, ...partial }
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    void fs.writeFile(settingsFile(), JSON.stringify(cached, null, 2), 'utf-8').catch(() => {})
  }, 400)
}

/** Record a folder open: last folder + recents (deduped, capped). */
export function recordFolderOpened(folder: string): void {
  const recents = [folder, ...(cached?.recentFolders ?? []).filter((f) => f !== folder)].slice(0, 8)
  updateSettings({ lastFolder: folder, recentFolders: recents })
}

/** Flush any pending write synchronously-ish on quit. */
export function flushSettings(): void {
  clearTimeout(saveTimer)
  if (cached) {
    try {
      writeFileSync(settingsFile(), JSON.stringify(cached, null, 2), 'utf-8')
    } catch {
      // best effort
    }
  }
}
