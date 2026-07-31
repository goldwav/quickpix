import { bakeCurveLut } from './curve'
import { HSL_BAND_CENTERS, type EditParams } from './editParams'

/**
 * CPU implementation of the GPU pipeline, used for full-resolution export
 * (and for unit tests). MUST stay in sync with:
 *   src/renderer/src/gl/shaders/adjust.frag  (geometry + pointwise color)
 *   src/renderer/src/gl/shaders/detail.frag  (sharpen + clarity)
 * Same operations, same constants, same order.
 */

export interface RawImage {
  /** RGBA, row-major, 4 bytes per pixel. */
  data: Uint8ClampedArray
  width: number
  height: number
}

const srgb2lin = (v: number): number => Math.pow(Math.max(v, 0), 2.2)
const lin2srgb = (v: number): number => Math.pow(Math.max(v, 0), 1 / 2.2)
const lumaOf = (r: number, g: number, b: number): number => 0.2126 * r + 0.7152 * g + 0.0722 * b
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
const fract = (v: number): number => v - Math.floor(v)
const hash = (x: number, y: number): number => fract(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453)

/** h, s, l all 0..1 (mirrors adjust.frag rgb2hsl). */
function rgb2hsl(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const l = (mx + mn) * 0.5
  if (mx === mn) return [0, 0, l]
  const d = mx - mn
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
  let h: number
  if (mx === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (mx === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [h / 6, s, l]
}

function hue2channel(p: number, q: number, t: number): number {
  t = fract(t)
  if (t < 1 / 6) return p + (q - p) * 6 * t
  if (t < 0.5) return q
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
  return p
}

function hsl2rgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  return [hue2channel(p, q, h + 1 / 3), hue2channel(p, q, h), hue2channel(p, q, h - 1 / 3)]
}

function bandWeight(hueDeg: number, center: number): number {
  const d = Math.abs(((((hueDeg - center + 180) % 360) + 360) % 360) - 180)
  return Math.max(0, 1 - d / 45)
}

/** Output dimensions for a given source size + params (crop applied). */
export function outputDims(width: number, height: number, params: EditParams): { width: number; height: number } {
  if (!params.crop) return { width, height }
  return {
    width: Math.max(1, Math.round(params.crop.width * width)),
    height: Math.max(1, Math.round(params.crop.height * height))
  }
}

/** Bilinear sample from an RGBA buffer; uv clamped to edges. */
function sampleBilinear(img: RawImage, u: number, v: number, out: [number, number, number, number]): void {
  const x = clamp01(u) * (img.width - 1)
  const y = clamp01(v) * (img.height - 1)
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(x0 + 1, img.width - 1)
  const y1 = Math.min(y0 + 1, img.height - 1)
  const fx = x - x0
  const fy = y - y0
  const d = img.data
  for (let ch = 0; ch < 4; ch++) {
    const p00 = d[(y0 * img.width + x0) * 4 + ch]
    const p10 = d[(y0 * img.width + x1) * 4 + ch]
    const p01 = d[(y1 * img.width + x0) * 4 + ch]
    const p11 = d[(y1 * img.width + x1) * 4 + ch]
    out[ch] = (p00 * (1 - fx) + p10 * fx) * (1 - fy) + (p01 * (1 - fx) + p11 * fx) * fy
  }
}

/** Geometry stage: crop + straighten with auto-fill scale (mirrors adjust.frag). */
export function applyGeometry(src: RawImage, params: EditParams): RawImage {
  const crop = params.crop
  if (!crop) return src

  const W = src.width
  const H = src.height
  const { width: outW, height: outH } = outputDims(W, H, params)
  const theta = (crop.angle * Math.PI) / 180
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  const ac = Math.abs(cos)
  const as = Math.abs(sin)
  const k = Math.min(W / (W * ac + H * as), H / (W * as + H * ac))

  const out = new Uint8ClampedArray(outW * outH * 4)
  const px: [number, number, number, number] = [0, 0, 0, 0]

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      // Output pixel center -> uv in the crop rect -> rotated source uv.
      const fu = crop.left + ((x + 0.5) / outW) * crop.width
      const fv = crop.top + ((y + 0.5) / outH) * crop.height
      const pxX = (fu - 0.5) * W
      const pxY = (fv - 0.5) * H
      const sx = (cos * pxX - sin * pxY) * k
      const sy = (sin * pxX + cos * pxY) * k
      sampleBilinear(src, sx / W + 0.5, sy / H + 0.5, px)
      const o = (y * outW + x) * 4
      out[o] = px[0]
      out[o + 1] = px[1]
      out[o + 2] = px[2]
      out[o + 3] = px[3]
    }
  }
  return { data: out, width: outW, height: outH }
}

