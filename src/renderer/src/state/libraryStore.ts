import { create } from 'zustand'
import type { ImageFileInfo, PhotoMeta } from '@shared/types'
import { registerSidecarProviders, scheduleSidecarSync } from './sidecarSync'

export type LibraryFilter = 'all' | 'picks' | '3' | '4' | '5'

interface LibraryState {
  folder: string | null
  images: ImageFileInfo[]
  selectedIndex: number
  /** Multi-selection (paths). Empty means "just the active photo". */
  selection: string[]
  /** Culling meta (stars/flags) per path — loaded from sidecars on open. */
  metaByPath: Record<string, PhotoMeta>
  filter: LibraryFilter
  recentFolders: string[]
  openFolder: () => Promise<void>
  openPath: (path: string) => Promise<void>
  /** Reopen the previous session's folder and photo on launch. */
  restoreSession: () => Promise<void>
  refresh: () => Promise<void>
  select: (index: number) => void
  toggleInSelection: (index: number) => void
  selectRangeTo: (index: number) => void
  selectNext: () => void
  selectPrev: () => void
  /** Apply rating/flag to the current selection (or active photo). */
  setRating: (rating: number) => void
  setFlag: (flag: PhotoMeta['flag']) => void
  setFilter: (f: LibraryFilter) => void
}

let persistSelectionTimer: number | undefined

/** Best-effort bulk load of ratings/flags from the folder's sidecars. */
function loadMeta(folder: string, set: (partial: { metaByPath: Record<string, PhotoMeta> }) => void): void {
  window.quickpix
    .readAllMeta(folder)
    .then((metaByPath) => set({ metaByPath }))
    .catch(() => set({ metaByPath: {} }))
}

/** Remember the selection for next launch (debounced, best-effort). */
function persistSelection(path: string | undefined): void {
  if (!path) return
  window.clearTimeout(persistSelectionTimer)
  persistSelectionTimer = window.setTimeout(() => {
    window.quickpix.setSelectedPath(path).catch(() => {})
  }, 400)
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  folder: null,
  images: [],
  selectedIndex: -1,
  selection: [],
  metaByPath: {},
  filter: 'all',
  recentFolders: [],

  openFolder: async () => {
    const result = await window.quickpix.openFolder()
    if (!result) return
    set({
      folder: result.folder,
      images: result.images,
      selectedIndex: result.images.length > 0 ? 0 : -1,
      selection: [],
      filter: 'all'
    })
    loadMeta(result.folder, set)
    void window.quickpix.getSession().then((s) => set({ recentFolders: s.recentFolders }))
  },

  openPath: async (path: string) => {
    const result = await window.quickpix.openPath(path)
    if (!result) return
    // If a file was dropped, select it within its folder.
    const idx = result.images.findIndex((f) => f.path === path)
    set({
      folder: result.folder,
      images: result.images,
      selectedIndex: idx >= 0 ? idx : result.images.length > 0 ? 0 : -1,
      selection: [],
      filter: 'all'
    })
    loadMeta(result.folder, set)
    void window.quickpix.getSession().then((s) => set({ recentFolders: s.recentFolders }))
  },

  restoreSession: async () => {
    const session = await window.quickpix.getSession()
    set({ recentFolders: session.recentFolders })
    if (!session.lastFolder || get().folder) return
    const result = await window.quickpix.openPath(session.lastFolder)
    if (!result || get().folder) return
    const idx = session.lastSelectedPath ? result.images.findIndex((f) => f.path === session.lastSelectedPath) : -1
    set({
      folder: result.folder,
      images: result.images,
      selectedIndex: idx >= 0 ? idx : result.images.length > 0 ? 0 : -1
    })
    loadMeta(result.folder, set)
  },

  refresh: async () => {
    const { folder, images, selectedIndex } = get()
    if (!folder) return
    const fresh = await window.quickpix.listImages(folder)
    // Try to keep the same photo selected across the refresh.
    const currentPath = images[selectedIndex]?.path
    const newIndex = currentPath ? fresh.findIndex((f) => f.path === currentPath) : -1
    set({ images: fresh, selectedIndex: newIndex >= 0 ? newIndex : fresh.length > 0 ? 0 : -1 })
  },

  select: (index) => {
    const { images } = get()
    if (index >= 0 && index < images.length) {
      set({ selectedIndex: index, selection: [] })
      persistSelection(images[index]?.path)
    }
  },

  toggleInSelection: (index) => {
    const { images, selection, selectedIndex } = get()
    const path = images[index]?.path
    if (!path) return
    // Seed the set with the active photo so ctrl-click extends, not replaces.
    const base = selection.length > 0 ? selection : images[selectedIndex] ? [images[selectedIndex].path] : []
    if (base.includes(path)) {
      set({ selection: base.filter((p) => p !== path) })
    } else {
      set({ selection: [...base, path], selectedIndex: index })
      persistSelection(path)
    }
  },

  selectRangeTo: (index) => {
    const { images, selectedIndex } = get()
    if (index < 0 || index >= images.length || selectedIndex < 0) return
    const [a, b] = selectedIndex < index ? [selectedIndex, index] : [index, selectedIndex]
    set({ selection: images.slice(a, b + 1).map((f) => f.path) })
  },

  selectNext: () => {
    const { selectedIndex, images } = get()
    if (selectedIndex < images.length - 1) {
      set({ selectedIndex: selectedIndex + 1, selection: [] })
      persistSelection(images[selectedIndex + 1]?.path)
    }
  },

  selectPrev: () => {
    const { selectedIndex, images } = get()
    if (selectedIndex > 0) {
      set({ selectedIndex: selectedIndex - 1, selection: [] })
      persistSelection(images[selectedIndex - 1]?.path)
    }
  },

  setRating: (rating) => {
    const targets = getSelectionTargets()
    if (targets.length === 0) return
    const metaByPath = { ...get().metaByPath }
    for (const path of targets) {
      const prev = metaByPath[path] ?? { rating: 0, flag: null }
      // Pressing the same star again clears it (Lightroom behavior).
      metaByPath[path] = { ...prev, rating: prev.rating === rating ? 0 : rating }
      scheduleSidecarSync(path)
    }
    set({ metaByPath })
  },

  setFlag: (flag) => {
    const targets = getSelectionTargets()
    if (targets.length === 0) return
    const metaByPath = { ...get().metaByPath }
    for (const path of targets) {
      const prev = metaByPath[path] ?? { rating: 0, flag: null }
      metaByPath[path] = { ...prev, flag: prev.flag === flag ? null : flag }
      scheduleSidecarSync(path)
    }
    set({ metaByPath })
  },

  setFilter: (f) => set({ filter: f })
}))

/** True when the photo passes the active library filter. */
export function passesFilter(meta: PhotoMeta | undefined, filter: LibraryFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'picks') return meta?.flag === 'pick'
  return (meta?.rating ?? 0) >= Number(filter)
}

registerSidecarProviders({ getMeta: (path) => useLibraryStore.getState().metaByPath[path] })

/** Paths an action should apply to: the multi-selection, or the active photo. */
export function getSelectionTargets(): string[] {
  const { selection, images, selectedIndex } = useLibraryStore.getState()
  if (selection.length > 0) return selection
  const active = images[selectedIndex]?.path
  return active ? [active] : []
}

/** @deprecated alias kept for the export dialog. */
export const getExportTargets = getSelectionTargets

/** The currently selected image, or null when nothing is selected. */
export function useSelectedImage(): ImageFileInfo | null {
  return useLibraryStore((s) => s.images[s.selectedIndex] ?? null)
}
