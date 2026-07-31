import { isRawPath, type DecodedRgba } from '@shared/types'
import { getImageUrl } from './imageUrl'

/**
 * RAW decoding via LibRaw (WASM) — runs in the renderer because libraw-wasm
 * needs the DOM Worker API. Previews decode at half size; export decodes full.
 * The module is loaded lazily so non-RAW users never pay for the WASM.
 */

export { isRawPath }

type LibRawModule = typeof import('libraw-wasm').default

let libRawCtor: Promise<LibRawModule> | null = null

async function getLibRaw(): Promise<LibRawModule> {
  libRawCtor ??= import('libraw-wasm').then((m) => m.default)
  return libRawCtor
}

async function fetchBytes(path: string): Promise<Uint8Array<ArrayBuffer>> {
  const resp = await fetch(getImageUrl(path))
  if (!resp.ok) throw new Error(`Failed to read RAW file (${resp.status})`)
  return new Uint8Array(await resp.arrayBuffer())
}

function toRgba(data: Uint8Array | Uint16Array, colors: number, pixelCount: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(pixelCount * 4))
  const is16 = data instanceof Uint16Array
  const shift = is16 ? 8 : 0
  if (colors === 3) {
    for (let i = 0; i < pixelCount; i++) {
      out[i * 4] = data[i * 3] >> shift
      out[i * 4 + 1] = data[i * 3 + 1] >> shift
      out[i * 4 + 2] = data[i * 3 + 2] >> shift
      out[i * 4 + 3] = 255
    }
  } else if (colors === 4) {
    for (let i = 0; i < pixelCount; i++) {
      out[i * 4] = data[i * 4] >> shift
      out[i * 4 + 1] = data[i * 4 + 1] >> shift
      out[i * 4 + 2] = data[i * 4 + 2] >> shift
      out[i * 4 + 3] = 255
    }
  } else {
    for (let i = 0; i < pixelCount; i++) {
      const v = data[i] >> shift
      out[i * 4] = v
      out[i * 4 + 1] = v
      out[i * 4 + 2] = v
      out[i * 4 + 3] = 255
    }
  }
  return out
}

/** Decode a RAW file to RGBA. halfSize=true is plenty for on-screen preview. */
export async function decodeRaw(path: string, opts: { halfSize: boolean }): Promise<DecodedRgba> {
  const LibRaw = await getLibRaw()
  const raw = new LibRaw()
  try {
    await raw.open(await fetchBytes(path), {
      useCameraWb: true,
      halfSize: opts.halfSize,
      outputBps: 8
    })
    const img = await raw.imageData()
    if (!img) throw new Error('LibRaw returned no image data')
    return {
      data: toRgba(img.data, img.colors, img.width * img.height),
      width: img.width,
      height: img.height
    }
  } finally {
    raw.dispose()
  }
}

/** ImageBitmap for the viewer. */
export async function decodeRawToBitmap(path: string): Promise<ImageBitmap> {
  const { data, width, height } = await decodeRaw(path, { halfSize: true })
  return createImageBitmap(new ImageData(new Uint8ClampedArray(data.buffer as ArrayBuffer), width, height))
}

const thumbCache = new Map<string, string>()

/**
 * Fast filmstrip thumbnail from the RAW's embedded JPEG preview (no demosaic).
 * Falls back to a half-size decode when no usable preview is embedded.
 */
export async function getRawThumbUrl(path: string): Promise<string> {
  const cached = thumbCache.get(path)
  if (cached) return cached

  const LibRaw = await getLibRaw()
  const raw = new LibRaw()
  let url: string
  try {
    await raw.open(await fetchBytes(path), { useCameraWb: true })
    const thumb = await raw.thumbnailData().catch(() => undefined)
    if (thumb && thumb.format === 'jpeg') {
      url = URL.createObjectURL(new Blob([thumb.data as BlobPart], { type: 'image/jpeg' }))
    } else {
      const img = await raw.imageData()
      if (!img) throw new Error('no image data')
      const rgba = toRgba(img.data, img.colors, img.width * img.height)
      const bitmap = await createImageBitmap(new ImageData(new Uint8ClampedArray(rgba.buffer), img.width, img.height))
      const canvas = new OffscreenCanvas(320, Math.round((320 * img.height) / img.width))
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      bitmap.close()
      url = URL.createObjectURL(await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 }))
    }
  } finally {
    raw.dispose()
  }
  thumbCache.set(path, url)
  return url
}
