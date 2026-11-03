"use client"

import { createContext, useCallback, useContext, useEffect, useSyncExternalStore } from "react"

const STORAGE_KEY = "floodguard:text-size"

export type TextSize = "small" | "default" | "large" | "xlarge"

/**
 * How much each choice scales the text. The page's base font size is `calc(100% * var(--text-scale))`
 * (see globals.css), so "default" is whatever text size the browser or device is set to, and the others
 * multiply that. All text is sized in rem, so everything follows.
 */
export const TEXT_SCALES: Record<TextSize, number> = { small: 0.9, default: 1, large: 1.25, xlarge: 1.5 }

type TextSizeValue = {
  size: TextSize
  setSize: (size: TextSize) => void
}

const TextSizeContext = createContext<TextSizeValue | null>(null)

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

/** The choice kept in memory, used when browser storage is unavailable (it then lasts until the page is reloaded). */
let choiceInMemory: TextSize = "default"

function isTextSize(value: string | null): value is TextSize {
  return value !== null && value in TEXT_SCALES
}

/** The saved choice, or "default". */
function readSize(): TextSize {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    return isTextSize(saved) ? saved : "default"
  } catch {
    return choiceInMemory
  }
}

/** What the server (and the first render in the browser) assumes. */
function readSizeOnServer(): TextSize {
  return "default"
}

/** Remembers the text size the user picked and applies it to the whole page. */
export function TextSizeProvider({ children }: { children: React.ReactNode }) {
  const size = useSyncExternalStore(subscribe, readSize, readSizeOnServer)

  // Apply the scale to the page: globals.css turns --text-scale into the base font size.
  useEffect(() => {
    document.documentElement.style.setProperty("--text-scale", String(TEXT_SCALES[size]))
  }, [size])

  const setSize = useCallback((next: TextSize) => {
    choiceInMemory = next
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Ignore: the choice just won't persist.
    }
    listeners.forEach((listener) => listener())
  }, [])

  return <TextSizeContext.Provider value={{ size, setSize }}>{children}</TextSizeContext.Provider>
}

export function useTextSize(): TextSizeValue {
  const context = useContext(TextSizeContext)
  if (!context) throw new Error("useTextSize must be used inside <TextSizeProvider>")
  return context
}
