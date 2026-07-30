import { useEditStore, type SliderKey } from '../state/editStore'
import { useSelectedImage } from '../state/libraryStore'
import { CurveEditor } from './CurveEditor'
import { Histogram } from './Histogram'
import { PanelSection } from './PanelSection'
import { Slider } from './Slider'

const fmtEv = (v: number): string => (v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2))

export function AdjustPanel(): React.JSX.Element {
  const image = useSelectedImage()
  const params = useEditStore((s) => s.params)
  const setParam = useEditStore((s) => s.setParam)
  const resetAll = useEditStore((s) => s.resetAll)
  const cropMode = useEditStore((s) => s.cropMode)
  const setCropMode = useEditStore((s) => s.setCropMode)

  if (!image) {
    return (
      <aside className="panel">
        <div className="placeholder">Select a photo to start adjusting.</div>
      </aside>
    )
  }

  const slider = (label: string, key: SliderKey, min = -100, max = 100): React.JSX.Element => (
    <Slider label={label} value={params[key]} min={min} max={max} onChange={(v) => setParam(key, v)} />
  )

  return (
    <aside className="panel">
      <Histogram />

      <div className="tool-row">
        <button className={`btn${cropMode ? ' primary' : ''}`} onClick={() => setCropMode(!cropMode)}>
          ⬚ Crop &amp; Straighten
        </button>
        {params.crop && !cropMode && <span className="crop-indicator">cropped</span>}
      </div>

      <PanelSection title="White Balance">
        {slider('Temp', 'temp')}
        {slider('Tint', 'tint')}
      </PanelSection>

      <PanelSection title="Tone">
        <Slider
          label="Exposure"
          value={params.exposure}
          min={-5}
          max={5}
          step={0.05}
          format={fmtEv}
          onChange={(v) => setParam('exposure', v)}
        />
        {slider('Contrast', 'contrast')}
        {slider('Highlights', 'highlights')}
        {slider('Shadows', 'shadows')}
        {slider('Whites', 'whites')}
        {slider('Blacks', 'blacks')}
      </PanelSection>

      <PanelSection title="Presence">
        {slider('Clarity', 'clarity')}
        {slider('Vibrance', 'vibrance')}
        {slider('Saturation', 'saturation')}
      </PanelSection>

      <PanelSection title="Tone Curve" defaultOpen={false}>
        <CurveEditor />
      </PanelSection>

      <PanelSection title="Detail" defaultOpen={false}>
        {slider('Sharpen', 'sharpen', 0, 100)}
      </PanelSection>

      <PanelSection title="Effects" defaultOpen={false}>
        {slider('Vignette', 'vignette')}
        {slider('Grain', 'grain', 0, 100)}
      </PanelSection>

      <div className="panel-actions">
        <button className="btn" onClick={resetAll}>
          Reset All
        </button>
      </div>
    </aside>
  )
}
