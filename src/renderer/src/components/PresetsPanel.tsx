import { useEffect, useState } from 'react'
import type { Preset } from '@shared/types'
import { normalizeParams, type EditParams } from '@shared/editParams'
import { BUILTIN_PRESETS } from '../presets/builtin'
import { useEditStore } from '../state/editStore'
import { useSelectedImage } from '../state/libraryStore'
import { toast } from '../state/uiStore'
import { PanelSection } from './PanelSection'

export function PresetsPanel(): React.JSX.Element {
  const image = useSelectedImage()
  const applyPreset = useEditStore((s) => s.applyPreset)
  const setPreviewParams = useEditStore((s) => s.setPreviewParams)
  const [userPresets, setUserPresets] = useState<Preset[]>([])
  const [saving, setSaving] = useState(false)
  const [newName, setNewName] = useState('')

  useEffect(() => {
    window.quickpix
      .listPresets()
      .then(setUserPresets)
      .catch(() => {})
  }, [])

  const disabled = !image

  const presetButton = (name: string, params: EditParams, onDelete?: () => void): React.JSX.Element => (
    <div
      key={name}
      className={`preset-item${disabled ? ' disabled' : ''}`}
      onMouseEnter={() => !disabled && setPreviewParams(params)}
      onMouseLeave={() => setPreviewParams(null)}
      onClick={() => {
        if (disabled) return
        setPreviewParams(null)
        applyPreset(params)
      }}
    >
      <span className="preset-name">{name}</span>
      {onDelete && (
        <button
          className="preset-delete"
          title="Delete preset"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
        >
          ×
        </button>
      )}
    </div>
  )

  const saveCurrent = (): void => {
    const name = newName.trim()
    if (!name) return
    const params: EditParams = { ...structuredClone(useEditStore.getState().params), crop: null }
    void window.quickpix
      .savePreset({ name, params })
      .then((list) => {
        setUserPresets(list)
        setSaving(false)
        setNewName('')
        toast('success', `Preset “${name}” saved`)
      })
      .catch(() => toast('error', "Couldn't save preset"))
  }

  return (
    <aside className="presets-panel">
      <PanelSection title="Filters">
        {BUILTIN_PRESETS.map((p) => presetButton(p.name, p.params))}
      </PanelSection>

      <PanelSection title="My Presets">
        {userPresets.length === 0 && !saving && <div className="presets-empty">Nothing saved yet</div>}
        {userPresets.map((p) =>
          presetButton(p.name, normalizeParams(p.params), () => {
            void window.quickpix.deletePreset(p.name).then(setUserPresets)
          })
        )}
        {saving ? (
          <div className="preset-save-row">
            <input
              autoFocus
              placeholder="Preset name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveCurrent()
                if (e.key === 'Escape') setSaving(false)
              }}
            />
            <button className="btn" onClick={saveCurrent}>
              Save
            </button>
          </div>
        ) : (
          <button className="btn preset-add" disabled={disabled} onClick={() => setSaving(true)}>
            + Save current as preset
          </button>
        )}
      </PanelSection>
    </aside>
  )
}
