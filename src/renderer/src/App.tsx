import { useEffect } from 'react'
import { useLibraryStore } from './state/libraryStore'
import { Filmstrip } from './components/Filmstrip'
import { Viewer } from './components/Viewer'
import { AdjustPanel } from './components/AdjustPanel'

export default function App(): React.JSX.Element {
  const folder = useLibraryStore((s) => s.folder)
  const openFolder = useLibraryStore((s) => s.openFolder)
  const selectNext = useLibraryStore((s) => s.selectNext)
  const selectPrev = useLibraryStore((s) => s.selectPrev)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'ArrowRight') selectNext()
      if (e.key === 'ArrowLeft') selectPrev()
      if (e.key === 'o' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        void openFolder()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openFolder, selectNext, selectPrev])

  return (
    <div className="app">
      <header className="topbar">
        <div className="logo">
          Quick<span>Pix</span>
        </div>
        <div className="folder-path">{folder ?? 'No folder open'}</div>
        <button className="btn" onClick={() => void openFolder()}>
          Open Folder…
        </button>
      </header>
      <Viewer />
      <AdjustPanel />
      <Filmstrip />
    </div>
  )
}
