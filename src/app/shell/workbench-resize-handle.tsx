import { useEffect, useEffectEvent, useRef } from "react"
import { clampWidth } from "./workbench-layout"

export function WorkbenchResizeHandle({ label, value, min, max, direction = 1, onChange, onPreview, className }: {
  label: string; value: number; min: number; max: number; direction?: 1 | -1
  onChange: (value: number) => void; onPreview: (value: number | null) => void; className?: string
}) {
  const drag = useRef<{ x: number; value: number; moved: boolean } | null>(null)
  const cancelPreview = useEffectEvent(() => onPreview(null))
  useEffect(() => () => cancelPreview(), [])
  return <div role="separator" aria-label={label} aria-orientation="vertical" aria-valuemin={min} aria-valuemax={Math.round(max)} aria-valuenow={Math.round(value)} tabIndex={0}
    className={`absolute inset-y-0 z-20 w-2 cursor-col-resize touch-none outline-none hover:bg-primary/10 focus-visible:bg-primary/20 ${className ?? ""}`}
    onPointerDown={event => {
      if (event.button !== 0) return
      event.preventDefault()
      event.currentTarget.focus({ preventScroll: true })
      event.currentTarget.setPointerCapture(event.pointerId)
      drag.current = { x: event.clientX, value, moved: false }
    }}
    onPointerMove={event => {
      if (!drag.current) return
      drag.current.moved ||= event.clientX !== drag.current.x
      onPreview(clampWidth(drag.current.value + direction * (event.clientX - drag.current.x), min, max))
    }}
    onPointerUp={event => {
      if (drag.current?.moved) onChange(clampWidth(drag.current.value + direction * (event.clientX - drag.current.x), min, max))
      drag.current = null
      onPreview(null)
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    }}
    onLostPointerCapture={() => { drag.current = null; onPreview(null) }}
    onPointerCancel={() => { drag.current = null; onPreview(null) }}
    onKeyDown={event => {
      const step = event.shiftKey ? 32 : 8
      const delta = event.key === "ArrowLeft" ? -step * direction : event.key === "ArrowRight" ? step * direction : 0
      if (!delta && event.key !== "Home" && event.key !== "End") return
      event.preventDefault()
      onChange(event.key === "Home" ? min : event.key === "End" ? max : clampWidth(value + delta, min, max))
    }} />
}
