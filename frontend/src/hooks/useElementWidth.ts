"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Tracks the width of an element in pixels, so a drawing can be made at its real size
 * (text in a scaled-down SVG would shrink with it). Returns the ref to put on the element and the width.
 */
export function useElementWidth<T extends HTMLElement>(initialWidth = 600) {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(initialWidth)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(() => setWidth(Math.round(element.clientWidth)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return { ref, width }
}
