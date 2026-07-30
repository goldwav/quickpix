import { describe, expect, it } from 'vitest'
import { cloneParams, DEFAULT_EDIT_PARAMS, isNeutral, normalizeParams } from './editParams'

describe('normalizeParams', () => {
  it('returns defaults for garbage input', () => {
    expect(normalizeParams(null)).toEqual(DEFAULT_EDIT_PARAMS)
    expect(normalizeParams('nope')).toEqual(DEFAULT_EDIT_PARAMS)
    expect(normalizeParams(42)).toEqual(DEFAULT_EDIT_PARAMS)
  })

  it('merges partial params over defaults', () => {
    const p = normalizeParams({ exposure: 1.5, contrast: 30 })
    expect(p.exposure).toBe(1.5)
    expect(p.contrast).toBe(30)
    expect(p.saturation).toBe(0)
    expect(p.crop).toBeNull()
  })

  it('rejects non-finite numbers', () => {
    const p = normalizeParams({ exposure: NaN, contrast: Infinity, temp: 10 })
    expect(p.exposure).toBe(0)
    expect(p.contrast).toBe(0)
    expect(p.temp).toBe(10)
  })

  it('accepts a valid crop and curve', () => {
    const p = normalizeParams({
      crop: { left: 0.1, top: 0.1, width: 0.5, height: 0.5, angle: 3 },
      curve: { rgb: [{ x: 0, y: 0.1 }, { x: 1, y: 1 }] }
    })
    expect(p.crop?.width).toBe(0.5)
    expect(p.curve.rgb[0].y).toBe(0.1)
    expect(p.curve.r).toEqual(DEFAULT_EDIT_PARAMS.curve.r)
  })

  it('survives a sidecar JSON round-trip', () => {
    const original = cloneParams(DEFAULT_EDIT_PARAMS)
    original.exposure = 0.75
    original.crop = { left: 0, top: 0, width: 0.8, height: 0.9, angle: -2.5 }
    const roundTripped = normalizeParams(JSON.parse(JSON.stringify(original)))
    expect(roundTripped).toEqual(original)
  })
})

describe('isNeutral', () => {
  it('true for defaults, false after any change', () => {
    expect(isNeutral(cloneParams(DEFAULT_EDIT_PARAMS))).toBe(true)
    const p = cloneParams(DEFAULT_EDIT_PARAMS)
    p.vibrance = 5
    expect(isNeutral(p)).toBe(false)
  })
})
