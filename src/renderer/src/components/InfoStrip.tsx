import { useEffect, useState } from 'react'
import type { ImageInfo } from '@shared/types'
import { useSelectedImage } from '../state/libraryStore'

function formatShutter(seconds: number): string {
  if (seconds >= 1) return `${seconds.toFixed(1)}s`
  return `1/${Math.round(1 / seconds)}s`
}

/** Compact camera/EXIF summary under the histogram. */
export function InfoStrip(): React.JSX.Element | null {
  const image = useSelectedImage()
  const [info, setInfo] = useState<ImageInfo | null>(null)

  useEffect(() => {
    setInfo(null)
    if (!image) return
    let cancelled = false
    window.quickpix
      .getImageInfo(image.path)
      .then((i) => {
        if (!cancelled) setInfo(i)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [image?.path])

  if (!image || !info) return null

  const parts: string[] = []
  if (info.width && info.height) parts.push(`${info.width}×${info.height}`)
  if (info.focalLength) parts.push(`${Math.round(info.focalLength)}mm`)
  if (info.fNumber) parts.push(`ƒ/${info.fNumber}`)
  if (info.exposureTime) parts.push(formatShutter(info.exposureTime))
  if (info.iso) parts.push(`ISO ${info.iso}`)

  return (
    <div className="info-strip" title={info.lens ?? undefined}>
      {info.camera && <div className="info-camera">{info.camera}</div>}
      <div className="info-specs">{parts.join(' · ')}</div>
      {info.takenAt && <div className="info-date">{new Date(info.takenAt).toLocaleString()}</div>}
    </div>
  )
}
