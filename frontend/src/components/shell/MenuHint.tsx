"use client"

import { useCallback, useSyncExternalStore } from "react"

import { useT } from "@/context/LanguageContext"

/** Space between the button, the arrow and the bubble, and from the edge of the screen, in pixels. */
const GAP = 8
/** Size of the arrow's box, in pixels. */
const ARROW_SIZE = 36
/** The bubble is as wide as this many rem (so it grows with the text size), but never wider than the screen. */
const BUBBLE_WIDTH_REM = 16

// --- Whether the hint was seen ----------------------------------------------------------------------------------------
// Kept in localStorage and read with useSyncExternalStore, the same way as the icon and text size choices.

const SEEN_KEY = "floodguard:menu-hint-seen"

/** Everything that wants to know when the hint is dismissed in this tab (the "storage" event only fires in other tabs). */
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  window.addEventListener("storage", listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", listener)
  }
}

/** Used when browser storage is blocked (for example a private window): the hint then shows once per page load. */
let seenInMemory = false

function readSeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1"
  } catch {
    return seenInMemory
  }
}

/** The server (and the first render in the browser) treats the hint as seen, so it never flashes before storage is read. */
function readSeenOnServer(): boolean {
  return true
}

/** Whether the first-time hint should show, and a function that hides it for good. */
export function useMenuHint(): { showHint: boolean; dismissHint: () => void } {
  const seen = useSyncExternalStore(subscribe, readSeen, readSeenOnServer)

  const dismissHint = useCallback(() => {
    seenInMemory = true
    try {
      window.localStorage.setItem(SEEN_KEY, "1")
    } catch {
      // Ignore: the hint may show again after a reload.
    }
    listeners.forEach((listener) => listener())
  }, [])

  return { showHint: !seen, dismissHint }
}

// --- The hint itself --------------------------------------------------------------------------------------------------

/**
 * A one-time hint for first-time users: a bouncing arrow that points at the floating menu button, and a short text
 * that says what the button does. FloatingNav shows it while ``useMenuHint`` says the hint was not seen yet.
 *
 * The button can be dragged anywhere and its size can change, so the hint is placed from the button's current
 * position: above the button when the button is in the lower half of the screen, below it otherwise, and to the
 * side of the screen that has more room.
 */
export function MenuHint({
  buttonX,
  buttonY,
  buttonSize,
  onDismiss,
}: {
  buttonX: number
  buttonY: number
  buttonSize: number
  onDismiss: () => void
}) {
  const t = useT()

  // Only rendered in the browser (the server treats the hint as seen), so the window is there.
  const screenWidth = window.innerWidth
  const screenHeight = window.innerHeight
  const rootFontPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  const bubbleWidth = Math.min(BUBBLE_WIDTH_REM * rootFontPx, screenWidth - 2 * GAP)

  const buttonCentreX = buttonX + buttonSize / 2
  const pointsDown = buttonY > screenHeight / 2 // the hint sits above the button and its arrow points down at it

  // Bubble: start at the button's edge on the side with more room, then keep it inside the screen.
  const onLeftHalf = buttonCentreX < screenWidth / 2
  const wantedLeft = onLeftHalf ? buttonX : buttonX + buttonSize - bubbleWidth
  const bubbleLeft = Math.max(GAP, Math.min(wantedLeft, screenWidth - bubbleWidth - GAP))

  const arrowLeft = buttonCentreX - ARROW_SIZE / 2
  const arrowStyle = pointsDown
    ? { left: arrowLeft, top: buttonY - GAP - ARROW_SIZE }
    : { left: arrowLeft, top: buttonY + buttonSize + GAP }
  const bubbleStyle = pointsDown
    ? { left: bubbleLeft, width: bubbleWidth, bottom: screenHeight - (buttonY - 2 * GAP - ARROW_SIZE) }
    : { left: bubbleLeft, width: bubbleWidth, top: buttonY + buttonSize + 2 * GAP + ARROW_SIZE }

  return (
    <>
      <svg
        className={`menu-hint-arrow fixed z-50 ${pointsDown ? "menu-hint-arrow--down" : "menu-hint-arrow--up"}`}
        style={arrowStyle}
        width={ARROW_SIZE}
        height={ARROW_SIZE}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        {/* Drawn pointing down; turned around by CSS when the button is below the hint's top edge. */}
        <path d="M12 3v15M5 12l7 7 7-7" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>

      <div className="help-dialog menu-hint fixed z-50 p-4 text-sm" style={bubbleStyle} role="status">
        <p className="font-semibold">{t("nav.hintTitle")}</p>
        <p className="help-muted mt-1">{t("nav.hintBody")}</p>
        <button type="button" onClick={onDismiss} className="help-close mt-3 min-h-11 rounded-full px-4 text-sm font-semibold">
          {t("nav.hintDismiss")}
        </button>
      </div>
    </>
  )
}
