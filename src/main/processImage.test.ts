import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cloneParams, DEFAULT_EDIT_PARAMS } from '@shared/editParams'
import { processImage } from './processImage'

let dir: string
let inputPath: string

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'quickpix-test-'))
  inputPath = join(dir, 'test.png')
  // 120x80 gradient test image
  const w = 120
  const h = 80
  const raw = Buffer.alloc(w * h * 3)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3
      raw[i] = Math.round((x / (w - 1)) * 255)
      raw[i + 1] = Math.round((y / (h - 1)) * 255)
      raw[i + 2] = 128
    }
  }
  await writeFile(inputPath, await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer())
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('processImage (full export path)', () => {
  it('neutral edits produce a valid JPEG with original dimensions', async () => {
    const buf = await processImage(inputPath, cloneParams(DEFAULT_EDIT_PARAMS), { format: 'jpeg', quality: 90 })
    const meta = await sharp(buf).metadata()
    expect(meta.format).toBe('jpeg')
    expect(meta.width).toBe(120)
    expect(meta.height).toBe(80)
  })

  it('edits change the output pixels', async () => {
    const neutral = await processImage(inputPath, cloneParams(DEFAULT_EDIT_PARAMS), { format: 'png', quality: 90 })
    const edited = await processImage(
      inputPath,
      { ...cloneParams(DEFAULT_EDIT_PARAMS), exposure: 1, saturation: -100 },
      { format: 'png', quality: 90 }
    )
    const a = await sharp(neutral).raw().toBuffer()
    const b = await sharp(edited).raw().toBuffer()
    expect(a.length).toBe(b.length)
    expect(a.equals(b)).toBe(false)
    // desaturated output must be gray everywhere
    const { data, info } = await sharp(edited).raw().toBuffer({ resolveWithObject: true })
    for (let i = 0; i < data.length; i += info.channels * 97) {
      const base = i - (i % info.channels)
      expect(data[base]).toBe(data[base + 1])
      expect(data[base + 1]).toBe(data[base + 2])
    }
  })

  it('crop changes output dimensions', async () => {
    const buf = await processImage(
      inputPath,
      { ...cloneParams(DEFAULT_EDIT_PARAMS), crop: { left: 0.25, top: 0.25, width: 0.5, height: 0.5, angle: 0 } },
      { format: 'jpeg', quality: 90 }
    )
    const meta = await sharp(buf).metadata()
    expect(meta.width).toBe(60)
    expect(meta.height).toBe(40)
  })

  it('resize long edge caps output size', async () => {
    const buf = await processImage(inputPath, cloneParams(DEFAULT_EDIT_PARAMS), {
      format: 'webp',
      quality: 80,
      resizeLongEdge: 60
    })
    const meta = await sharp(buf).metadata()
    expect(meta.format).toBe('webp')
    expect(Math.max(meta.width!, meta.height!)).toBe(60)
  })
})
