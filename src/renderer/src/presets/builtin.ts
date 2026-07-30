import { DEFAULT_EDIT_PARAMS, type EditParams } from '@shared/editParams'

export interface BuiltinPreset {
  name: string
  params: EditParams
}

/** Partial params on top of defaults — presets never include a crop. */
const make = (name: string, p: Partial<EditParams>): BuiltinPreset => ({
  name,
  params: { ...structuredClone(DEFAULT_EDIT_PARAMS), ...p }
})

/**
 * Built-in looks. Deliberately subtle — QuickPix is about quick, tasteful
 * touch-ups, not Instagram-2012 heavy filters.
 */
export const BUILTIN_PRESETS: BuiltinPreset[] = [
  make('Auto Pop', { contrast: 18, vibrance: 22, clarity: 10, shadows: 12 }),
  make('Golden Hour', { temp: 22, exposure: 0.15, highlights: -15, vibrance: 15, vignette: -12 }),
  make('Punchy', { contrast: 35, clarity: 25, vibrance: 30, blacks: -10, sharpen: 20 }),
  make('Faded Film', {
    contrast: -15,
    saturation: -18,
    temp: 6,
    grain: 25,
    curve: {
      rgb: [
        { x: 0, y: 0.08 },
        { x: 0.5, y: 0.5 },
        { x: 1, y: 0.96 }
      ],
      r: [
        { x: 0, y: 0 },
        { x: 1, y: 1 }
      ],
      g: [
        { x: 0, y: 0 },
        { x: 1, y: 1 }
      ],
      b: [
        { x: 0, y: 0.04 },
        { x: 1, y: 0.98 }
      ]
    }
  }),
  make('Portra-ish', { temp: 10, tint: 4, contrast: -8, saturation: -10, vibrance: 12, highlights: -10 }),
  make('B&W Classic', { saturation: -100, contrast: 25, clarity: 15, grain: 15 }),
  make('B&W High Contrast', { saturation: -100, contrast: 55, whites: 15, blacks: -20, clarity: 25, grain: 20 }),
  make('Cool Morning', { temp: -18, tint: -4, exposure: 0.1, shadows: 15, vibrance: 10 }),
  make('Matte Portrait', {
    contrast: -10,
    shadows: 20,
    clarity: -15,
    vibrance: 8,
    curve: {
      rgb: [
        { x: 0, y: 0.06 },
        { x: 0.45, y: 0.48 },
        { x: 1, y: 1 }
      ],
      r: [
        { x: 0, y: 0 },
        { x: 1, y: 1 }
      ],
      g: [
        { x: 0, y: 0 },
        { x: 1, y: 1 }
      ],
      b: [
        { x: 0, y: 0 },
        { x: 1, y: 1 }
      ]
    }
  }),
  make('Vivid Landscape', { contrast: 20, vibrance: 40, clarity: 20, highlights: -20, shadows: 10, sharpen: 25 })
]
