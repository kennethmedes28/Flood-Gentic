"use client"

import { createContext, useCallback, useContext, useSyncExternalStore } from "react"

const STORAGE_KEY = "floodguard:icon-size"

export type IconSize = "small" | "default" | "large" | "xlarge"

/**
 * How much each choice scales the round menu button (the "icon box"), which is 68 pixels at "default". It is separate from the
 * text size on purpose: a person who needs big text may still want a small button that does not cover the page, and the other way round.
 */
export const ICON_SCALES: Record<IconSize, number> = { small: 0.65, default: 1, large: 1.3, xlarge: 1.6 }

/** The button's width and height in pixels at "default". */
export const ICON_BASE_PX = 68

type IconSizeValue = {
  size: IconSize
  setSize: (size: IconSize) => void
  /** The button's width and height in pixels for the chosen size. */
  pixels: number
}

const IconSizeContext = createContext<IconSizeValue | null>(null)

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
let choiceInMemory: IconSize = "default"

function isIconSize(value: string | null): value is IconSize {
  return value !== null && value in ICON_SCALES
}

function readSize(): IconSize {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    return isIconSize(saved) ? saved : "default"
  } catch {
    return choiceInMemory
  }
}

/** What the server (and the first render in the browser) assumes. */
function readSizeOnServer(): IconSize {
  return "default"
}

/** Remembers the icon size the user picked. */
export function IconSizeProvider({ children }: { children: React.ReactNode }) {
  const size = useSyncExternalStore(subscribe, readSize, readSizeOnServer)

  const setSize = useCallback((next: IconSize) => {
    choiceInMemory = next
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Ignore: the choice just won't persist.
    }
    listeners.forEach((listener) => listener())
  }, [])

  return <IconSizeContext.Provider value={{ size, setSize, pixels: Math.round(ICON_BASE_PX * ICON_SCALES[size]) }}>{children}</IconSizeContext.Provider>
}

export function useIconSize(): IconSizeValue {
  const context = useContext(IconSizeContext)
  if (!context) throw new Error("useIconSize must be used inside <IconSizeProvider>")
  return context
}