/** Pointwise color stage (mirrors adjust.frag), in place. */
export function applyColor(img: RawImage, params: EditParams): void {
  const lut = bakeCurveLut(params.curve)
  const exposure = Math.pow(2, params.exposure)
  const contrast = params.contrast / 100
  const highlights = params.highlights / 100
  const shadows = params.shadows / 100
  const whites = params.whites / 100
  const blacks = params.blacks / 100
  const temp = params.temp / 100
  const tint = params.tint / 100
  const vibrance = params.vibrance / 100
  const saturation = params.saturation / 100
  const vignette = params.vignette / 100
  const grain = params.grain / 100

  const whitePoint = 1 - 0.25 * whites
  const blackPoint = -0.25 * blacks
  const levelDiv = Math.max(whitePoint - blackPoint, 0.05)

  const hslHue = params.hsl.hue.map((v) => v / 100)
  const hslSat = params.hsl.sat.map((v) => v / 100)
  const hslLum = params.hsl.lum.map((v) => v / 100)
  const hslActive = hslHue.some((v) => v !== 0) || hslSat.some((v) => v !== 0) || hslLum.some((v) => v !== 0)
  const splitShadowSat = params.split.shadowSat / 100
  const splitHighSat = params.split.highlightSat / 100
  const splitActive = splitShadowSat > 0 || splitHighSat > 0
  const splitMid = 0.5 + (params.split.balance / 100) * 0.25
  const shadowTint = hsl2rgb(params.split.shadowHue / 360, 1, 0.5)
  const highTint = hsl2rgb(params.split.highlightHue / 360, 1, 0.5)

  const d = img.data
  const w = img.width
  const h = img.height

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      let r = srgb2lin(d[i] / 255)
      let g = srgb2lin(d[i + 1] / 255)
      let b = srgb2lin(d[i + 2] / 255)

      // White balance
      r *= 1 + 0.25 * temp
      b *= 1 - 0.25 * temp
      g *= 1 - 0.2 * tint

      // Exposure
      r *= exposure
      g *= exposure
      b *= exposure

      // Highlights / shadows
      const l = lumaOf(r, g, b)
      const highlightMask = smoothstep(0.35, 1.0, l)
      const shadowMask = 1 - smoothstep(0.0, 0.45, l)
      let lNew = l
      lNew += highlights * highlightMask * 0.6 * l
      lNew += shadows * shadowMask * 0.35 * (1 - Math.min(l, 1))
      if (l > 1e-5) {
        const f = lNew / l
        r *= f
        g *= f
        b *= f
      }

      r = lin2srgb(r)
      g = lin2srgb(g)
      b = lin2srgb(b)

      // Whites / blacks levels
      r = (r - blackPoint) / levelDiv
      g = (g - blackPoint) / levelDiv
      b = (b - blackPoint) / levelDiv

      // Contrast
      if (contrast > 0) {
        const k = Math.min(contrast, 1)
        const sr = clamp01(r)
        const sg = clamp01(g)
        const sb = clamp01(b)
        r = r + (sr * sr * (3 - 2 * sr) - r) * k
        g = g + (sg * sg * (3 - 2 * sg) - g) * k
        b = b + (sb * sb * (3 - 2 * sb) - b) * k
      } else if (contrast < 0) {
        const k = Math.min(-contrast, 1)
        r = r + (0.5 + (r - 0.5) * 0.75 - r) * k
        g = g + (0.5 + (g - 0.5) * 0.75 - g) * k
        b = b + (0.5 + (b - 0.5) * 0.75 - b) * k
      }

      // Vibrance
      let lu = lumaOf(r, g, b)
      const satLevel = clamp01((Math.max(r, g, b) - Math.min(r, g, b)) * 1.5)
      const vibAmt = 1 + vibrance * (1 - satLevel)
      r = lu + (r - lu) * vibAmt
      g = lu + (g - lu) * vibAmt
      b = lu + (b - lu) * vibAmt

      // Saturation
      lu = lumaOf(r, g, b)
      const satAmt = 1 + saturation
      r = lu + (r - lu) * satAmt
      g = lu + (g - lu) * satAmt
      b = lu + (b - lu) * satAmt

      r = clamp01(r)
      g = clamp01(g)
      b = clamp01(b)

      // HSL color mixer (mirrors adjust.frag: neutral-protected 8 bands)
      if (hslActive) {
        const [hh, hs, hl] = rgb2hsl(r, g, b)
        const neutralMask = smoothstep(0.03, 0.12, hs)
        if (neutralMask > 0) {
          const hueDeg = hh * 360
          let hueShift = 0
          let satAdj = 0
          let lumAdj = 0
          for (let bi = 0; bi < 8; bi++) {
            const bw = bandWeight(hueDeg, HSL_BAND_CENTERS[bi]) * neutralMask
            hueShift += bw * hslHue[bi] * 30
            satAdj += bw * hslSat[bi]
            lumAdj += bw * hslLum[bi]
          }
          const nh = fract(hh + hueShift / 360)
          const ns = clamp01(hs * (1 + satAdj))
          const nl = clamp01(hl * (1 + lumAdj * 0.5))
          ;[r, g, b] = hsl2rgb(nh, ns, nl)
        }
      }

      // Tone curve LUT
      r = lut[Math.round(r * 255) * 4] / 255
      g = lut[Math.round(g * 255) * 4 + 1] / 255
      b = lut[Math.round(b * 255) * 4 + 2] / 255

      // Split toning (mirrors adjust.frag)
      if (splitActive) {
        const lum = lumaOf(r, g, b)
        const highW = smoothstep(splitMid, 1, lum)
        const shadowW = 1 - smoothstep(0, splitMid, lum)
        r += (shadowTint[0] - 0.5) * splitShadowSat * 0.3 * shadowW + (highTint[0] - 0.5) * splitHighSat * 0.3 * highW
        g += (shadowTint[1] - 0.5) * splitShadowSat * 0.3 * shadowW + (highTint[1] - 0.5) * splitHighSat * 0.3 * highW
        b += (shadowTint[2] - 0.5) * splitShadowSat * 0.3 * shadowW + (highTint[2] - 0.5) * splitHighSat * 0.3 * highW
        r = clamp01(r)
        g = clamp01(g)
        b = clamp01(b)
      }

      // Vignette
      const u = (x + 0.5) / w - 0.5
      const v = (y + 0.5) / h - 0.5
      const dist = Math.hypot(u, v) * 1.41421356
      const vig = Math.min(Math.max(1 + vignette * smoothstep(0.4, 1.05, dist) * 0.85, 0), 2)
      r *= vig
      g *= vig
      b *= vig

      // Grain
      if (grain > 0) {
        const gu = (x + 0.5) / w
        const gv = (y + 0.5) / h
        const gr = (hash(Math.floor(gu * 900) + 0.07, Math.floor(gv * 900) + 0.07) - 0.5) * grain * 0.18
        const shadowBoost = 0.35 + 0.65 * (1 - lumaOf(r, g, b))
        r += gr * shadowBoost
        g += gr * shadowBoost
        b += gr * shadowBoost
      }

      d[i] = Math.round(clamp01(r) * 255)
      d[i + 1] = Math.round(clamp01(g) * 255)
      d[i + 2] = Math.round(clamp01(b) * 255)
    }
  }
}

