/**
 * Generates a folder of scenic sample photos (SVG scenes rendered via sharp)
 * for demos, screenshots, and manual testing: D:/QuickPix-SamplePhotos
 * (or the folder passed as the first argument). Includes one TIFF.
 */
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'

const dir = process.argv[2] ?? 'D:/QuickPix-SamplePhotos'
await mkdir(dir, { recursive: true })

const W = 1800
const H = 1200

const scenes = {
  'alpine-sunset.jpg': `
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2b3a67"/><stop offset="0.45" stop-color="#b25d4e"/>
        <stop offset="0.62" stop-color="#e8a04a"/><stop offset="0.75" stop-color="#f2c96b"/>
      </linearGradient>
      <radialGradient id="sun" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#fff4d6"/><stop offset="0.35" stop-color="#f7d789"/>
        <stop offset="1" stop-color="#f7d789" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#sky)"/>
    <circle cx="1150" cy="690" r="260" fill="url(#sun)"/>
    <circle cx="1150" cy="690" r="86" fill="#fff1c9"/>
    <polygon points="0,760 320,470 560,700 780,520 1020,780 0,780" fill="#3a2d45" opacity="0.9"/>
    <polygon points="600,800 950,540 1250,760 1520,580 1800,790 1800,820 600,820" fill="#2c2338" opacity="0.95"/>
    <polygon points="0,880 400,660 760,880 1150,700 1500,900 1800,760 1800,1200 0,1200" fill="#1c1728"/>
    <rect y="960" width="${W}" height="240" fill="#141020"/>
  `,
  'north-shore.jpg': `
    <defs>
      <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#9db8c9"/><stop offset="0.5" stop-color="#5d86a0"/>
        <stop offset="1" stop-color="#2e4d63"/>
      </linearGradient>
      <linearGradient id="skyc" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#c9d6dd"/><stop offset="1" stop-color="#8fadbe"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="620" fill="url(#skyc)"/>
    <ellipse cx="420" cy="180" rx="260" ry="60" fill="#e8eef1" opacity="0.8"/>
    <ellipse cx="1300" cy="120" rx="340" ry="50" fill="#dfe8ec" opacity="0.7"/>
    <rect y="620" width="${W}" height="580" fill="url(#sea)"/>
    <rect y="620" width="${W}" height="14" fill="#d7e2e8" opacity="0.7"/>
    <path d="M0,900 Q450,860 900,905 T1800,895 L1800,1200 L0,1200 Z" fill="#24404f"/>
    <path d="M0,1050 Q500,1010 1000,1055 T1800,1040 L1800,1200 L0,1200 Z" fill="#758c85"/>
    <path d="M0,1130 Q600,1100 1200,1135 T1800,1125 L1800,1200 L0,1200 Z" fill="#c9b99a"/>
  `,
  'fog-forest.png': `
    <defs>
      <linearGradient id="fog" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#c9cdc4"/><stop offset="1" stop-color="#7d8577"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#fog)"/>
    ${Array.from({ length: 26 }, (_, i) => {
      const x = (i * 173) % W
      const h2 = 380 + ((i * 97) % 320)
      const shade = 30 + ((i * 13) % 34)
      const op = 0.35 + ((i * 7) % 50) / 100
      return `<polygon points="${x},${1200 - h2} ${x - 90},1200 ${x + 90},1200" fill="rgb(${shade},${shade + 12},${shade})" opacity="${op}"/>`
    }).join('')}
    <rect y="980" width="${W}" height="220" fill="#4a4f44" opacity="0.55"/>
  `,
  'city-dusk.tif': `
    <defs>
      <linearGradient id="dusk" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#1d2440"/><stop offset="0.6" stop-color="#5d4a6e"/>
        <stop offset="0.8" stop-color="#c77b52"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#dusk)"/>
    ${Array.from({ length: 22 }, (_, i) => {
      const x = i * 84
      const bh = 260 + ((i * 137) % 420)
      const windows = Array.from({ length: 12 }, (_, w) => {
        const wx = x + 8 + (w % 3) * 24
        const wy = 1200 - bh + 22 + Math.floor(w / 3) * 46
        const lit = (i * 7 + w * 13) % 5 < 2
        return lit ? `<rect x="${wx}" y="${wy}" width="12" height="18" fill="#f5cf7d" opacity="0.9"/>` : ''
      }).join('')
      return `<rect x="${x}" y="${1200 - bh}" width="76" height="${bh}" fill="#12101e"/>${windows}`
    }).join('')}
  `
}

for (const [name, body] of Object.entries(scenes)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${body}</svg>`
  let img = sharp(Buffer.from(svg))
  if (name.endsWith('.jpg')) img = img.jpeg({ quality: 92 })
  else if (name.endsWith('.png')) img = img.png()
  else img = img.tiff()
  await img.toFile(`${dir}/${name}`)
  console.log('wrote', name)
}
console.log('samples in', dir)
