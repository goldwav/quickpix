import { useState } from 'react'
import type { ExportImageOptions } from '@shared/types'
import { useEditStore } from '../state/editStore'
import { useSelectedImage } from '../state/libraryStore'

interface ExportDialogProps {
  onClose: () => void
}

export function ExportDialog({ onClose }: ExportDialogProps): React.JSX.Element | null {
  const image = useSelectedImage()
  const [format, setFormat] = useState<ExportImageOptions['format']>('jpeg')
  const [quality, setQuality] = useState(90)
  const [resize, setResize] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  if (!image) return null

  const doExport = (): void => {
    setBusy(true)
    setMessage(null)
    const params = useEditStore.getState().params
    void window.quickpix
      .exportImage(image.path, params, { format, quality, resizeLongEdge: resize || undefined })
      .then((res) => {
        setBusy(false)
        if (res.ok) {
          setMessage(`Saved to ${res.outPath}`)
        } else if (res.error !== 'canceled') {
          setMessage(`Export failed: ${res.error}`)
        }
      })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Export “{image.name}”</h3>

        <label className="field">
          <span>Format</span>
          <select value={format} onChange={(e) => setFormat(e.target.value as ExportImageOptions['format'])}>
            <option value="jpeg">JPEG</option>
            <option value="png">PNG</option>
            <option value="webp">WebP</option>
          </select>
        </label>

        {format !== 'png' && (
          <label className="field">
            <span>Quality — {quality}</span>
            <input type="range" min={40} max={100} value={quality} onChange={(e) => setQuality(Number(e.target.value))} />
          </label>
        )}

        <label className="field">
          <span>Resize long edge (px, 0 = original)</span>
          <input
            type="number"
            min={0}
            max={20000}
            step={100}
            value={resize}
            onChange={(e) => setResize(Math.max(0, Number(e.target.value) || 0))}
          />
        </label>

        {message && <div className="export-message">{message}</div>}

        <div className="modal-actions">
          <button className="btn" onClick={onClose} disabled={busy}>
            Close
          </button>
          <button className="btn primary" onClick={doExport} disabled={busy}>
            {busy ? 'Exporting…' : 'Export…'}
          </button>
        </div>
      </div>
    </div>
  )
}
