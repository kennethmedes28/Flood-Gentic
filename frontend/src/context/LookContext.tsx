"use client"

import { createContext, useContext, useEffect, useState } from "react"

const STORAGE_KEY = "floodguard:look"

/** The visual style of the dashboard. (The light/dark mode is separate.) */
export type Look = "default" | "cyberpunk"

type LookContextValue = {
  look: Look
  setLook: (look: Look) => void
}

const LookContext = createContext<LookContextValue | null>(null)

/**
 * Holds the chosen look and mirrors it onto <html> as data-look, which the
 * CSS in glass.css uses to switch colours. The choice is saved.
 */
export function LookProvider({ children }: { children: React.ReactNode }) {
  const [look, setLookState] = useState<Look>("default")

  // Restore the saved look after mount (storage can be unavailable).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      if (saved === "default" || saved === "cyberpunk") setLookState(saved)
    } catch {
      // Ignore: the default look is used.
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.look = look
  }, [look])

  const setLook = (next: Look) => {
    setLookState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Ignore: the choice just won't persist.
    }
  }

  return <LookContext.Provider value={{ look, setLook }}>{children}</LookContext.Provider>
}

export function useLook(): LookContextValue {
  const context = useContext(LookContext)
  if (!context) throw new Error("useLook must be used inside <LookProvider>")
  return context
}
