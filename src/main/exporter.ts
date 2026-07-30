import { BrowserWindow, dialog } from 'electron'
import { promises as fs } from 'node:fs'
import { basename, extname, join } from 'node:path'
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

export interface BatchExportRequest {
  items: { imagePath: string; params: unknown }[]
  options: ExportOptions
}

export interface BatchExportResult {
  ok: boolean
  outDir?: string
  done: number
  failed: string[]
  error?: string
}

/** Non-colliding output path: name-edited.ext, name-edited-2.ext, ... */
async function uniqueOutPath(dir: string, base: string, ext: string): Promise<string> {
  let candidate = join(dir, `${base}-edited.${ext}`)
  for (let n = 2; ; n++) {
    try {
      await fs.access(candidate)
      candidate = join(dir, `${base}-edited-${n}.${ext}`)
    } catch {
      return candidate
    }
  }
}

/** Export several photos into a chosen folder, reporting progress via IPC. */
export async function exportBatch(win: BrowserWindow | null, req: BatchExportRequest): Promise<BatchExportResult> {
  if (req.items.some((i) => !isPathAllowed(i.imagePath))) {
    return { ok: false, done: 0, failed: [], error: 'Path not in opened folder' }
  }

  const picked = await dialog.showOpenDialog(win!, {
    title: `Export ${req.items.length} photos to folder`,
    properties: ['openDirectory', 'createDirectory']
  })
  if (picked.canceled || picked.filePaths.length === 0) {
    return { ok: false, done: 0, failed: [], error: 'canceled' }
  }
  const outDir = picked.filePaths[0]
  const ext = req.options.format === 'jpeg' ? 'jpg' : req.options.format

  let done = 0
  const failed: string[] = []
  for (const item of req.items) {
    try {
      const buffer = await processImage(item.imagePath, normalizeParams(item.params), req.options)
      const base = basename(item.imagePath, extname(item.imagePath))
      await fs.writeFile(await uniqueOutPath(outDir, base, ext), buffer)
      done++
    } catch (err) {
      console.error('[QuickPix] Batch export failed for', item.imagePath, err)
      failed.push(basename(item.imagePath))
    }
    win?.webContents.send('export:progress', { done: done + failed.length, total: req.items.length })
  }
  return { ok: failed.length === 0, outDir, done, failed }
}
