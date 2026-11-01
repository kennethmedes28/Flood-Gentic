"use client"

import { useCallback, useEffect, useRef, useState } from "react"

const STORAGE_PREFIX = "floodguard:frame:"
/** The frame never gets narrower than this share of the window's width. */
const MIN_WIDTH_SHARE = 0.4
/** The frame never gets shorter than this many pixels. */
const MIN_HEIGHT = 240
/** Distance moved per arrow-key press. */
const KEY_STEP = 24

export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right"

/** How far each side of the frame is pulled in from the matching edge of the window, in pixels. */
export type Insets = { left: number; top: number; right: number; bottom: number }

const FULL: Insets = { left: 0, top: 0, right: 0, bottom: 0 }

type Viewport = { width: number; height: number }

function limit(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

/** Pull `insets` back inside the window, keeping the frame at least as large as the minimum. */
function fit(insets: Insets, viewport: Viewport): Insets {
  const minWidth = viewport.width * MIN_WIDTH_SHARE
  const left = limit(insets.left, 0, viewport.width - minWidth)
  const right = limit(insets.right, 0, viewport.width - left - minWidth)
  const top = limit(insets.top, 0, viewport.height - MIN_HEIGHT)
  const bottom = limit(insets.bottom, 0, viewport.height - top - MIN_HEIGHT)
  return { left, top, right, bottom }
}

/**
 * Where the sides end up when a corner is moved by (dx, dy) from `origin`.
 * Only the two sides that meet at that corner move; the opposite corner stays where it is.
 */
function moveCorner(corner: Corner, origin: Insets, dx: number, dy: number, viewport: Viewport): Insets {
  const next = { ...origin }
  const minWidth = viewport.width * MIN_WIDTH_SHARE

  if (corner.endsWith("left")) {
    next.left = limit(origin.left + dx, 0, viewport.width - origin.right - minWidth)
  } else {
    next.right = limit(origin.right - dx, 0, viewport.width - origin.left - minWidth)
  }
  if (corner.startsWith("top")) {
    next.top = limit(origin.top + dy, 0, viewport.height - origin.bottom - MIN_HEIGHT)
  } else {
    next.bottom = limit(origin.bottom - dy, 0, viewport.height - origin.top - MIN_HEIGHT)
  }
  return next
}

/**
 * A frame that can be shrunk by dragging one of its four corners toward the centre.
 *
 * Starting from the whole window, a corner dragged inward pulls its two sides in; the opposite corner stays put.
 * The size is saved per `storageKey` and kept inside the window when the window changes size.
 *
 * `scale` is how much the content must be shrunk to fit the frame's width (1 when the frame fills the window).
 */
export function useResizableFrame(storageKey: string) {
  const [insets, setInsets] = useState<Insets>(FULL)
  const [viewport, setViewport] = useState<Viewport>({ width: 1280, height: 720 })
  const [dragging, setDragging] = useState<Corner | null>(null)
  const dragStart = useRef<{ corner: Corner; x: number; y: number; origin: Insets } | null>(null)

  const save = useCallback(
    (value: Insets) => {
      try {
        window.localStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify(value))
      } catch {
        // Ignore: the size just won't be remembered.
      }
    },
    [storageKey]
  )

  // Learn the window size, restore the saved frame, and keep the frame inside the window when it changes size.
  useEffect(() => {
    const measure = () => {
      const size = { width: window.innerWidth, height: window.innerHeight }
      setViewport(size)
      setInsets((current) => fit(current, size))
    }

    /** The saved frame, if there is one, or null. */
    const readSaved = (): Insets | null => {
      try {
        const saved = window.localStorage.getItem(STORAGE_PREFIX + storageKey)
        return saved ? { ...FULL, ...(JSON.parse(saved) as Insets) } : null
      } catch {
        return null // Ignore: start with the full window.
      }
    }

    const restoreAndMeasure = () => {
      const saved = readSaved()
      if (saved) setInsets(saved)
      measure() // also keeps the restored frame inside the window
    }

    restoreAndMeasure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [storageKey])

  const isFull = insets.left === 0 && insets.top === 0 && insets.right === 0 && insets.bottom === 0
  const width = viewport.width - insets.left - insets.right
  const height = viewport.height - insets.top - insets.bottom
  const scale = isFull ? 1 : width / viewport.width

  const reset = useCallback(() => {
    setInsets(FULL)
    save(FULL)
  }, [save])

  /** The event handlers and keyboard support for one corner handle. */
  const cornerProps = (corner: Corner) => ({
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId)
      dragStart.current = { corner, x: event.clientX, y: event.clientY, origin: insets }
      setDragging(corner)
    },
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
      const start = dragStart.current
      if (!start) return
      setInsets(moveCorner(start.corner, start.origin, event.clientX - start.x, event.clientY - start.y, viewport))
    },
    onPointerUp: (event: React.PointerEvent<HTMLElement>) => {
      if (!dragStart.current) return
      event.currentTarget.releasePointerCapture(event.pointerId)
      dragStart.current = null
      setDragging(null)
      save(insets)
    },
    /** The browser cancelled the gesture (for example a system swipe): stop dragging. */
    onPointerCancel: () => {
      dragStart.current = null
      setDragging(null)
    },
    onDoubleClick: reset,
    /** Arrow keys move the corner by one step; Enter or Escape put the frame back to full size. */
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
      const steps: Record<string, [number, number]> = {
        ArrowLeft: [-KEY_STEP, 0],
        ArrowRight: [KEY_STEP, 0],
        ArrowUp: [0, -KEY_STEP],
        ArrowDown: [0, KEY_STEP],
      }
      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault()
        reset()
        return
      }
      const step = steps[event.key]
      if (!step) return
      event.preventDefault()
      const next = moveCorner(corner, insets, step[0], step[1], viewport)
      setInsets(next)
      save(next)
    },
  })

  return { insets, viewport, width, height, scale, isFull, dragging, cornerProps, reset }
}
