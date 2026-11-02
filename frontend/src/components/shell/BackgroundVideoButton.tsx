"use client"

import { useBackgroundVideo } from "@/context/BackgroundVideoContext"

/**
 * A small button fixed near the bottom-right corner that turns the looping background video on or off.
 * It sits above the corner where the frame can be resized, and below the glass slider on the right edge.
 */
export function BackgroundVideoButton() {
  const { enabled, setEnabled } = useBackgroundVideo()

  return (
    <button
      type="button"
      onClick={() => setEnabled(!enabled)}
      aria-pressed={enabled}
      aria-label="Background video"
      className="fixed right-2 bottom-20 z-40 flex min-h-11 items-center gap-2 rounded-full border border-[var(--slider-border)] bg-black/10 px-4 text-sm font-medium backdrop-blur aria-pressed:bg-[var(--glass-accent)] aria-pressed:text-white aria-pressed:[text-shadow:none]"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="3" stroke="currentColor" strokeWidth="2" />
        {enabled ? <path d="M10 9.5v5l4-2.5-4-2.5z" fill="currentColor" /> : <path d="M4 4l16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
      </svg>
      {enabled ? "Video on" : "Video off"}
    </button>
  )
}
