import { useEffect, useRef, useState } from 'react'
import { passesFilter, useLibraryStore, type LibraryFilter } from '../state/libraryStore'
import { getThumbUrl } from '../lib/imageUrl'
import { getRawThumbUrl, isRawPath } from '../lib/rawDecoder'

/** 1x1 dark-gray placeholder while a RAW thumb is being extracted. */
const PLACEHOLDER =
  'data:image/gif;base64,R0lGODlhAQABAIAAAC4uLgAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw=='

const FILTERS: { value: LibraryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'picks', label: 'Picks' },
  { value: '3', label: '★3+' },
  { value: '4', label: '★4+' },
  { value: '5', label: '★5' }
]

export function Filmstrip(): React.JSX.Element {
  const images = useLibraryStore((s) => s.images)
  const selectedIndex = useLibraryStore((s) => s.selectedIndex)
  const selection = useLibraryStore((s) => s.selection)
  const metaByPath = useLibraryStore((s) => s.metaByPath)
  const filter = useLibraryStore((s) => s.filter)
  const setFilter = useLibraryStore((s) => s.setFilter)
  const select = useLibraryStore((s) => s.select)
  const toggleInSelection = useLibraryStore((s) => s.toggleInSelection)
  const selectRangeTo = useLibraryStore((s) => s.selectRangeTo)
  const stripRef = useRef<HTMLDivElement>(null)
  const [rawThumbs, setRawThumbs] = useState<Record<string, string>>({})

  // RAW files can't be thumbnailed by the main process — extract their
  // embedded JPEG previews here, one at a time to keep the CPU polite.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      for (const img of images) {
        if (cancelled) return
        if (!isRawPath(img.path) || rawThumbs[img.path]) continue
        try {
          const url = await getRawThumbUrl(img.path)
          if (cancelled) return
          setRawThumbs((prev) => ({ ...prev, [img.path]: url }))
        } catch {
          // leave the placeholder
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images])

  const thumbSrc = (path: string): string => {
    if (isRawPath(path)) return rawThumbs[path] ?? PLACEHOLDER
    return getThumbUrl(path)
  }

  // Keep the selected thumbnail in view when navigating with arrow keys.
  useEffect(() => {
    const el = stripRef.current?.querySelector(`[data-idx="${selectedIndex}"]`)
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [selectedIndex])

  if (images.length === 0) {
    return (
      <div className="filmstrip">
        <div className="empty">Open a folder to see your photos here</div>
      </div>
    )
  }

  const visible = images
    .map((img, i) => ({ img, i }))
    .filter(({ img }) => passesFilter(metaByPath[img.path], filter))

  return (
    <div className="filmstrip-wrap">
      <div className="filmstrip-filter">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            className={`filter-btn${filter === f.value ? ' active' : ''}`}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="filmstrip" ref={stripRef}>
        {visible.length === 0 && <div className="empty">No photos match this filter</div>}
        {visible.map(({ img, i }) => {
          const meta = metaByPath[img.path]
          return (
            <div
              key={img.path}
              data-idx={i}
              className={
                `thumb${i === selectedIndex ? ' selected' : ''}` +
                `${selection.includes(img.path) ? ' in-selection' : ''}` +
                `${meta?.flag === 'reject' ? ' rejected' : ''}`
              }
              onClick={(e) => {
                if (e.ctrlKey || e.metaKey) toggleInSelection(i)
                else if (e.shiftKey) selectRangeTo(i)
                else select(i)
              }}
              title={img.name}
            >
              <img src={thumbSrc(img.path)} loading="lazy" draggable={false} alt={img.name} />
              {meta?.flag === 'pick' && <div className="badge pick">⚑</div>}
              {meta?.flag === 'reject' && <div className="badge reject">✕</div>}
              {(meta?.rating ?? 0) > 0 && <div className="badge stars">{'★'.repeat(meta!.rating)}</div>}
              <div className="name">{img.name}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
