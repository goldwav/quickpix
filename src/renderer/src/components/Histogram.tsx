import { useEffect, useRef } from 'react'
import { useEditStore } from '../state/editStore'

const W = 276
const H = 110

/** RGB histogram with additive channel blending, Lightroom-style. */
export function Histogram(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const histogram = useEditStore((s) => s.histogram)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#111'
    ctx.fillRect(0, 0, W, H)

    if (!histogram || histogram.total === 0) return

    // Normalize against a high percentile-ish peak so one spike doesn't
    // flatten everything (ignore pure black/white end bins for the peak).
    const channels = [histogram.r, histogram.g, histogram.b]
    let peak = 1
    for (const ch of channels) {
      for (let i = 1; i < 255; i++) if (ch[i] > peak) peak = ch[i]
    }

    ctx.globalCompositeOperation = 'screen'
    const colors = ['#c0392b', '#27ae60', '#2f6fb2']
    channels.forEach((ch, ci) => {
      ctx.fillStyle = colors[ci]
      ctx.beginPath()
      ctx.moveTo(0, H)
      for (let i = 0; i < 256; i++) {
        const x = (i / 255) * W
        const y = H - Math.min(ch[i] / peak, 1) * (H - 4)
        ctx.lineTo(x, y)
      }
      ctx.lineTo(W, H)
      ctx.closePath()
      ctx.fill()
    })
    ctx.globalCompositeOperation = 'source-over'
  }, [histogram])

  // Clipping: fraction of pixels pinned to pure black / pure white.
  let shadowClip = 0
  let highlightClip = 0
  if (histogram && histogram.total > 0) {
    shadowClip = (histogram.r[0] + histogram.g[0] + histogram.b[0]) / (3 * histogram.total)
    highlightClip = (histogram.r[255] + histogram.g[255] + histogram.b[255]) / (3 * histogram.total)
  }
  const CLIP_THRESHOLD = 0.001

  return (
    <div className="histogram">
      <canvas ref={canvasRef} width={W} height={H} />
      <div
        className={`clip-indicator left${shadowClip > CLIP_THRESHOLD ? ' active' : ''}`}
        title={`Shadow clipping: ${(shadowClip * 100).toFixed(1)}%`}
      />
      <div
        className={`clip-indicator right${highlightClip > CLIP_THRESHOLD ? ' active' : ''}`}
        title={`Highlight clipping: ${(highlightClip * 100).toFixed(1)}%`}
      />
    </div>
  )
}
