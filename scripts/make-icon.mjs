/**
 * Generates build/icon.ico (and build/icon.png) from an inline SVG.
 * ICO entries are PNG-compressed, which every supported Windows version reads.
 */
import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'

// Aperture mark: six rotated blades in a spectrum, on a dark rounded square.
const BLADE_COLORS = ['#e05a4e', '#e0964e', '#d9c44e', '#5cbf5c', '#4ec4c4', '#5a9ae0']
const blades = BLADE_COLORS.map((color, i) => {
  const angle = i * 60
  return `<path d="M 128 52 L 160 108 L 128 128 Z" fill="${color}" transform="rotate(${angle} 128 128)"/>`
}).join('\n  ')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="52" fill="#1c1c1e"/>
  <circle cx="128" cy="128" r="92" fill="#101012"/>
  ${blades}
  <circle cx="128" cy="128" r="34" fill="#101012"/>
  <circle cx="128" cy="128" r="92" fill="none" stroke="#3a3a3e" stroke-width="6"/>
</svg>`

await mkdir('build', { recursive: true })
const sizes = [16, 24, 32, 48, 64, 128, 256]
const pngs = await Promise.all(
  sizes.map((s) => sharp(Buffer.from(svg)).resize(s, s).png({ compressionLevel: 9 }).toBuffer())
)

// ICO container: header + 16-byte directory entries + PNG blobs.
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0) // reserved
header.writeUInt16LE(1, 2) // type: icon
header.writeUInt16LE(sizes.length, 4)

const entries = []
let offset = 6 + 16 * sizes.length
sizes.forEach((s, i) => {
  const e = Buffer.alloc(16)
  e.writeUInt8(s === 256 ? 0 : s, 0) // width (0 means 256)
  e.writeUInt8(s === 256 ? 0 : s, 1) // height
  e.writeUInt8(0, 2) // palette
  e.writeUInt8(0, 3) // reserved
  e.writeUInt16LE(1, 4) // planes
  e.writeUInt16LE(32, 6) // bpp
  e.writeUInt32LE(pngs[i].length, 8)
  e.writeUInt32LE(offset, 12)
  offset += pngs[i].length
  entries.push(e)
})

await writeFile('build/icon.ico', Buffer.concat([header, ...entries, ...pngs]))
await writeFile('build/icon.png', pngs[sizes.length - 1])
console.log('build/icon.ico written with sizes', sizes.join(', '))
