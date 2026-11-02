"use client"

import { createContext, useContext, useEffect, useState } from "react"

const STORAGE_KEY = "floodguard:hand"
const ENABLED_STORAGE_KEY = "floodguard:hand-enabled"

export type Hand = "left" | "right"

type HandContextValue = {
  /** Which hand model is used as the cursor. */
  hand: Hand
  setHand: (hand: Hand) => void
  /** Whether the 3D hand replaces the normal pointer. Off means the ordinary mouse cursor everywhere. */
  enabled: boolean
  setEnabled: (enabled: boolean) => void
}

const HandContext = createContext<HandContextValue | null>(null)

/** Remembers which hand (left or right) the user picked for the cursor. */
export function HandProvider({ children }: { children: React.ReactNode }) {
  const [hand, setHand] = useState<Hand>("right")
  const [enabled, setEnabledState] = useState(true)

  // Restore the saved choice after mount (storage can be unavailable).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      if (saved === "left" || saved === "right") setHand(saved)
      if (window.localStorage.getItem(ENABLED_STORAGE_KEY) === "off") setEnabledState(false)
    } catch {
      // Ignore: the default hand is used.
    }
  }, [])

  const choose = (next: Hand) => {
    setHand(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Ignore: the choice just won't persist.
    }
  }

  const setEnabled = (next: boolean) => {
    setEnabledState(next)
    try {
      window.localStorage.setItem(ENABLED_STORAGE_KEY, next ? "on" : "off")
    } catch {
      // Ignore: the choice just won't persist.
    }
  }

  return <HandContext.Provider value={{ hand, setHand: choose, enabled, setEnabled }}>{children}</HandContext.Provider>
}

export function useHand(): HandContextValue {
  const context = useContext(HandContext)
  if (!context) throw new Error("useHand must be used inside <HandProvider>")
  return context
}