/** Box-downsample + bilinear-upsample luminance, approximating the GPU mip blur. */
function blurredCopy(img: RawImage, factor: number): RawImage {
  const sw = Math.max(1, Math.round(img.width / factor))
  const sh = Math.max(1, Math.round(img.height / factor))
  const small = new Float32Array(sw * sh * 4)
  const counts = new Float32Array(sw * sh)
  const d = img.data
  for (let y = 0; y < img.height; y++) {
    const sy = Math.min(sh - 1, Math.floor((y / img.height) * sh))
    for (let x = 0; x < img.width; x++) {
      const sx = Math.min(sw - 1, Math.floor((x / img.width) * sw))
      const si = (sy * sw + sx) * 4
      const i = (y * img.width + x) * 4
      small[si] += d[i]
      small[si + 1] += d[i + 1]
      small[si + 2] += d[i + 2]
      small[si + 3] += d[i + 3]
      counts[sy * sw + sx]++
    }
  }
  const smallImg: RawImage = { data: new Uint8ClampedArray(sw * sh * 4), width: sw, height: sh }
  for (let i = 0; i < sw * sh; i++) {
    const c = counts[i] || 1
    smallImg.data[i * 4] = small[i * 4] / c
    smallImg.data[i * 4 + 1] = small[i * 4 + 1] / c
    smallImg.data[i * 4 + 2] = small[i * 4 + 2] / c
    smallImg.data[i * 4 + 3] = small[i * 4 + 3] / c
  }
  return smallImg
}

