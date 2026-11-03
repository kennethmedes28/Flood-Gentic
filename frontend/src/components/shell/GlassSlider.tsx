"use client"

import { useGlass } from "@/context/GlassContext"
import { useT } from "@/context/LanguageContext"

/**
 * Vertical slider fixed to the right edge. Up = more frosted, down = clearer.
 * Has its own outline so it can still be found when the glass is fully clear.
 */
export function GlassSlider() {
  const { glass, setGlass } = useGlass()
  const t = useT()

  return (
    <div className="fixed top-1/2 right-2 z-40 -translate-y-1/2 rounded-full border border-[var(--slider-border)] bg-black/10 py-3">
      <input
        type="range"
        className="glass-slider"
        min={0}
        max={1}
        step={0.01}
        value={glass}
        onChange={(event) => setGlass(Number(event.target.value))}
        aria-label={t("slider.label")}
        aria-valuetext={t("slider.valueText", { percent: Math.round(glass * 100) })}
      />
    </div>
  )
}
