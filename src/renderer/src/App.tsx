import { useEffect, useState } from 'react'
import { useLibraryStore } from './state/libraryStore'
import { useEditStore } from './state/editStore'
import { Filmstrip } from './components/Filmstrip'
import { Viewer } from './components/Viewer'
import { AdjustPanel } from './components/AdjustPanel'
import { PresetsPanel } from './components/PresetsPanel'
import { ExportDialog } from './components/ExportDialog'

export default function App(): React.JSX.Element {
  const folder = useLibraryStore((s) => s.folder)
  const openFolder = useLibraryStore((s) => s.openFolder)
  const selectNext = useLibraryStore((s) => s.selectNext)
  const selectPrev = useLibraryStore((s) => s.selectPrev)
  const hasImage = useLibraryStore((s) => s.selectedIndex >= 0)
  const canUndo = useEditStore((s) => s.historyIndex > 0)
  const canRedo = useEditStore((s) => s.historyIndex < s.history.length - 1)
  const [exportOpen, setExportOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement && e.target.type === 'text') return
      const edit = useEditStore.getState()
      const mod = e.ctrlKey || e.metaKey

      if (mod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        edit.undo()
      } else if ((mod && e.key === 'y') || (mod && e.shiftKey && (e.key === 'z' || e.key === 'Z'))) {
        e.preventDefault()
        edit.redo()
      } else if (mod && e.shiftKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault()
        edit.copySettings()
      } else if (mod && e.shiftKey && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault()
        edit.pasteSettings()
      } else if (mod && e.key === 'o') {
        e.preventDefault()
        void openFolder()
      } else if (mod && e.key === 'e') {
        e.preventDefault()
        if (useLibraryStore.getState().selectedIndex >= 0) setExportOpen(true)
      } else if (e.key === 'ArrowRight' && !(e.target instanceof HTMLInputElement)) {
        selectNext()
      } else if (e.key === 'ArrowLeft' && !(e.target instanceof HTMLInputElement)) {
        selectPrev()
      } else if (e.key === '\\') {
        edit.setShowOriginal(true)
      }
    }
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.key === '\\') useEditStore.getState().setShowOriginal(false)
    }
    // Drag & drop a folder or image anywhere onto the window.
    const onDragOver = (e: DragEvent): void => e.preventDefault()
    const onDrop = (e: DragEvent): void => {
      e.preventDefault()
      const file = e.dataTransfer?.files?.[0]
      if (!file) return
      const path = window.quickpix.getPathForFile(file)
      if (path) void useLibraryStore.getState().openPath(path)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [openFolder, selectNext, selectPrev])

  const edit = useEditStore.getState()

  return (
    <div className="app">
      <header className="topbar">
        <div className="logo">
          Quick<span>Pix</span>
        </div>
        <div className="folder-path">{folder ?? 'No folder open'}</div>
        <button className="btn icon" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={() => edit.undo()}>
          ↶
        </button>
        <button className="btn icon" title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={() => edit.redo()}>
          ↷
        </button>
        <button className="btn" disabled={!hasImage} title="Export (Ctrl+E)" onClick={() => setExportOpen(true)}>
          Export…
        </button>
        <button className="btn" onClick={() => void openFolder()}>
          Open Folder…
        </button>
      </header>
      <PresetsPanel />
      <Viewer />
      <AdjustPanel />
      <Filmstrip />
      {exportOpen && <ExportDialog onClose={() => setExportOpen(false)} />}
    </div>
  )
}
