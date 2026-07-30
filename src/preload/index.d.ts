import type { QuickPixApi } from '../shared/types'

declare global {
  interface Window {
    quickpix: QuickPixApi
  }
}

export {}
