import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'

const dir = 'D:/QuickPix-SamplePhotos'
await mkdir(dir, { recursive: true })

const W = 1800
const H = 1200

function gradient(r1, g1, b1, r2, g2, b2) {
  const buf = Buffer.alloc(W * H * 3)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = (x / W + y / H) / 2
      const i = (y * W + x) * 3
      buf[i] = Math.round(r1 + (r2 - r1) * t + (Math.random() - 0.5) * 8)
      buf[i + 1] = Math.round(g1 + (g2 - g1) * t + (Math.random() - 0.5) * 8)
      buf[i + 2] = Math.round(b1 + (b2 - b1) * t + (Math.random() - 0.5) * 8)
    }
  }
  return sharp(buf, { raw: { width: W, height: H, channels: 3 } })
}

await gradient(40, 60, 120, 240, 180, 90).jpeg({ quality: 92 }).toFile(`${dir}/beach-dusk.jpg`)
await gradient(20, 80, 40, 200, 230, 160).jpeg({ quality: 92 }).toFile(`${dir}/spring-field.jpg`)
await gradient(120, 40, 60, 250, 210, 200).png().toFile(`${dir}/rose-wall.png`)
await gradient(60, 60, 70, 220, 220, 230).tiff().toFile(`${dir}/storm-sky.tif`)
console.log('samples written to', dir)
