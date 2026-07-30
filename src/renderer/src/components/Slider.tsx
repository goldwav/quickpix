interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  defaultValue?: number
  /** Format the value readout (e.g. exposure shows +1.25). */
  format?: (v: number) => string
  onChange: (v: number) => void
}

const defaultFormat = (v: number): string => (v > 0 ? `+${Math.round(v)}` : `${Math.round(v)}`)

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  defaultValue = 0,
  format = defaultFormat,
  onChange
}: SliderProps): React.JSX.Element {
  return (
    <div className="slider-row" onDoubleClick={() => onChange(defaultValue)} title="Double-click to reset">
      <div className="slider-head">
        <span className="slider-label">{label}</span>
        <span className={`slider-value${value !== defaultValue ? ' active' : ''}`}>{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}
