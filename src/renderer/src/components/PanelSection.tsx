import { useState } from 'react'

interface PanelSectionProps {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}

export function PanelSection({ title, defaultOpen = true, children }: PanelSectionProps): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="panel-section">
      <div className="section-header" onClick={() => setOpen(!open)}>
        <span>{title}</span>
        <span className="chevron">{open ? '▾' : '▸'}</span>
      </div>
      {open && <div className="section-body">{children}</div>}
    </div>
  )
}
