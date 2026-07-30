import { useCallback, useRef, useState } from 'react'
import { monotoneCubic } from '@shared/curve'
import { IDENTITY_CURVE, type CurvePoint, type CurveState } from '@shared/editParams'
import { useEditStore } from '../state/editStore'

const SIZE = 200
const PAD = 8
type Channel = keyof CurveState

const CHANNELS: { key: Channel; label: string; color: string }[] = [
  { key: 'rgb', label: 'RGB', color: '#d6d6d6' },
  { key: 'r', label: 'R', color: '#e05a4e' },
  { key: 'g', label: 'G', color: '#4ec46a' },
  { key: 'b', label: 'B', color: '#5a9ae0' }
]

const toSvg = (p: CurvePoint): { x: number; y: number } => ({
  x: PAD + p.x * (SIZE - PAD * 2),
  y: SIZE - PAD - p.y * (SIZE - PAD * 2)
})

const fromSvg = (x: number, y: number): CurvePoint => ({
  x: Math.min(1, Math.max(0, (x - PAD) / (SIZE - PAD * 2))),
  y: Math.min(1, Math.max(0, (SIZE - PAD - y) / (SIZE - PAD * 2)))
})

export function CurveEditor(): React.JSX.Element {
  const curve = useEditStore((s) => s.params.curve)
  const setParams = useEditStore((s) => s.setParams)
  const [channel, setChannel] = useState<Channel>('rgb')
  const svgRef = useRef<SVGSVGElement>(null)
  const dragIndex = useRef<number>(-1)

  const points = curve[channel]

  const updateChannel = useCallback(
    (pts: CurvePoint[]) => {
      setParams({ curve: { ...curve, [channel]: pts } })
    },
    [curve, channel, setParams]
  )

  const svgPos = (e: React.PointerEvent): { x: number; y: number } => {
    const rect = svgRef.current!.getBoundingClientRect()
    return { x: ((e.clientX - rect.left) / rect.width) * SIZE, y: ((e.clientY - rect.top) / rect.height) * SIZE }
  }

  const onPointerDown = (e: React.PointerEvent): void => {
    const { x, y } = svgPos(e)
    // Grab an existing point if close, otherwise insert a new one.
    let nearest = -1
    let best = 14
    points.forEach((p, i) => {
      const s = toSvg(p)
      const d = Math.hypot(s.x - x, s.y - y)
      if (d < best) {
        best = d
        nearest = i
      }
    })
    if (nearest === -1) {
      const np = fromSvg(x, y)
      const pts = [...points, np].sort((a, b) => a.x - b.x)
      nearest = pts.indexOf(np)
      updateChannel(pts)
    }
    dragIndex.current = nearest
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent): void => {
    if (dragIndex.current < 0) return
    const { x, y } = svgPos(e)
    const np = fromSvg(x, y)
    const pts = [...points]
    const i = dragIndex.current
    // Endpoints stay pinned horizontally; interior points can't cross neighbors.
    if (i === 0) np.x = pts[0].x
    else if (i === pts.length - 1) np.x = pts[pts.length - 1].x
    else np.x = Math.min(pts[i + 1].x - 0.02, Math.max(pts[i - 1].x + 0.02, np.x))
    pts[i] = np
    updateChannel(pts)
  }

  const onPointerUp = (): void => {
    dragIndex.current = -1
  }

  const removePoint = (i: number): void => {
    if (i === 0 || i === points.length - 1 || points.length <= 2) return
    updateChannel(points.filter((_, idx) => idx !== i))
  }

  const resetChannel = (): void => {
    updateChannel(IDENTITY_CURVE[channel].map((p) => ({ ...p })))
  }

  // Sample the interpolated curve for the path.
  const fn = monotoneCubic(points)
  const path = Array.from({ length: 65 }, (_, i) => {
    const x = i / 64
    const s = toSvg({ x, y: Math.min(1, Math.max(0, fn(x))) })
    return `${i === 0 ? 'M' : 'L'}${s.x.toFixed(1)},${s.y.toFixed(1)}`
  }).join(' ')

  const activeColor = CHANNELS.find((c) => c.key === channel)!.color

  return (
    <div className="curve-editor">
      <div className="curve-channels">
        {CHANNELS.map((c) => (
          <button
            key={c.key}
            className={`curve-channel${channel === c.key ? ' active' : ''}`}
            style={channel === c.key ? { color: c.color, borderColor: c.color } : undefined}
            onClick={() => setChannel(c.key)}
          >
            {c.label}
          </button>
        ))}
        <button className="curve-channel reset" onClick={resetChannel} title="Reset this channel">
          ↺
        </button>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="curve-svg"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {/* grid */}
        {[0.25, 0.5, 0.75].map((f) => {
          const a = toSvg({ x: f, y: 0 })
          const bp = toSvg({ x: f, y: 1 })
          const c = toSvg({ x: 0, y: f })
          const d = toSvg({ x: 1, y: f })
          return (
            <g key={f} stroke="#333" strokeWidth={0.6}>
              <line x1={a.x} y1={a.y} x2={bp.x} y2={bp.y} />
              <line x1={c.x} y1={c.y} x2={d.x} y2={d.y} />
            </g>
          )
        })}
        {/* diagonal reference */}
        <line
          x1={toSvg({ x: 0, y: 0 }).x}
          y1={toSvg({ x: 0, y: 0 }).y}
          x2={toSvg({ x: 1, y: 1 }).x}
          y2={toSvg({ x: 1, y: 1 }).y}
          stroke="#3a3a3a"
          strokeWidth={0.8}
          strokeDasharray="3 3"
        />
        <path d={path} fill="none" stroke={activeColor} strokeWidth={1.6} />
        {points.map((p, i) => {
          const s = toSvg(p)
          return (
            <circle
              key={i}
              cx={s.x}
              cy={s.y}
              r={4}
              fill="#1f1f1f"
              stroke={activeColor}
              strokeWidth={1.5}
              onContextMenu={(e) => {
                e.preventDefault()
                removePoint(i)
              }}
            />
          )
        })}
      </svg>
      <div className="curve-hint">Click to add · drag to shape · right-click to remove</div>
    </div>
  )
}
