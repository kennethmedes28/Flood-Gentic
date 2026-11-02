"use client"

import { createContext, useCallback, useContext, useSyncExternalStore } from "react"

const STORAGE_KEY = "floodguard:background-video"

type BackgroundVideoValue = {
  /** Whether the looping background video plays. Off means the plain gradient is shown instead. */
  enabled: boolean
  setEnabled: (enabled: boolean) => void
}

const BackgroundVideoContext = createContext<BackgroundVideoValue | null>(null)

/** Everything that wants to know when the saved choice changes in this tab (the "storage" event only fires in other tabs). */
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  window.addEventListener("storage", listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", listener)
  }
}

/** The choice kept in memory, used when browser storage is unavailable (the choice then lasts until the page is reloaded). */
let choiceInMemory = false

/** The saved choice. */
function readEnabled(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "on"
  } catch {
    return choiceInMemory
  }
}

/** What the server (and the first render in the browser) assumes: off. */
function readEnabledOnServer(): boolean {
  return false
}

/**
 * Remembers whether the user turned the background video on.
 * It is OFF until the user turns it on, so nobody downloads or plays the video without choosing to.
 * The saved choice is read with useSyncExternalStore, which keeps the first browser render the same as the server's.
 */
export function BackgroundVideoProvider({ children }: { children: React.ReactNode }) {
  const enabled = useSyncExternalStore(subscribe, readEnabled, readEnabledOnServer)

  const setEnabled = useCallback((next: boolean) => {
    choiceInMemory = next
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off")
    } catch {
      // Ignore: the choice just won't persist.
    }
    listeners.forEach((listener) => listener())
  }, [])

  return <BackgroundVideoContext.Provider value={{ enabled, setEnabled }}>{children}</BackgroundVideoContext.Provider>
}

export function useBackgroundVideo(): BackgroundVideoValue {
  const context = useContext(BackgroundVideoContext)
  if (!context) throw new Error("useBackgroundVideo must be used inside <BackgroundVideoProvider>")
  return context
}
