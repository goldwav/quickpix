import exifReader from 'exif-reader'
import sharp from 'sharp'
import type { ImageInfo } from '@shared/types'
import { isPathAllowed } from './library'

/** Dimensions + a curated EXIF subset for the info strip. */
export async function getImageInfo(imagePath: string): Promise<ImageInfo> {
  if (!isPathAllowed(imagePath)) throw new Error('Path not in opened folder')
  const meta = await sharp(imagePath).metadata()
  const info: ImageInfo = { width: meta.width, height: meta.height, format: meta.format }

  // EXIF orientation can swap displayed dimensions.
  if (meta.orientation && meta.orientation >= 5 && info.width && info.height) {
    ;[info.width, info.height] = [info.height, info.width]
  }

  if (meta.exif) {
    try {
      const exif = exifReader(meta.exif)
      const image = exif.Image ?? {}
      const photo = exif.Photo ?? {}
      const make = typeof image.Make === 'string' ? image.Make.trim() : ''
      const model = typeof image.Model === 'string' ? image.Model.trim() : ''
      // Many vendors repeat the make inside the model string.
      info.camera = model.toLowerCase().startsWith(make.toLowerCase()) ? model : [make, model].filter(Boolean).join(' ')
      if (typeof photo.LensModel === 'string') info.lens = photo.LensModel.trim()
      if (typeof photo.ExposureTime === 'number') info.exposureTime = photo.ExposureTime
      if (typeof photo.FNumber === 'number') info.fNumber = photo.FNumber
      const iso = photo.ISOSpeedRatings ?? photo.PhotographicSensitivity
      if (typeof iso === 'number') info.iso = iso
      else if (Array.isArray(iso) && typeof iso[0] === 'number') info.iso = iso[0]
      if (typeof photo.FocalLength === 'number') info.focalLength = photo.FocalLength
      if (photo.DateTimeOriginal instanceof Date) info.takenAt = photo.DateTimeOriginal.toISOString()
    } catch {
      // EXIF parse failures are non-fatal — show dimensions only.
    }
  }
  return info
}
