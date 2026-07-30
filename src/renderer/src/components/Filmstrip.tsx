import { useEffect, useRef } from 'react'
import { useLibraryStore } from '../state/libraryStore'
import { pathToQpxUrl } from '@shared/protocol'

export function Filmstrip(): React.JSX.Element {
  const images = useLibraryStore((s) => s.images)
  const selectedIndex = useLibraryStore((s) => s.selectedIndex)
  const select = useLibraryStore((s) => s.select)
  const stripRef = useRef<HTMLDivElement>(null)

  // Keep the selected thumbnail in view when navigating with arrow keys.
  useEffect(() => {
    const el = stripRef.current?.children[selectedIndex] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [selectedIndex])

  if (images.length === 0) {
    return (
      <div className="filmstrip">
        <div className="empty">Open a folder to see your photos here</div>
      </div>
    )
  }

  return (
    <div className="filmstrip" ref={stripRef}>
      {images.map((img, i) => (
        <div
          key={img.path}
          className={`thumb${i === selectedIndex ? ' selected' : ''}`}
          onClick={() => select(i)}
          title={img.name}
        >
          <img src={pathToQpxUrl(img.path)} loading="lazy" draggable={false} alt={img.name} />
          <div className="name">{img.name}</div>
        </div>
      ))}
    </div>
  )
}
