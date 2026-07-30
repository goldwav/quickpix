import { create } from 'zustand'
import {
  cloneParams,
  DEFAULT_EDIT_PARAMS,
  type EditParams
} from '@shared/editParams'
import type { HistogramData } from '../gl/pipeline'

/** Numeric slider keys of EditParams (everything except curve/crop). */
export type SliderKey = Exclude<keyof EditParams, 'curve' | 'crop'>

interface EditState {
  /** Params of the photo currently being edited. */
  params: EditParams
  /** Path of the photo the params belong to. */
  activePath: string | null
  /** In-memory edits per photo, so switching photos keeps work. */
  byPath: Record<string, EditParams>
  /** Hold-\ compare: render defaults instead of params. */
  showOriginal: boolean
  histogram: HistogramData | null

  setParam: (key: SliderKey, value: number) => void
  setParams: (partial: Partial<EditParams>) => void
  resetAll: () => void
  /** Switch editing context when the selected photo changes. */
  activate: (path: string | null) => void
  setShowOriginal: (v: boolean) => void
  setHistogram: (h: HistogramData) => void
}

export const useEditStore = create<EditState>((set, get) => ({
  params: cloneParams(DEFAULT_EDIT_PARAMS),
  activePath: null,
  byPath: {},
  showOriginal: false,
  histogram: null,

  setParam: (key, value) => {
    const { params, activePath, byPath } = get()
    const next = { ...params, [key]: value }
    set({ params: next, byPath: activePath ? { ...byPath, [activePath]: next } : byPath })
  },

  setParams: (partial) => {
    const { params, activePath, byPath } = get()
    const next = { ...params, ...partial }
    set({ params: next, byPath: activePath ? { ...byPath, [activePath]: next } : byPath })
  },

  resetAll: () => {
    const { activePath, byPath } = get()
    const next = cloneParams(DEFAULT_EDIT_PARAMS)
    set({ params: next, byPath: activePath ? { ...byPath, [activePath]: next } : byPath })
  },

  activate: (path) => {
    if (path === get().activePath) return
    const stored = path ? get().byPath[path] : undefined
    set({ activePath: path, params: stored ? stored : cloneParams(DEFAULT_EDIT_PARAMS) })
  },

  setShowOriginal: (v) => set({ showOriginal: v }),
  setHistogram: (h) => set({ histogram: h })
}))
