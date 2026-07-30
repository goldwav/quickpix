import { useEffect, useState } from 'react'
import type { ExportBatchItem, ExportImageOptions } from '@shared/types'
import { cloneParams, DEFAULT_EDIT_PARAMS, normalizeParams } from '@shared/editParams'
import { useEditStore } from '../state/editStore'
import { getExportTargets, useLibraryStore } from '../state/libraryStore'
import { toast } from '../state/uiStore'

interface ExportDialogProps {
  onClose: () => void
}

export function ExportDialog({ onClose }: ExportDialogProps): React.JSX.Element | null {
  const targets = getExportTargets()
  const images = useLibraryStore((s) => s.images)
  const [format, setFormat] = useState<ExportImageOptions['format']>('jpeg')
  const [quality, setQuality] = useState(90)
  const [resize, setResize] = useState(0)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => window.quickpix.onExportProgress(setProgress), [])

  if (targets.length === 0) return null
  const single = targets.length === 1
  const title = single
    ? `Export “${images.find((i) => i.path === targets[0])?.name ?? ''}”`
    : `Export ${targets.length} photos`

  /** Edit params for a photo: in-memory first, then sidecar, then neutral. */
  const paramsFor = async (path: string): Promise<unknown> => {
    const cached = useEditStore.getState().byPath[path]
    if (cached) return cached
    try {
      const sidecar = (await window.quickpix.readSidecar(path)) as { params?: unknown } | null
      if (sidecar?.params) return normalizeParams(sidecar.params)
    } catch {
      // fall through to neutral
    }
    return cloneParams(DEFAULT_EDIT_PARAMS)
  }

  const doExport = (): void => {
    setBusy(true)
    setMessage(null)
    setProgress(null)
    const options = { format, quality, resizeLongEdge: resize || undefined }

    void (async () => {
      try {
        if (single) {
          const res = await window.quickpix.exportImage(targets[0], await paramsFor(targets[0]), options)
          if (res.ok) {
            toast('success', `Exported to ${res.outPath}`)
            onClose()
          } else if (res.error !== 'canceled') {
            setMessage(`Export failed: ${res.error}`)
          }
        } else {
          const items: ExportBatchItem[] = []
          for (const path of targets) items.push({ imagePath: path, params: await paramsFor(path) })
          const res = await window.quickpix.exportBatch(items, options)
          if (res.error === 'canceled') {
            // user closed the folder picker — stay in the dialog
          } else if (res.ok) {
            toast('success', `Exported ${res.done} photos to ${res.outDir}`)
            onClose()
          } else {
            setMessage(
              res.done > 0
                ? `Exported ${res.done}, failed: ${res.failed.join(', ')}`
                : `Export failed: ${res.error ?? res.failed.join(', ')}`
            )
          }
        }
      } finally {
        setBusy(false)
        setProgress(null)
      }
    })()
  }

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>

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

        {progress && (
          <div className="export-message">
            Exporting {progress.done} / {progress.total}…
          </div>
        )}
        {message && <div className="export-message">{message}</div>}

        <div className="modal-actions">
          <button className="btn" onClick={onClose} disabled={busy}>
            Close
          </button>
          <button className="btn primary" onClick={doExport} disabled={busy}>
            {busy ? 'Exporting…' : single ? 'Export…' : `Export ${targets.length}…`}
          </button>
        </div>
      </div>
    </div>
  )
}