/** Detail stage: sharpen + clarity (mirrors detail.frag). Returns a new buffer. */
export function applyDetail(img: RawImage, params: EditParams): RawImage {
  const sharpen = Math.max(0, params.sharpen / 100)
  const clarity = params.clarity / 100
  if (sharpen === 0 && clarity === 0) return img

  const w = img.width
  const h = img.height
  const src = img.data
  const out = new Uint8ClampedArray(src) // copy; alpha preserved

  // The GPU clarity blur samples mip level log2(max/64) => blur factor max/64.
  const low = clarity !== 0 ? blurredCopy(img, Math.max(4, Math.max(w, h) / 64)) : null
  const px: [number, number, number, number] = [0, 0, 0, 0]

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      let r = src[i] / 255
      let g = src[i + 1] / 255
      let b = src[i + 2] / 255

      if (sharpen > 0) {
        const xm = Math.max(0, x - 1)
        const xp = Math.min(w - 1, x + 1)
        const ym = Math.max(0, y - 1)
        const yp = Math.min(h - 1, y + 1)
        for (let ch = 0; ch < 3; ch++) {
          const c = src[i + ch] / 255
          const n = src[(ym * w + x) * 4 + ch] / 255
          const s = src[(yp * w + x) * 4 + ch] / 255
          const e = src[(y * w + xp) * 4 + ch] / 255
          const ww = src[(y * w + xm) * 4 + ch] / 255
          const blurred = (c * 4 + n + s + e + ww) * 0.125
          const v = c + (c - blurred) * sharpen * 3
          if (ch === 0) r = v
          else if (ch === 1) g = v
          else b = v
        }
      }

      if (clarity !== 0 && low) {
        const l = lumaOf(r, g, b)
        sampleBilinear(low, (x + 0.5) / w, (y + 0.5) / h, px)
        const lowLum = lumaOf(px[0] / 255, px[1] / 255, px[2] / 255)
        const detail = l - lowLum
        const midtoneWeight = 1 - Math.abs(l * 2 - 1)
        const lNew = l + detail * clarity * 1.2 * midtoneWeight
        if (l > 1e-5) {
          const f = Math.min(Math.max(lNew, 0), 1.5) / l
          r *= f
          g *= f
          b *= f
        }
      }

      out[i] = Math.round(clamp01(r) * 255)
      out[i + 1] = Math.round(clamp01(g) * 255)
      out[i + 2] = Math.round(clamp01(b) * 255)
    }
  }
  return { data: out, width: w, height: h }
}

/** Full pipeline: geometry -> color -> detail. Returns the final buffer. */
export function applyEdits(src: RawImage, params: EditParams): RawImage {
  const geo = applyGeometry(src, params)
  // applyGeometry may return src itself; copy before mutating in that case.
  const work: RawImage = geo === src ? { data: new Uint8ClampedArray(src.data), width: src.width, height: src.height } : geo
  applyColor(work, params)
  return applyDetail(work, params)
}
