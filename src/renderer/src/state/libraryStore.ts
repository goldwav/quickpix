import { create } from 'zustand'
import type { ImageFileInfo } from '@shared/types'

interface LibraryState {
  folder: string | null
  images: ImageFileInfo[]
  selectedIndex: number
  openFolder: () => Promise<void>
  refresh: () => Promise<void>
  select: (index: number) => void
  selectNext: () => void
  selectPrev: () => void
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  folder: null,
  images: [],
  selectedIndex: -1,

  openFolder: async () => {
    const result = await window.quickpix.openFolder()
    if (!result) return
    set({
      folder: result.folder,
      images: result.images,
      selectedIndex: result.images.length > 0 ? 0 : -1
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
    if (index >= 0 && index < images.length) set({ selectedIndex: index })
  },

  selectNext: () => {
    const { selectedIndex, images } = get()
    if (selectedIndex < images.length - 1) set({ selectedIndex: selectedIndex + 1 })
  },

  selectPrev: () => {
    const { selectedIndex } = get()
    if (selectedIndex > 0) set({ selectedIndex: selectedIndex - 1 })
  }
}))

/** The currently selected image, or null when nothing is selected. */
export function useSelectedImage(): ImageFileInfo | null {
  return useLibraryStore((s) => s.images[s.selectedIndex] ?? null)
}
