"use client"

import { useEffect, useRef } from "react"

/** The guide: a heading and a few short points for each part of the app. */
const SECTIONS: { title: string; points: string[] }[] = [
  {
    title: "Getting around",
    points: [
      "Tap the round logo button to open the menu. Drag it anywhere you like, or focus it and use the arrow keys to move it.",
      "Pick a page from the menu. “Hazard map” opens the official UP NOAH map in a new tab.",
      "Press Esc, or tap outside the menu, to close it.",
    ],
  },
  {
    title: "Making it easier to see",
    points: [
      "The slider on the right edge sets how frosted the panels are: up for more frost, down for clearer. With the keyboard, focus it and use the arrow keys.",
      "Theme, in the menu, switches between Default and Cyberpunk.",
      "Text size, in the menu, makes all the text smaller or larger: Small, Default, Large or Extra large. Default follows your browser or device text size. It is remembered on this device.",
    ],
  },
  {
    title: "The hand cursor",
    points: [
      "On most pages the pointer is a 3D hand with a red laser dot. The dot is where you point and click. Choose the Left or Right hand in the menu.",
      "Prefer the normal pointer? Set “Hand cursor” to Off in the menu. It is remembered on this device.",
      "Hold Alt and press the arrow keys to move the hand out of the way.",
      "The PAGASA satellite page uses your normal pointer.",
    ],
  },
  {
    title: "Resizing the view",
    points: [
      "On the dashboard and the AI Agent Flood Assistant, drag a corner bracket toward the centre to shrink the view, and drag it back out to enlarge it.",
      "With the keyboard: Tab to a corner, press the arrow keys to move it, and press Enter or Esc to restore the full size. Double-clicking a corner restores it too.",
    ],
  },
  {
    title: "Reduced motion",
    points: ["If your device is set to reduce motion, the opening animation is skipped."],
  },
  {
    title: "Please note",
    points: [
      "The weather now and the forecast come from Tomorrow.io. Rain, river flow and the flood risk level are from the last recorded day, which can be days behind today. None of it is an official flood warning.",
      "For official warnings, see pagasa.dost.gov.ph and ndrrmc.gov.ph. In an emergency, call 911 and your local DRRMO.",
    ],
  },
]

type HelpDialogProps = {
  open: boolean
  onClose: () => void
  /** Where keyboard focus goes when the guide closes (the button that led to it is gone by then). */
  returnFocusTo?: React.RefObject<HTMLElement | null>
}

/**
 * A short guide to using the app, opened from the floating menu.
 *
 * It has its own solid background, so it stays readable whatever the glass slider is set to, and it sits below the
 * hand cursor, so the laser pointer still works on it. For keyboard users, focus starts on the Close button, Tab stays
 * inside the guide, Esc closes it, and focus goes back to the menu button.
 */
export function HelpDialog({ open, onClose, returnFocusTo }: HelpDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  // The newest onClose, without making the effect below run again each time the parent redraws (that would move focus).
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const returnTo = returnFocusTo?.current // the menu button: it stays on the page while the guide is open
    closeButtonRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== "Tab") return

      // Keep Tab inside the guide: from the last control go to the first, and back.
      const controls = dialogRef.current?.querySelectorAll<HTMLElement>("button, a[href]")
      if (!controls || controls.length === 0) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      returnTo?.focus()
    }
  }, [open, returnFocusTo])

  if (!open) return null

  return (
    <>
      {/* Dimmed backdrop: tapping it closes the guide. */}
      <div className="fixed inset-0 z-[54] bg-black/40" aria-hidden="true" onPointerDown={onClose} />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        className="help-dialog fixed top-1/2 left-1/2 z-[55] max-h-[85svh] w-[min(92vw,34rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-5 sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="help-title" className="text-lg font-semibold">
              Help and access guide
            </h2>
            <p className="help-muted mt-1 text-sm">How to move around and adjust the app so it works for you.</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="help-close min-h-11 shrink-0 rounded-full px-4 text-sm font-medium"
          >
            Close
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          {SECTIONS.map((section) => (
            <section key={section.title} aria-label={section.title}>
              <h3 className="text-sm font-semibold">{section.title}</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed">
                {section.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </>
  )
}
