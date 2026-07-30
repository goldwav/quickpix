import type { CurvePoint, CurveState } from './editParams'

/**
 * Monotone cubic interpolation (Fritsch–Carlson). Monotonicity matters for
 * tone curves: a plain cubic spline overshoots between close points, which
 * shows up as banding/solarization in the photo.
 */
export function monotoneCubic(points: CurvePoint[]): (x: number) => number {
  const pts = [...points].sort((a, b) => a.x - b.x)
  if (pts.length === 0) return (x) => x
  if (pts.length === 1) return () => pts[0].y

  const n = pts.length
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)

  const dx: number[] = []
  const slope: number[] = []
  for (let i = 0; i < n - 1; i++) {
    dx.push(xs[i + 1] - xs[i] || 1e-6)
    slope.push((ys[i + 1] - ys[i]) / (dx[i] || 1e-6))
  }

  const m: number[] = [slope[0]]
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) {
      m.push(0)
    } else {
      const w1 = 2 * dx[i] + dx[i - 1]
      const w2 = dx[i] + 2 * dx[i - 1]
      m.push((w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]))
    }
  }
  m.push(slope[n - 2])

  return (x: number): number => {
    if (x <= xs[0]) return ys[0]
    if (x >= xs[n - 1]) return ys[n - 1]
    let i = 0
    while (i < n - 2 && x > xs[i + 1]) i++
    const t = (x - xs[i]) / dx[i]
    const h00 = (1 + 2 * t) * (1 - t) * (1 - t)
    const h10 = t * (1 - t) * (1 - t)
    const h01 = t * t * (3 - 2 * t)
    const h11 = t * t * (t - 1)
    return h00 * ys[i] + h10 * dx[i] * m[i] + h01 * ys[i + 1] + h11 * dx[i] * m[i + 1]
  }
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

/**
 * Bake the master + per-channel curves into a 256-entry RGBA8 LUT.
 * Channel value v maps to channelCurve(masterCurve(v)); alpha stays 255.
 */
export function bakeCurveLut(curve: CurveState): Uint8Array {
  const master = monotoneCubic(curve.rgb)
  const fr = monotoneCubic(curve.r)
  const fg = monotoneCubic(curve.g)
  const fb = monotoneCubic(curve.b)

  const lut = new Uint8Array(256 * 4)
  for (let i = 0; i < 256; i++) {
    const x = i / 255
    const m = clamp01(master(x))
    lut[i * 4 + 0] = Math.round(clamp01(fr(m)) * 255)
    lut[i * 4 + 1] = Math.round(clamp01(fg(m)) * 255)
    lut[i * 4 + 2] = Math.round(clamp01(fb(m)) * 255)
    lut[i * 4 + 3] = 255
  }
  return lut
}
