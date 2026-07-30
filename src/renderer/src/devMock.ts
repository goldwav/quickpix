/**
 * Browser-only dev mock. When the app is opened in a plain browser (no
 * Electron preload bridge), this installs a fake window.quickpix backed by
 * generated sample images so the full UI + GL pipeline can be developed and
 * tested with `vite` alone.
 */
import type { ImageFileInfo, OpenFolderResult, Preset } from '@shared/types'
import { registerImageUrlOverride } from './lib/imageUrl'

interface Sample {
  name: string
  draw: (ctx: OffscreenCanvasRenderingContext2D, w: number, h: number) => void
}

const SAMPLES: Sample[] = [
  {
    name: 'sunset.png',
    draw: (ctx, w, h) => {
      const sky = ctx.createLinearGradient(0, 0, 0, h)
      sky.addColorStop(0, '#2c3e70')
      sky.addColorStop(0.55, '#e2703a')
      sky.addColorStop(0.72, '#f5c469')
      sky.addColorStop(1, '#1a1a2e')
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#fff3d6'
      ctx.beginPath()
      ctx.arc(w * 0.62, h * 0.58, h * 0.09, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#12121f'
      for (let i = 0; i < 5; i++) {
        const x = (i / 5) * w
        ctx.fillRect(x, h * (0.78 + 0.03 * Math.sin(i * 3)), w / 5 + 2, h)
      }
    }
  },
  {
    name: 'forest.png',
    draw: (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h)
      g.addColorStop(0, '#a8c6a0')
      g.addColorStop(0.5, '#3f6b3a')
      g.addColorStop(1, '#1c2e1a')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
      for (let i = 0; i < 24; i++) {
        const x = ((i * 97) % w) + 10
        const th = h * (0.35 + ((i * 37) % 30) / 100)
        ctx.fillStyle = `rgba(${20 + ((i * 13) % 30)}, ${50 + ((i * 29) % 40)}, ${25}, 0.85)`
        ctx.fillRect(x, h - th, 14, th)
        ctx.beginPath()
        ctx.arc(x + 7, h - th, 34, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  },
  {
    name: 'portrait.png',
    draw: (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 60, w / 2, h / 2, h * 0.8)
      g.addColorStop(0, '#8d7263')
      g.addColorStop(1, '#2b2320')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#c9a188'
      ctx.beginPath()
      ctx.ellipse(w / 2, h * 0.42, w * 0.13, h * 0.19, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#514038'
      ctx.beginPath()
      ctx.ellipse(w / 2, h * 0.3, w * 0.15, h * 0.1, 0, Math.PI, 0)
      ctx.fill()
      ctx.fillStyle = '#3d4f63'
      ctx.beginPath()
      ctx.ellipse(w / 2, h * 0.85, w * 0.24, h * 0.28, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  },
  {
    name: 'gray-ramp.png',
    draw: (ctx, w, h) => {
      // Neutral test chart: horizontal luminance ramp + color patches.
      const g = ctx.createLinearGradient(0, 0, w, 0)
      g.addColorStop(0, '#000')
      g.addColorStop(1, '#fff')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h * 0.6)
      const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff', '#808080', '#ffffff']
      colors.forEach((c, i) => {
        ctx.fillStyle = c
        ctx.fillRect((i / colors.length) * w, h * 0.6, w / colors.length, h * 0.4)
      })
    }
  }
]

async function makeImage(sample: Sample): Promise<{ info: ImageFileInfo; url: string }> {
  const w = 1600
  const h = 1067
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')!
  sample.draw(ctx, w, h)
  // Subtle noise so the histogram looks organic.
  const noise = ctx.getImageData(0, 0, w, h)
  const d = noise.data
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 10
    d[i] += n
    d[i + 1] += n
    d[i + 2] += n
  }
  ctx.putImageData(noise, 0, 0)

  const blob = await canvas.convertToBlob({ type: 'image/png' })
  const url = URL.createObjectURL(blob)
  const path = `mock://samples/${sample.name}`
  registerImageUrlOverride(path, url)
  return {
    info: { path, name: sample.name, size: blob.size, mtimeMs: Date.now() },
    url
  }
}

export async function installDevMock(): Promise<void> {
  const images = await Promise.all(SAMPLES.map(makeImage))
  const infos = images.map((i) => i.info)
  const result: OpenFolderResult = { folder: '(browser dev) Sample Photos', images: infos }

  const sidecars = new Map<string, unknown>()
  const PRESETS_KEY = 'quickpix.dev.presets'
  const loadPresets = (): Preset[] => {
    try {
      return JSON.parse(localStorage.getItem(PRESETS_KEY) ?? '[]')
    } catch {
      return []
    }
  }
  const storePresets = (list: Preset[]): Preset[] => {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(list))
    return list
  }

  window.quickpix = {
    openFolder: async () => result,
    listImages: async () => infos,
    readSidecar: async (p) => sidecars.get(p) ?? null,
    writeSidecar: async (p, data) => {
      if (data === null) sidecars.delete(p)
      else sidecars.set(p, data)
    },
    listPresets: async () => loadPresets(),
    savePreset: async (preset) => {
      const list = loadPresets().filter((x) => x.name !== preset.name)
      list.push(preset)
      return storePresets(list)
    },
    deletePreset: async (name) => storePresets(loadPresets().filter((x) => x.name !== name))
  }
  console.info('[QuickPix] Browser dev mock installed — sample photos available via Open Folder.')
}
