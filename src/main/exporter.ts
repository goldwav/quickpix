import { BrowserWindow, dialog } from 'electron'
import { promises as fs } from 'node:fs'
import { basename, extname } from 'node:path'
import { normalizeParams } from '@shared/editParams'
import { isPathAllowed } from './library'
import { processImage, type ExportOptions } from './processImage'

export interface ExportRequest {
  imagePath: string
  params: unknown
  options: ExportOptions
}

export interface ExportResult {
  ok: boolean
  outPath?: string
  error?: string
}

/** Show a save dialog and export the photo with its edits baked in. */
export async function exportImage(win: BrowserWindow | null, req: ExportRequest): Promise<ExportResult> {
  if (!isPathAllowed(req.imagePath)) return { ok: false, error: 'Path not in opened folder' }

  const ext = req.options.format === 'jpeg' ? 'jpg' : req.options.format
  const base = basename(req.imagePath, extname(req.imagePath))
  const result = await dialog.showSaveDialog(win!, {
    title: 'Export photo',
    defaultPath: `${base}-edited.${ext}`,
    filters: [{ name: req.options.format.toUpperCase(), extensions: [ext] }]
  })
  if (result.canceled || !result.filePath) return { ok: false, error: 'canceled' }

  try {
    const buffer = await processImage(req.imagePath, normalizeParams(req.params), req.options)
    await fs.writeFile(result.filePath, buffer)
    return { ok: true, outPath: result.filePath }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
