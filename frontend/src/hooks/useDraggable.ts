"use client"

import { useCallback, useEffect, useRef, useState } from "react"

const STORAGE_KEY = "floodguard:nav-position"
/** Movement below this many pixels counts as a tap, not a drag. */
const TAP_THRESHOLD = 6
/** Distance moved per arrow-key press. */
const KEY_STEP = 24

type Position = { x: number; y: number }

/**
 * Makes an element draggable with pointer events (mouse, touch, pen).
 * The position is clamped to the viewport, saved, and re-clamped on resize.
 *
 * `onTap` runs when the pointer is released after moving less than TAP_THRESHOLD.
 */
export function useDraggable(size: number, onTap: () => void) {
  const [position, setPosition] = useState<Position>({ x: 16, y: 16 })
  const dragStart = useRef<{ pointer: Position; origin: Position } | null>(null)
  const moved = useRef(0)

  /** Keep the element fully inside the window. */
  const clamp = useCallback(
    (p: Position): Position => ({
      x: Math.min(Math.max(0, p.x), window.innerWidth - size),
      y: Math.min(Math.max(0, p.y), window.innerHeight - size),
    }),
    [size]
  )

  // Restore the saved position, or start at the bottom-left corner.
  useEffect(() => {
    let start: Position = { x: 16, y: window.innerHeight - size - 16 }
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      if (saved) start = JSON.parse(saved) as Position
    } catch {
      // Ignore: use the default position.
    }
    setPosition(clamp(start))
  }, [clamp, size])

  // Re-clamp when the window changes size.
  useEffect(() => {
    const onResize = () => setPosition((p) => clamp(p))
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [clamp])

  const save = (p: Position) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p))
    } catch {
      // Ignore: the position just won't persist.
    }
  }

  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragStart.current = {
      pointer: { x: event.clientX, y: event.clientY },
      origin: position,
    }
    moved.current = 0
  }

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const start = dragStart.current
    if (!start) return
    const dx = event.clientX - start.pointer.x
    const dy = event.clientY - start.pointer.y
    moved.current = Math.max(moved.current, Math.hypot(dx, dy))
    if (moved.current >= TAP_THRESHOLD) {
      setPosition(clamp({ x: start.origin.x + dx, y: start.origin.y + dy }))
    }
  }

  const onPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    if (!dragStart.current) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    dragStart.current = null
    if (moved.current < TAP_THRESHOLD) {
      onTap()
    } else {
      save(position)
    }
  }

  /** The browser cancelled the gesture (e.g. a system swipe): stop dragging. */
  const onPointerCancel = () => {
    dragStart.current = null
  }

  /** Arrow keys move the element; returns true when the key was handled. */
  const onArrowKey = (key: string): boolean => {
    const moves: Record<string, Position> = {
      ArrowLeft: { x: -KEY_STEP, y: 0 },
      ArrowRight: { x: KEY_STEP, y: 0 },
      ArrowUp: { x: 0, y: -KEY_STEP },
      ArrowDown: { x: 0, y: KEY_STEP },
    }
    const step = moves[key]
    if (!step) return false
    const next = clamp({ x: position.x + step.x, y: position.y + step.y })
    setPosition(next)
    save(next)
    return true
  }

  return {
    position,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
    onArrowKey,
  }
}
