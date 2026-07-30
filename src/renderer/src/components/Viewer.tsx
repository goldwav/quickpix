import { useLibraryStore, useSelectedImage } from '../state/libraryStore'
import { pathToQpxUrl } from '@shared/protocol'

export function Viewer(): React.JSX.Element {
  const image = useSelectedImage()
  const openFolder = useLibraryStore((s) => s.openFolder)

  if (!image) {
    return (
      <div className="viewer">
        <div className="empty-state">
          <h2>Welcome to QuickPix</h2>
          <p>Open a folder of photos to start editing — quick, subtle, non-destructive.</p>
          <button className="btn primary" onClick={() => void openFolder()}>
            Open Folder…
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="viewer">
      <img className="preview" src={pathToQpxUrl(image.path)} alt={image.name} draggable={false} />
    </div>
  )
}
