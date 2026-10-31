"use client"

import { useGlass } from "@/context/GlassContext"

/**
 * Vertical slider fixed to the right edge. Up = more frosted, down = clearer.
 * Has its own outline so it can still be found when the glass is fully clear.
 */
export function GlassSlider() {
  const { glass, setGlass } = useGlass()

  return (
    <div className="fixed top-1/2 right-2 z-40 -translate-y-1/2 rounded-full border border-white/60 bg-black/10 py-3">
      <input
        type="range"
        className="glass-slider"
        min={0}
        max={1}
        step={0.01}
        value={glass}
        onChange={(event) => setGlass(Number(event.target.value))}
        aria-label="Glass transparency"
        aria-valuetext={`${Math.round(glass * 100)} percent frosted`}
      />
    </div>
  )
}
