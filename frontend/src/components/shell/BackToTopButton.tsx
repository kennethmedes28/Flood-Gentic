"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

/** How far down (in pixels) the page must be scrolled before the button appears. */
const SHOW_AFTER_PX = 400

type BackToTopButtonProps = {
  /** Any element inside the scrolling area. The scrolling area is found by walking up from it. */
  insideRef: React.RefObject<HTMLElement | null>
  /** Where keyboard focus goes after scrolling up, for example the first filter. */
  focusRef?: React.RefObject<HTMLElement | null>
}

/** The nearest ancestor that scrolls up and down, or null when the whole window scrolls. */
function findScroller(start: HTMLElement | null): HTMLElement | null {
  for (let element = start?.parentElement ?? null; element; element = element.parentElement) {
    const overflowY = window.getComputedStyle(element).overflowY
    if (overflowY === "auto" || overflowY === "scroll") return element
  }
  return null
}

/**
 * A "Back to top" button that appears once the page is scrolled down, and scrolls back up to the top (where the
 * filters are). It then moves keyboard focus to `focusRef`, so keyboard and screen reader users land on the first filter.
 *
 * The pages scroll inside a frame (see ResizableFrame), not the window, so the scrolling area is found from `insideRef`.
 * The button is drawn on the page body, because the frame can be shrunk with a transform, which would move a fixed button.
 */
export function BackToTopButton({ insideRef, focusRef }: BackToTopButtonProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const scroller = findScroller(insideRef.current)
    const target: HTMLElement | Window = scroller ?? window
    const scrolledDown = () => (scroller ? scroller.scrollTop : window.scrollY) > SHOW_AFTER_PX
    const onScroll = () => setVisible(scrolledDown())

    target.addEventListener("scroll", onScroll, { passive: true })
    return () => target.removeEventListener("scroll", onScroll)
  }, [insideRef])

  function goToTop() {
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
    const scroller = findScroller(insideRef.current)
    if (scroller) scroller.scrollTo({ top: 0, behavior })
    else window.scrollTo({ top: 0, behavior })
    focusRef?.current?.focus({ preventScroll: true })
  }

  if (!visible) return null

  return createPortal(
    <button
      type="button"
      onClick={goToTop}
      className="fixed right-2 bottom-32 z-40 flex min-h-11 items-center gap-2 rounded-full border border-[var(--slider-border)] bg-black/10 px-4 text-sm font-medium backdrop-blur"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 19V5m-6 6l6-6 6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Back to top
      <span className="sr-only"> (go to the filters)</span>
    </button>,
    document.body
  )
}
