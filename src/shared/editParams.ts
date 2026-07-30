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
