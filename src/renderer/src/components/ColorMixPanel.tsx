import { useState } from 'react'
import { HSL_BANDS } from '@shared/editParams'
import { useEditStore } from '../state/editStore'
import { Slider } from './Slider'

const BAND_COLORS = ['#e05a4e', '#e0964e', '#d9c44e', '#5cbf5c', '#4ec4c4', '#5a9ae0', '#9a6ae0', '#d95ab8']
const LABELS = ['Red', 'Orange', 'Yellow', 'Green', 'Aqua', 'Blue', 'Purple', 'Magenta']
type Channel = 'hue' | 'sat' | 'lum'

const CHANNEL_TABS: { key: Channel; label: string }[] = [
  { key: 'hue', label: 'Hue' },
  { key: 'sat', label: 'Saturation' },
  { key: 'lum', label: 'Luminance' }
]

/** 8-band HSL mixer, Lightroom-style. */
export function ColorMixPanel(): React.JSX.Element {
  const hsl = useEditStore((s) => s.params.hsl)
  const setParams = useEditStore((s) => s.setParams)
  const [channel, setChannel] = useState<Channel>('sat')

  const setBand = (index: number, value: number): void => {
    const arr = [...hsl[channel]]
    arr[index] = value
    setParams({ hsl: { ...hsl, [channel]: arr } }, `hsl:${channel}:${index}`)
  }

  return (
    <div className="color-mix">
      <div className="curve-channels">
        {CHANNEL_TABS.map((t) => (
          <button
            key={t.key}
            className={`curve-channel${channel === t.key ? ' active' : ''}`}
            onClick={() => setChannel(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {HSL_BANDS.map((band, i) => (
        <div key={band} className="band-slider" style={{ ['--band-color' as string]: BAND_COLORS[i] }}>
          <Slider label={LABELS[i]} value={hsl[channel][i]} min={-100} max={100} onChange={(v) => setBand(i, v)} />
        </div>
      ))}
    </div>
  )
}
