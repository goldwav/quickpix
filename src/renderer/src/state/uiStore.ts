import { create } from 'zustand'

export interface Toast {
  id: number
  kind: 'info' | 'success' | 'error'
  text: string
}

interface UiState {
  toasts: Toast[]
  addToast: (kind: Toast['kind'], text: string) => void
  dismissToast: (id: number) => void
}

let nextId = 1

export const useUiStore = create<UiState>((set, get) => ({
  toasts: [],

  addToast: (kind, text) => {
    const id = nextId++
    set({ toasts: [...get().toasts, { id, kind, text }] })
    // Errors linger longer than confirmations.
    window.setTimeout(() => get().dismissToast(id), kind === 'error' ? 8000 : 4000)
  },

  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) })
}))

/** Convenience for non-component callers (stores, async handlers). */
export const toast = (kind: Toast['kind'], text: string): void => useUiStore.getState().addToast(kind, text)
