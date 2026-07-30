import sharp from 'sharp'
import { applyEdits, type RawImage } from '@shared/editMath'
import type { EditParams } from '@shared/editParams'

export interface ExportOptions {
  format: 'jpeg' | 'png' | 'webp'
  /** 1..100, used by jpeg/webp. */
  quality: number
  /** Resize so the long edge equals this; 0/undefined = original size. */
  resizeLongEdge?: number
}

/**
 * Decode -> apply edits at full resolution (CPU mirror of the GPU pipeline)
 * -> optional resize -> encode. Pure function of its inputs; no Electron
 * dependency so it is unit-testable in plain Node.
 */
export async function processImage(
  inputPath: string,
  params: EditParams,
  options: ExportOptions
): Promise<Buffer> {
  // .rotate() with no args applies the EXIF orientation, matching what
  // Chromium does when decoding for the preview.
  const { data, info } = await sharp(inputPath)
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const src: RawImage = {
    data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
    width: info.width,
    height: info.height
  }

  const result = applyEdits(src, params)

  let pipeline = sharp(Buffer.from(result.data.buffer, result.data.byteOffset, result.data.byteLength), {
    raw: { width: result.width, height: result.height, channels: 4 }
  })

  const longEdge = options.resizeLongEdge ?? 0
  if (longEdge > 0 && Math.max(result.width, result.height) > longEdge) {
    pipeline = pipeline.resize({ width: longEdge, height: longEdge, fit: 'inside' })
  }

  switch (options.format) {
    case 'png':
      pipeline = pipeline.png()
      break
    case 'webp':
      pipeline = pipeline.webp({ quality: options.quality })
      break
    default:
      pipeline = pipeline.flatten({ background: '#ffffff' }).jpeg({ quality: options.quality, mozjpeg: true })
  }

  return pipeline.toBuffer()
}
