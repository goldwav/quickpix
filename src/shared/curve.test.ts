import { describe, expect, it } from 'vitest'
import { bakeCurveLut, monotoneCubic } from './curve'
import { IDENTITY_CURVE } from './editParams'

describe('monotoneCubic', () => {
  it('reproduces the identity for two identity points', () => {
    const fn = monotoneCubic([
      { x: 0, y: 0 },
      { x: 1, y: 1 }
    ])
    for (let i = 0; i <= 10; i++) {
      expect(fn(i / 10)).toBeCloseTo(i / 10, 6)
    }
  })

  it('passes through its control points', () => {
    const pts = [
      { x: 0, y: 0.1 },
      { x: 0.4, y: 0.7 },
      { x: 1, y: 0.9 }
    ]
    const fn = monotoneCubic(pts)
    for (const p of pts) expect(fn(p.x)).toBeCloseTo(p.y, 6)
  })

  it('stays monotonic between monotonic control points (no overshoot)', () => {
    const fn = monotoneCubic([
      { x: 0, y: 0 },
      { x: 0.45, y: 0.05 },
      { x: 0.55, y: 0.95 },
      { x: 1, y: 1 }
    ])
    let prev = -Infinity
    for (let i = 0; i <= 200; i++) {
      const v = fn(i / 200)
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9)
      expect(v).toBeGreaterThanOrEqual(-1e-9)
      expect(v).toBeLessThanOrEqual(1 + 1e-9)
      prev = v
    }
  })

  it('clamps outside the control range', () => {
    const fn = monotoneCubic([
      { x: 0.2, y: 0.3 },
      { x: 0.8, y: 0.7 }
    ])
    expect(fn(0)).toBeCloseTo(0.3)
    expect(fn(1)).toBeCloseTo(0.7)
  })
})

describe('bakeCurveLut', () => {
  it('identity curve bakes to an identity LUT', () => {
    const lut = bakeCurveLut(IDENTITY_CURVE)
    for (let i = 0; i < 256; i++) {
      expect(Math.abs(lut[i * 4] - i)).toBeLessThanOrEqual(1)
      expect(Math.abs(lut[i * 4 + 1] - i)).toBeLessThanOrEqual(1)
      expect(Math.abs(lut[i * 4 + 2] - i)).toBeLessThanOrEqual(1)
      expect(lut[i * 4 + 3]).toBe(255)
    }
  })

  it('master curve composes into every channel', () => {
    const lut = bakeCurveLut({
      ...IDENTITY_CURVE,
      rgb: [
        { x: 0, y: 0 },
        { x: 0.5, y: 0.75 },
        { x: 1, y: 1 }
      ]
    })
    expect(lut[128 * 4]).toBeGreaterThan(180) // 0.5 lifted toward 0.75
    expect(lut[128 * 4 + 1]).toBe(lut[128 * 4])
    expect(lut[128 * 4 + 2]).toBe(lut[128 * 4])
  })
})
