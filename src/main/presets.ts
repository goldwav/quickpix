import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { Preset } from '@shared/types'

const presetsFile = (): string => join(app.getPath('userData'), 'presets.json')

export async function listPresets(): Promise<Preset[]> {
  try {
    const raw = await fs.readFile(presetsFile(), 'utf-8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function savePreset(preset: Preset): Promise<Preset[]> {
  const presets = await listPresets()
  const idx = presets.findIndex((p) => p.name === preset.name)
  if (idx >= 0) presets[idx] = preset
  else presets.push(preset)
  await fs.writeFile(presetsFile(), JSON.stringify(presets, null, 2), 'utf-8')
  return presets
}

export async function deletePreset(name: string): Promise<Preset[]> {
  const presets = (await listPresets()).filter((p) => p.name !== name)
  await fs.writeFile(presetsFile(), JSON.stringify(presets, null, 2), 'utf-8')
  return presets
}
