/**
 * EditParams is the single source of truth for a photo's edit state.
 * Sliders write it, the GL pipeline renders it, presets are named copies of
 * it, sidecars serialize it, and export replays it at full resolution.
 */

/** A control point of the tone curve; both axes are 0..1. */
export interface CurvePoint {
  x: number
  y: number
}

export interface CurveState {
  /** Master (luminance) curve. */
  rgb: CurvePoint[]
  r: CurvePoint[]
  g: CurvePoint[]
  b: CurvePoint[]
}

/** Crop rectangle in image-relative fractions, plus straighten angle. */
export interface CropState {
  left: number
  top: number
  width: number
  height: number
  /** Straighten angle in degrees, -45..45. */
  angle: number
}

/** The 8 HSL mixer bands, in hue order. Centers: 0/30/60/120/180/240/280/320°. */
export const HSL_BANDS = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'] as const
export const HSL_BAND_CENTERS = [0, 30, 60, 120, 180, 240, 280, 320] as const

/** Per-band adjustments, each 8 entries of -100..100. */
export interface HslMix {
  hue: number[]
  sat: number[]
  lum: number[]
}

/** Split toning: tint shadows and highlights independently. */
export interface SplitToning {
  /** Hues in degrees 0..360. */
  shadowHue: number
  /** Saturations 0..100 (0 = off). */
  shadowSat: number
  highlightHue: number
  highlightSat: number
  /** -100 (favor shadows) .. 100 (favor highlights). */
  balance: number
}

export interface EditParams {
  /** Exposure in EV stops, -5..+5. */
  exposure: number
  /** All following tone/color values are -100..+100 (0 = neutral). */
  contrast: number
  highlights: number
  shadows: number
  whites: number
  blacks: number
  temp: number
  tint: number
  vibrance: number
  saturation: number
  /** Clarity -100..100 (negative softens), sharpen 0..100. */
  clarity: number
  sharpen: number
  /** Effects: vignette -100 (dark corners)..+100 (bright), grain 0..100. */
  vignette: number
  grain: number
  hsl: HslMix
  split: SplitToning
  curve: CurveState
  crop: CropState | null
}

export const IDENTITY_CURVE: CurveState = {
  rgb: [
    { x: 0, y: 0 },
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

export const DEFAULT_EDIT_PARAMS: EditParams = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  temp: 0,
  tint: 0,
  vibrance: 0,
  saturation: 0,
  clarity: 0,
  sharpen: 0,
  vignette: 0,
  grain: 0,
  hsl: {
    hue: [0, 0, 0, 0, 0, 0, 0, 0],
    sat: [0, 0, 0, 0, 0, 0, 0, 0],
    lum: [0, 0, 0, 0, 0, 0, 0, 0]
  },
  split: { shadowHue: 0, shadowSat: 0, highlightHue: 50, highlightSat: 0, balance: 0 },
  curve: IDENTITY_CURVE,
  crop: null
}

export function cloneParams(p: EditParams): EditParams {
  return structuredClone(p)
}

/** True when every parameter is at its neutral value (photo untouched). */
export function isNeutral(p: EditParams): boolean {
  return JSON.stringify(p) === JSON.stringify(DEFAULT_EDIT_PARAMS)
}

/**
 * Merge possibly-partial/foreign data (old sidecars, hand-edited files) onto
 * defaults so the rest of the app can rely on a complete, well-typed object.
 */
export function normalizeParams(raw: unknown): EditParams {
  const base = cloneParams(DEFAULT_EDIT_PARAMS)
  if (typeof raw !== 'object' || raw === null) return base
  const src = raw as Record<string, unknown>

  for (const key of Object.keys(base) as (keyof EditParams)[]) {
    if (key === 'curve' || key === 'crop') continue
    const v = src[key]
    if (typeof v === 'number' && Number.isFinite(v)) {
      base[key] = v as never
    }
  }

  const hsl = src['hsl'] as Partial<HslMix> | undefined
  if (hsl && typeof hsl === 'object') {
    for (const ch of ['hue', 'sat', 'lum'] as const) {
      const arr = hsl[ch]
      if (Array.isArray(arr) && arr.length === 8 && arr.every((n) => typeof n === 'number' && Number.isFinite(n))) {
        base.hsl[ch] = [...arr]
      }
    }
  }

  const split = src['split'] as Partial<SplitToning> | undefined
  if (split && typeof split === 'object') {
    for (const key of ['shadowHue', 'shadowSat', 'highlightHue', 'highlightSat', 'balance'] as const) {
      const v = split[key]
      if (typeof v === 'number' && Number.isFinite(v)) base.split[key] = v
    }
  }

  const curve = src['curve'] as Partial<CurveState> | undefined
  if (curve && typeof curve === 'object') {
    for (const ch of ['rgb', 'r', 'g', 'b'] as const) {
      const pts = curve[ch]
      if (Array.isArray(pts) && pts.every((p) => typeof p?.x === 'number' && typeof p?.y === 'number')) {
        base.curve[ch] = pts.map((p) => ({ x: p.x, y: p.y }))
      }
    }
  }

  const crop = src['crop'] as CropState | null | undefined
  if (
    crop &&
    typeof crop === 'object' &&
    [crop.left, crop.top, crop.width, crop.height, crop.angle].every((n) => typeof n === 'number' && Number.isFinite(n))
  ) {
    base.crop = { left: crop.left, top: crop.top, width: crop.width, height: crop.height, angle: crop.angle }
  }

  return base
}
