import { useLibraryStore, useSelectedImage } from '../state/libraryStore'

/** Clickable stars + pick/reject flags for the active photo (viewer overlay). */
export function CullBar(): React.JSX.Element | null {
  const image = useSelectedImage()
  const meta = useLibraryStore((s) => (image ? s.metaByPath[image.path] : undefined))
  const setRating = useLibraryStore((s) => s.setRating)
  const setFlag = useLibraryStore((s) => s.setFlag)

  if (!image) return null
  const rating = meta?.rating ?? 0
  const flag = meta?.flag ?? null

  return (
    <div className="cull-bar">
      <div className="cull-stars" title="Rate (keys 1–5, 0 clears)">
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            className={`cull-star${n <= rating ? ' active' : ''}`}
            onClick={() => setRating(n)}
          >
            ★
          </span>
        ))}
      </div>
      <button
        className={`cull-flag pick${flag === 'pick' ? ' active' : ''}`}
        title="Pick (P)"
        onClick={() => setFlag('pick')}
      >
        ⚑
      </button>
      <button
        className={`cull-flag reject${flag === 'reject' ? ' active' : ''}`}
        title="Reject (X)"
        onClick={() => setFlag('reject')}
      >
        ✕
      </button>
    </div>
  )
}
