import type { SplitToning } from '@shared/editParams'
import { useEditStore } from '../state/editStore'
import { Slider } from './Slider'

export function SplitToningPanel(): React.JSX.Element {
  const split = useEditStore((s) => s.params.split)
  const setParams = useEditStore((s) => s.setParams)

  const set = (key: keyof SplitToning, value: number): void => {
    setParams({ split: { ...split, [key]: value } }, `split:${key}`)
  }

  const hueSlider = (label: string, key: 'shadowHue' | 'highlightHue'): React.JSX.Element => (
    <div className="hue-slider">
      <Slider
        label={label}
        value={split[key]}
        min={0}
        max={360}
        defaultValue={key === 'highlightHue' ? 50 : 0}
        format={(v) => `${Math.round(v)}°`}
        onChange={(v) => set(key, v)}
      />
    </div>
  )

  return (
    <div className="split-toning">
      <div className="split-group-label">Highlights</div>
      {hueSlider('Hue', 'highlightHue')}
      <Slider label="Saturation" value={split.highlightSat} min={0} max={100} onChange={(v) => set('highlightSat', v)} />

      <div className="split-group-label">Shadows</div>
      {hueSlider('Hue', 'shadowHue')}
      <Slider label="Saturation" value={split.shadowSat} min={0} max={100} onChange={(v) => set('shadowSat', v)} />

      <div className="split-group-label">&nbsp;</div>
      <Slider label="Balance" value={split.balance} min={-100} max={100} onChange={(v) => set('balance', v)} />
    </div>
  )
}
