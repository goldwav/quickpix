import { create } from 'zustand'
import type { ImageFileInfo } from '@shared/types'

interface LibraryState {
  folder: string | null
  images: ImageFileInfo[]
  selectedIndex: number
  /** Multi-selection (paths). Empty means "just the active photo". */
  selection: string[]
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
}

let persistSelectionTimer: number | undefined

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
  recentFolders: [],

  openFolder: async () => {
    const result = await window.quickpix.openFolder()
    if (!result) return
    set({
      folder: result.folder,
      images: result.images,
      selectedIndex: result.images.length > 0 ? 0 : -1
    })
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
      selectedIndex: idx >= 0 ? idx : result.images.length > 0 ? 0 : -1
    })
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
  }
}))

/** Paths that an export should cover: the multi-selection, or the active photo. */
export function getExportTargets(): string[] {
  const { selection, images, selectedIndex } = useLibraryStore.getState()
  if (selection.length > 0) return selection
  const active = images[selectedIndex]?.path
  return active ? [active] : []
}

/** The currently selected image, or null when nothing is selected. */
export function useSelectedImage(): ImageFileInfo | null {
  return useLibraryStore((s) => s.images[s.selectedIndex] ?? null)
}
