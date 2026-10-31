"use client"

import { createContext, useContext, useEffect, useState } from "react"

const STORAGE_KEY = "floodguard:hand"

export type Hand = "left" | "right"

type HandContextValue = {
  /** Which hand model is used as the cursor. */
  hand: Hand
  setHand: (hand: Hand) => void
}

const HandContext = createContext<HandContextValue | null>(null)

/** Remembers which hand (left or right) the user picked for the cursor. */
export function HandProvider({ children }: { children: React.ReactNode }) {
  const [hand, setHand] = useState<Hand>("right")

  // Restore the saved choice after mount (storage can be unavailable).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      if (saved === "left" || saved === "right") setHand(saved)
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

  return <HandContext.Provider value={{ hand, setHand: choose }}>{children}</HandContext.Provider>
}

export function useHand(): HandContextValue {
  const context = useContext(HandContext)
  if (!context) throw new Error("useHand must be used inside <HandProvider>")
  return context
}
