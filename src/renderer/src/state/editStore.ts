import { create } from 'zustand'
import {
  cloneParams,
  DEFAULT_EDIT_PARAMS,
  isNeutral,
  normalizeParams,
  type EditParams
} from '@shared/editParams'
import type { HistogramData } from '../gl/pipeline'

/** Numeric slider keys of EditParams (everything except curve/crop). */
export type SliderKey = Exclude<keyof EditParams, 'curve' | 'crop'>

/** History entries within this window and with the same label coalesce. */
const HISTORY_COALESCE_MS = 600
const HISTORY_MAX = 100
const SIDECAR_DEBOUNCE_MS = 600

interface EditState {
  /** Params of the photo currently being edited. */
  params: EditParams
  /** Path of the photo the params belong to. */
  activePath: string | null
  /** In-memory edits per photo, so switching photos keeps work. */
  byPath: Record<string, EditParams>
  /** Hold-\ compare: render defaults instead of params. */
  showOriginal: boolean
  /** Crop tool overlay active. */
  cropMode: boolean
  /** Temporary params while hovering a preset (renders instead of params). */
  previewParams: EditParams | null
  /** Copy/paste settings clipboard (app-internal). */
  copiedParams: EditParams | null
  histogram: HistogramData | null

  // Undo history for the active photo.
  history: EditParams[]
  historyIndex: number

  setParam: (key: SliderKey, value: number) => void
  setParams: (partial: Partial<EditParams>, historyLabel?: string) => void
  resetAll: () => void
  applyPreset: (params: EditParams) => void
  undo: () => void
  redo: () => void
  copySettings: () => void
  pasteSettings: () => void
  /** Switch editing context when the selected photo changes. */
  activate: (path: string | null) => void
  setShowOriginal: (v: boolean) => void
  setCropMode: (v: boolean) => void
  setPreviewParams: (p: EditParams | null) => void
  setHistogram: (h: HistogramData) => void
}

let lastHistoryPush = 0
let lastHistoryLabel = ''
let sidecarTimer: number | undefined
/** Guards against a slow sidecar read landing after the user switched photos. */
let activateToken = 0

function scheduleSidecarWrite(path: string, params: EditParams): void {
  window.clearTimeout(sidecarTimer)
  sidecarTimer = window.setTimeout(() => {
    const payload = isNeutral(params) ? null : { version: 1, savedAt: new Date().toISOString(), params }
    window.quickpix.writeSidecar(path, payload).catch((err) => {
      console.error('[QuickPix] Sidecar write failed:', err)
    })
  }, SIDECAR_DEBOUNCE_MS)
}

export const useEditStore = create<EditState>((set, get) => {
  /** Apply new params for the active photo: history, cache, sidecar. */
  const commit = (next: EditParams, historyLabel: string): void => {
    const { activePath, history, historyIndex } = get()

    const now = Date.now()
    let newHistory = history.slice(0, historyIndex + 1)
    if (now - lastHistoryPush < HISTORY_COALESCE_MS && historyLabel === lastHistoryLabel && newHistory.length > 1) {
      // Coalesce rapid changes from the same control into one entry.
      newHistory[newHistory.length - 1] = next
    } else {
      newHistory.push(next)
      if (newHistory.length > HISTORY_MAX) newHistory = newHistory.slice(newHistory.length - HISTORY_MAX)
    }
    lastHistoryPush = now
    lastHistoryLabel = historyLabel

    set({
      params: next,
      history: newHistory,
      historyIndex: newHistory.length - 1,
      byPath: activePath ? { ...get().byPath, [activePath]: next } : get().byPath
    })
    if (activePath) scheduleSidecarWrite(activePath, next)
  }

  return {
    params: cloneParams(DEFAULT_EDIT_PARAMS),
    activePath: null,
    byPath: {},
    showOriginal: false,
    cropMode: false,
    previewParams: null,
    copiedParams: null,
    histogram: null,
    history: [cloneParams(DEFAULT_EDIT_PARAMS)],
    historyIndex: 0,

    setParam: (key, value) => {
      commit({ ...get().params, [key]: value }, `param:${key}`)
    },

    setParams: (partial, historyLabel = 'params') => {
      commit({ ...get().params, ...partial }, historyLabel)
    },

    resetAll: () => commit(cloneParams(DEFAULT_EDIT_PARAMS), 'reset'),

    applyPreset: (params) => {
      // Presets never carry a crop — keep the photo's own crop.
      commit({ ...cloneParams(params), crop: get().params.crop }, 'preset')
    },

    undo: () => {
      const { history, historyIndex, activePath } = get()
      if (historyIndex <= 0) return
      const params = history[historyIndex - 1]
      set({
        params,
        historyIndex: historyIndex - 1,
        byPath: activePath ? { ...get().byPath, [activePath]: params } : get().byPath
      })
      if (activePath) scheduleSidecarWrite(activePath, params)
    },

    redo: () => {
      const { history, historyIndex, activePath } = get()
      if (historyIndex >= history.length - 1) return
      const params = history[historyIndex + 1]
      set({
        params,
        historyIndex: historyIndex + 1,
        byPath: activePath ? { ...get().byPath, [activePath]: params } : get().byPath
      })
      if (activePath) scheduleSidecarWrite(activePath, params)
    },

    copySettings: () => {
      // Copy everything except the crop (geometry rarely transfers well).
      set({ copiedParams: { ...cloneParams(get().params), crop: null } })
    },

    pasteSettings: () => {
      const copied = get().copiedParams
      if (!copied) return
      commit({ ...cloneParams(copied), crop: get().params.crop }, 'paste')
    },

    activate: (path) => {
      if (path === get().activePath) return
      const token = ++activateToken
      const cached = path ? get().byPath[path] : undefined
      const initial = cached ?? cloneParams(DEFAULT_EDIT_PARAMS)
      set({
        activePath: path,
        params: initial,
        cropMode: false,
        previewParams: null,
        history: [initial],
        historyIndex: 0
      })
      // No in-memory edits yet: try the sidecar on disk.
      if (path && !cached) {
        window.quickpix
          .readSidecar(path)
          .then((data) => {
            if (token !== activateToken || !data) return
            const params = normalizeParams((data as { params?: unknown }).params)
            set({
              params,
              byPath: { ...get().byPath, [path]: params },
              history: [params],
              historyIndex: 0
            })
          })
          .catch(() => {})
      }
    },

    setShowOriginal: (v) => set({ showOriginal: v }),
    setCropMode: (v) => set({ cropMode: v }),
    setPreviewParams: (p) => set({ previewParams: p }),
    setHistogram: (h) => set({ histogram: h })
  }
})

if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>)['__qpEditStore'] = useEditStore
}
