import { describe, expect, it } from 'vitest'
import { applyEdits, applyGeometry, outputDims, type RawImage } from './editMath'
import { cloneParams, DEFAULT_EDIT_PARAMS, type EditParams } from './editParams'

function makeImage(width: number, height: number, fill?: [number, number, number]): RawImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    if (fill) {
      data[i * 4] = fill[0]
      data[i * 4 + 1] = fill[1]
      data[i * 4 + 2] = fill[2]
    } else {
      // horizontal ramp with some color variation
      const x = i % width
      data[i * 4] = Math.round((x / (width - 1)) * 255)
      data[i * 4 + 1] = 100
      data[i * 4 + 2] = 200
    }
    data[i * 4 + 3] = 255
  }
  return { data, width, height }
}

const params = (p: Partial<EditParams>): EditParams => ({ ...cloneParams(DEFAULT_EDIT_PARAMS), ...p })

const px = (img: RawImage, x: number, y: number): number[] => {
  const i = (y * img.width + x) * 4
  return [img.data[i], img.data[i + 1], img.data[i + 2]]
}

describe('applyEdits', () => {
  it('neutral params leave pixels (nearly) unchanged', () => {
    const src = makeImage(32, 16)
    const out = applyEdits(src, cloneParams(DEFAULT_EDIT_PARAMS))
    expect(out.width).toBe(32)
    expect(out.height).toBe(16)
    for (let i = 0; i < out.data.length; i += 4) {
      expect(Math.abs(out.data[i] - src.data[i])).toBeLessThanOrEqual(1)
      expect(Math.abs(out.data[i + 1] - src.data[i + 1])).toBeLessThanOrEqual(1)
      expect(Math.abs(out.data[i + 2] - src.data[i + 2])).toBeLessThanOrEqual(1)
      expect(out.data[i + 3]).toBe(255)
    }
  })

  it('neutral params do not mutate the source buffer', () => {
    const src = makeImage(8, 8)
    const copy = new Uint8ClampedArray(src.data)
    applyEdits(src, cloneParams(DEFAULT_EDIT_PARAMS))
    expect([...src.data]).toEqual([...copy])
  })

  it('+1 EV doubles linear light', () => {
    const src = makeImage(4, 4, [128, 128, 128])
    const out = applyEdits(src, params({ exposure: 1 }))
    // expected: lin = (128/255)^2.2 * 2, back to gamma
    const expected = Math.round(Math.min(1, Math.pow(Math.pow(128 / 255, 2.2) * 2, 1 / 2.2)) * 255)
    expect(Math.abs(px(out, 1, 1)[0] - expected)).toBeLessThanOrEqual(1)
  })

  it('saturation -100 produces gray', () => {
    const src = makeImage(4, 4, [200, 90, 40])
    const out = applyEdits(src, params({ saturation: -100 }))
    const [r, g, b] = px(out, 2, 2)
    expect(r).toBe(g)
    expect(g).toBe(b)
  })

  it('temp warms: red up, blue down', () => {
    const src = makeImage(4, 4, [120, 120, 120])
    const out = applyEdits(src, params({ temp: 60 }))
    const [r, , b] = px(out, 1, 1)
    expect(r).toBeGreaterThan(120)
    expect(b).toBeLessThan(120)
  })

  it('tone curve lift brightens midtones', () => {
    const src = makeImage(4, 4, [128, 128, 128])
    const out = applyEdits(
      src,
      params({
        curve: {
          ...DEFAULT_EDIT_PARAMS.curve,
          rgb: [
            { x: 0, y: 0 },
            { x: 0.5, y: 0.75 },
            { x: 1, y: 1 }
          ]
        }
      })
    )
    expect(px(out, 1, 1)[0]).toBeGreaterThan(180)
  })

  it('negative vignette darkens corners more than center', () => {
    const src = makeImage(64, 64, [180, 180, 180])
    const out = applyEdits(src, params({ vignette: -100 }))
    expect(px(out, 0, 0)[0]).toBeLessThan(px(out, 32, 32)[0])
  })

  it('sharpen amplifies an edge', () => {
    // vertical hard edge
    const src = makeImage(16, 8, [100, 100, 100])
    for (let y = 0; y < 8; y++) {
      for (let x = 8; x < 16; x++) {
        const i = (y * 16 + x) * 4
        src.data[i] = src.data[i + 1] = src.data[i + 2] = 200
      }
    }
    const out = applyEdits(src, params({ sharpen: 100 }))
    // Pixel just left of the edge should darken (overshoot), just right brighten.
    expect(px(out, 7, 4)[0]).toBeLessThan(100)
    expect(px(out, 8, 4)[0]).toBeGreaterThan(200)
  })
})

describe('geometry', () => {
  it('outputDims reflects the crop', () => {
    expect(outputDims(1000, 500, params({ crop: { left: 0.25, top: 0, width: 0.5, height: 1, angle: 0 } }))).toEqual({
      width: 500,
      height: 500
    })
  })

  it('axis-aligned crop extracts the right region', () => {
    // left half dark, right half bright
    const src = makeImage(16, 8, [50, 50, 50])
    for (let y = 0; y < 8; y++) {
      for (let x = 8; x < 16; x++) {
        const i = (y * 16 + x) * 4
        src.data[i] = src.data[i + 1] = src.data[i + 2] = 250
      }
    }
    const out = applyGeometry(src, params({ crop: { left: 0.5, top: 0, width: 0.5, height: 1, angle: 0 } }))
    expect(out.width).toBe(8)
    expect(out.height).toBe(8)
    expect(px(out, 4, 4)[0]).toBeGreaterThan(240)
  })

  it('straighten rotates content without leaving blank corners', () => {
    const src = makeImage(64, 64, [128, 128, 128])
    const out = applyGeometry(src, params({ crop: { left: 0, top: 0, width: 1, height: 1, angle: 15 } }))
    expect(out.width).toBe(64)
    // corners must be sampled from inside the image (auto-fill), not clamp-smeared black
    expect(px(out, 0, 0)[0]).toBe(128)
    expect(px(out, 63, 63)[0]).toBe(128)
  })
})
