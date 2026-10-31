"use client"

import { createContext, useContext, useEffect, useState } from "react"

const STORAGE_KEY = "floodguard:glass"
const DEFAULT_GLASS = 0.55
/** Above this value the glass is frosted enough for dark text. */
const CLEAR_TONE_THRESHOLD = 0.45

type GlassContextValue = {
  /** 0 = clear, 1 = fully frosted */
  glass: number
  setGlass: (value: number) => void
}

const GlassContext = createContext<GlassContextValue | null>(null)

/**
 * Holds the glass transparency value and mirrors it onto <html> as the
 * --g CSS variable, plus a data-glass-tone attribute used for text colour.
 */
export function GlassProvider({ children }: { children: React.ReactNode }) {
  const [glass, setGlass] = useState(DEFAULT_GLASS)

  // Restore the saved value after mount (storage can be unavailable).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      if (saved !== null) {
        const parsed = Number(saved)
        if (!Number.isNaN(parsed)) setGlass(Math.min(1, Math.max(0, parsed)))
      }
    } catch {
      // Ignore: the default value is used.
    }
  }, [])

  // Push the value to CSS and save it.
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty("--g", String(glass))
    root.dataset.glassTone = glass < CLEAR_TONE_THRESHOLD ? "clear" : "frosted"
    try {
      window.localStorage.setItem(STORAGE_KEY, String(glass))
    } catch {
      // Ignore: the value just won't persist.
    }
  }, [glass])

  return <GlassContext.Provider value={{ glass, setGlass }}>{children}</GlassContext.Provider>
}

export function useGlass(): GlassContextValue {
  const context = useContext(GlassContext)
  if (!context) throw new Error("useGlass must be used inside <GlassProvider>")
  return context
}
