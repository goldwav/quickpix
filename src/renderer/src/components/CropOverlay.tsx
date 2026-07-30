import { useEffect, useRef, useState } from 'react'
import type { CropState } from '@shared/editParams'
import type { FitRect } from '../gl/pipeline'
import { useEditStore } from '../state/editStore'

interface CropOverlayProps {
  /** Letterbox rect of the (uncropped) rendered frame, in CSS pixels. */
  fit: FitRect
  imageWidth: number
  imageHeight: number
}

const FULL: CropState = { left: 0, top: 0, width: 1, height: 1, angle: 0 }
const MIN_FRAC = 0.05

type DragMode = 'move' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

const ASPECTS: { label: string; ratio: number | null }[] = [
  { label: 'Free', ratio: null },
  { label: '1 : 1', ratio: 1 },
  { label: '3 : 2', ratio: 3 / 2 },
  { label: '4 : 3', ratio: 4 / 3 },
  { label: '16 : 9', ratio: 16 / 9 }
]

export function CropOverlay({ fit, imageWidth, imageHeight }: CropOverlayProps): React.JSX.Element {
  const params = useEditStore((s) => s.params)
  const setParams = useEditStore((s) => s.setParams)
  const setCropMode = useEditStore((s) => s.setCropMode)

  const crop = params.crop ?? FULL
  const [aspect, setAspect] = useState<number | null>(null)
  // Remember the crop as it was when the tool opened, for Cancel.
  const originalCrop = useRef<CropState | null>(params.crop)
  const drag = useRef<{ mode: DragMode; startX: number; startY: number; start: CropState } | null>(null)

  // ESC cancels, Enter commits.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') cancel()
      if (e.key === 'Enter') done()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.crop])

  const setCrop = (c: CropState): void => setParams({ crop: c })

  const done = (): void => {
    const c = params.crop
    if (c && c.left === 0 && c.top === 0 && c.width === 1 && c.height === 1 && c.angle === 0) {
      setParams({ crop: null })
    }
    setCropMode(false)
  }

  const cancel = (): void => {
    setParams({ crop: originalCrop.current })
    setCropMode(false)
  }

  const applyAspect = (ratio: number | null): void => {
    setAspect(ratio)
    if (ratio === null) return
    // Fit the largest centered rect of the requested pixel aspect.
    const frameAspect = imageWidth / imageHeight
    let w: number
    let h: number
    if (ratio >= frameAspect) {
      w = 1
      h = frameAspect / ratio
    } else {
      w = ratio / frameAspect
      h = 1
    }
    setCrop({ ...crop, left: (1 - w) / 2, top: (1 - h) / 2, width: w, height: h })
  }

  const onPointerDown = (mode: DragMode) => (e: React.PointerEvent) => {
    e.stopPropagation()
    drag.current = { mode, startX: e.clientX, startY: e.clientY, start: { ...crop } }
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent): void => {
    const d = drag.current
    if (!d) return
    const dx = (e.clientX - d.startX) / fit.w
    const dy = (e.clientY - d.startY) / fit.h
    const s = d.start
    let { left, top, width, height } = s

    if (d.mode === 'move') {
      left = Math.min(1 - width, Math.max(0, s.left + dx))
      top = Math.min(1 - height, Math.max(0, s.top + dy))
      setCrop({ ...crop, left, top, width, height })
      return
    }

    const right0 = s.left + s.width
    const bottom0 = s.top + s.height
    let leftN = s.left
    let topN = s.top
    let rightN = right0
    let bottomN = bottom0

    if (d.mode.includes('w')) leftN = Math.min(right0 - MIN_FRAC, Math.max(0, s.left + dx))
    if (d.mode.includes('e')) rightN = Math.max(s.left + MIN_FRAC, Math.min(1, right0 + dx))
    if (d.mode.includes('n')) topN = Math.min(bottom0 - MIN_FRAC, Math.max(0, s.top + dy))
    if (d.mode.includes('s')) bottomN = Math.max(s.top + MIN_FRAC, Math.min(1, bottom0 + dy))

    left = leftN
    top = topN
    width = rightN - leftN
    height = bottomN - topN

    // Aspect lock: derive height from width (or vice versa for n/s edges),
    // anchored at the corner opposite the drag.
    if (aspect !== null) {
      const frameAspect = imageWidth / imageHeight
      const targetHFrac = (w: number): number => (w * frameAspect) / aspect
      if (d.mode === 'n' || d.mode === 's') {
        const newW = Math.min(1, (height * aspect) / frameAspect)
        width = newW
        left = Math.min(1 - newW, Math.max(0, s.left + (s.width - newW) / 2))
      } else {
        let newH = targetHFrac(width)
        if (newH > 1) {
          newH = 1
          width = (newH * aspect) / frameAspect
          if (d.mode.includes('w')) left = right0 - width
        }
        height = newH
        top = d.mode.includes('n') ? bottom0 - height : s.top
        if (top < 0) top = 0
        if (top + height > 1) top = 1 - height
      }
    }

    setCrop({ ...crop, left, top, width, height })
  }

  const onPointerUp = (): void => {
    drag.current = null
  }

  // CSS geometry of the crop rect within the letterboxed frame.
  const rect = {
    left: fit.x + crop.left * fit.w,
    top: fit.y + crop.top * fit.h,
    width: crop.width * fit.w,
    height: crop.height * fit.h
  }

  const handles: DragMode[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

  return (
    <div className="crop-overlay" onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
      {/* dim everything outside the crop rect */}
      <div className="crop-dim" style={{ left: 0, top: 0, right: 0, height: rect.top }} />
      <div className="crop-dim" style={{ left: 0, top: rect.top, width: rect.left, height: rect.height }} />
      <div
        className="crop-dim"
        style={{ left: rect.left + rect.width, top: rect.top, right: 0, height: rect.height }}
      />
      <div className="crop-dim" style={{ left: 0, top: rect.top + rect.height, right: 0, bottom: 0 }} />

      <div className="crop-rect" style={rect} onPointerDown={onPointerDown('move')}>
        {/* rule-of-thirds grid */}
        {[1, 2].map((i) => (
          <div key={`v${i}`} className="thirds v" style={{ left: `${(i / 3) * 100}%` }} />
        ))}
        {[1, 2].map((i) => (
          <div key={`h${i}`} className="thirds h" style={{ top: `${(i / 3) * 100}%` }} />
        ))}
        {handles.map((h) => (
          <div key={h} className={`crop-handle ${h}`} onPointerDown={onPointerDown(h)} />
        ))}
      </div>

      <div className="crop-toolbar" onPointerDown={(e) => e.stopPropagation()}>
        <select value={aspect === null ? 'free' : String(aspect)} onChange={(e) => applyAspect(e.target.value === 'free' ? null : Number(e.target.value))}>
          {ASPECTS.map((a) => (
            <option key={a.label} value={a.ratio === null ? 'free' : String(a.ratio)}>
              {a.label}
            </option>
          ))}
        </select>
        <label className="angle-label">
          Straighten
          <input
            type="range"
            min={-45}
            max={45}
            step={0.1}
            value={crop.angle}
            onChange={(e) => setCrop({ ...crop, angle: Number(e.target.value) })}
            onDoubleClick={() => setCrop({ ...crop, angle: 0 })}
          />
          <span className="angle-value">{crop.angle.toFixed(1)}°</span>
        </label>
        <button className="btn" onClick={() => setCrop({ ...FULL })}>
          Reset
        </button>
        <button className="btn" onClick={cancel}>
          Cancel
        </button>
        <button className="btn primary" onClick={done}>
          Done
        </button>
      </div>
    </div>
  )
}
