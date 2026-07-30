import { useCallback, useEffect, useRef, useState } from 'react'
import { useLibraryStore, useSelectedImage } from '../state/libraryStore'
import { useEditStore } from '../state/editStore'
import { DEFAULT_EDIT_PARAMS } from '@shared/editParams'
import { getImageUrl } from '../lib/imageUrl'
import { toast } from '../state/uiStore'
import { GLPipeline, type FitRect } from '../gl/pipeline'
import { CropOverlay } from './CropOverlay'

/** Cap preview textures; full resolution is only needed at export time. */
const MAX_PREVIEW_DIM = 6144

export function Viewer(): React.JSX.Element {
  const image = useSelectedImage()
  const openFolder = useLibraryStore((s) => s.openFolder)
  const params = useEditStore((s) => s.params)
  const previewParams = useEditStore((s) => s.previewParams)
  const showOriginal = useEditStore((s) => s.showOriginal)
  const cropMode = useEditStore((s) => s.cropMode)
  const activate = useEditStore((s) => s.activate)

  // The canvas element lives in state (set via callback ref) so effects
  // reliably re-run when it mounts/unmounts — refs alone don't trigger that.
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null)
  const [pipeline, setPipeline] = useState<GLPipeline | null>(null)
  const [imageReady, setImageReady] = useState(false)
  const [glError, setGlError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [fitRect, setFitRect] = useState<FitRect | null>(null)
  const [view, setView] = useState({ zoom: 1, panX: 0, panY: 0 })
  const histTimer = useRef<number | null>(null)
  const panDrag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)

  const canvasRef = useCallback((el: HTMLCanvasElement | null) => setCanvasEl(el), [])

  // Keep the edit store pointed at the selected photo.
  useEffect(() => {
    activate(image?.path ?? null)
    setView({ zoom: 1, panX: 0, panY: 0 })
  }, [image?.path, activate])

  // The crop tool needs the plain fitted view.
  useEffect(() => {
    if (cropMode) setView({ zoom: 1, panX: 0, panY: 0 })
  }, [cropMode])

  // Pipeline + resize observer lifecycle, tied to the canvas element.
  useEffect(() => {
    if (!canvasEl) return
    let p: GLPipeline
    try {
      p = new GLPipeline(canvasEl)
    } catch (err) {
      setGlError(err instanceof Error ? err.message : String(err))
      return
    }
    setGlError(null)
    setPipeline(p)

    const container = canvasEl.parentElement as HTMLElement
    const sizeToContainer = (): void => {
      const dpr = window.devicePixelRatio || 1
      canvasEl.width = Math.max(1, Math.round(container.clientWidth * dpr))
      canvasEl.height = Math.max(1, Math.round(container.clientHeight * dpr))
      if (p.hasImage) {
        const s = useEditStore.getState()
        p.render(s.showOriginal ? DEFAULT_EDIT_PARAMS : s.params)
      }
    }
    // Size immediately (observer callbacks only fire on composited frames).
    sizeToContainer()
    const observer = new ResizeObserver(sizeToContainer)
    observer.observe(container)

    // Wheel zoom needs a non-passive listener to preventDefault.
    const onWheel = (e: WheelEvent): void => {
      if (useEditStore.getState().cropMode) return
      e.preventDefault()
      setView((v) => {
        const zoom = Math.min(8, Math.max(1, v.zoom * Math.pow(1.0015, -e.deltaY)))
        return zoom === 1 ? { zoom: 1, panX: 0, panY: 0 } : { ...v, zoom }
      })
    }
    container.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      container.removeEventListener('wheel', onWheel)
      observer.disconnect()
      p.dispose()
      setPipeline(null)
      setImageReady(false)
    }
  }, [canvasEl])

  // Load the selected image into the GPU whenever photo or pipeline changes.
  useEffect(() => {
    if (!pipeline || !image) return
    let cancelled = false
    setLoading(true)
    setImageReady(false)

    void (async () => {
      try {
        const resp = await fetch(getImageUrl(image.path))
        const blob = await resp.blob()
        let bitmap = await createImageBitmap(blob)
        if (Math.max(bitmap.width, bitmap.height) > MAX_PREVIEW_DIM) {
          const scale = MAX_PREVIEW_DIM / Math.max(bitmap.width, bitmap.height)
          const scaled = await createImageBitmap(bitmap, {
            resizeWidth: Math.round(bitmap.width * scale),
            resizeHeight: Math.round(bitmap.height * scale),
            resizeQuality: 'high'
          })
          bitmap.close()
          bitmap = scaled
        }
        if (cancelled) {
          bitmap.close()
          return
        }
        pipeline.setImage(bitmap)
        bitmap.close()
        setImageReady(true)
      } catch (err) {
        console.error('[QuickPix] Failed to load image:', err)
        toast('error', `Couldn't load ${image.name}`)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [pipeline, image])

  // Render whenever anything visual changes. Synchronous — the GPU pass is a
  // single cheap draw, and React already batches slider updates per event.
  useEffect(() => {
    if (!pipeline || !imageReady) return
    let effective = showOriginal ? DEFAULT_EDIT_PARAMS : (previewParams ?? params)
    if (cropMode) {
      // Crop tool: show the full frame with only the straighten angle applied,
      // so the crop rect selects within the live-rotated image.
      effective = {
        ...effective,
        crop: { left: 0, top: 0, width: 1, height: 1, angle: effective.crop?.angle ?? 0 }
      }
    }
    const dpr = window.devicePixelRatio || 1
    pipeline.render(effective, {
      view: cropMode ? undefined : { zoom: view.zoom, panX: view.panX * dpr, panY: view.panY * dpr }
    })
    const f = pipeline.lastFitRect
    setFitRect({ x: f.x / dpr, y: f.y / dpr, w: f.w / dpr, h: f.h / dpr })

    // Histogram readback stalls the GPU slightly — throttle it.
    if (histTimer.current === null) {
      histTimer.current = window.setTimeout(() => {
        histTimer.current = null
        if (!pipeline.hasImage) return
        const s = useEditStore.getState()
        s.setHistogram(pipeline.computeHistogram(s.showOriginal ? DEFAULT_EDIT_PARAMS : s.params))
      }, 120)
    }
  }, [pipeline, imageReady, params, previewParams, showOriginal, cropMode, view])

  if (!image) {
    return (
      <div className="viewer">
        <div className="empty-state">
          <h2>Welcome to QuickPix</h2>
          <p>Open a folder of photos to start editing — quick, subtle, non-destructive.</p>
          <button className="btn primary" onClick={() => void openFolder()}>
            Open Folder…
          </button>
        </div>
      </div>
    )
  }

  const onPointerDown = (e: React.PointerEvent): void => {
    if (cropMode || view.zoom === 1) return
    panDrag.current = { x: e.clientX, y: e.clientY, panX: view.panX, panY: view.panY }
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent): void => {
    const d = panDrag.current
    if (!d) return
    setView((v) => ({ ...v, panX: d.panX + (e.clientX - d.x), panY: d.panY + (e.clientY - d.y) }))
  }
  const onPointerUp = (): void => {
    panDrag.current = null
  }
  const onDoubleClick = (): void => {
    if (cropMode || !pipeline) return
    setView((v) => {
      if (v.zoom !== 1) return { zoom: 1, panX: 0, panY: 0 }
      const dpr = window.devicePixelRatio || 1
      const oneToOne = Math.min(8, Math.max(1.5, (pipeline.imageWidth / pipeline.lastFitRect.w) * dpr))
      return { zoom: oneToOne, panX: 0, panY: 0 }
    })
  }

  return (
    <div className="viewer">
      {glError ? (
        <div className="empty-state">
          <h2>Graphics error</h2>
          <p>{glError}</p>
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          className={`gl-canvas${view.zoom > 1 ? ' pannable' : ''}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDoubleClick={onDoubleClick}
        />
      )}
      {loading && <div className="loading-badge">Loading…</div>}
      {showOriginal && <div className="compare-badge">Original</div>}
      {cropMode && fitRect && pipeline && (
        <CropOverlay fit={fitRect} imageWidth={pipeline.imageWidth} imageHeight={pipeline.imageHeight} />
      )}
    </div>
  )
}
