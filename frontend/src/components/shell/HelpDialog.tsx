"use client"

import { useEffect, useRef } from "react"

import { useT } from "@/context/LanguageContext"
import type { MessageKey } from "@/i18n/messages"

/** The guide: a heading and a few short points for each part of the app (keys of the texts in src/i18n/messages/shell.ts). */
const SECTIONS: { title: MessageKey; points: MessageKey[] }[] = [
  { title: "help.vr.title", points: ["help.vr.1", "help.vr.2"] },
  { title: "help.around.title", points: ["help.around.1", "help.around.2", "help.around.3"] },
  { title: "help.see.title", points: ["help.see.1", "help.see.2", "help.see.3", "help.see.4", "help.see.5"] },
  { title: "help.hand.title", points: ["help.hand.1", "help.hand.2", "help.hand.3", "help.hand.4"] },
  { title: "help.resize.title", points: ["help.resize.1", "help.resize.2"] },
  { title: "help.motion.title", points: ["help.motion.1"] },
  { title: "help.note.title", points: ["help.note.1", "help.note.2", "help.note.3", "help.note.4"] },
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
  const t = useT()
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
              {t("help.title")}
            </h2>
            <p className="help-muted mt-1 text-sm">{t("help.subtitle")}</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="help-close min-h-11 shrink-0 rounded-full px-4 text-sm font-medium"
          >
            {t("help.close")}
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          {SECTIONS.map((section) => (
            <section key={section.title} aria-label={t(section.title)}>
              <h3 className="text-sm font-semibold">{t(section.title)}</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed">
                {section.points.map((point) => (
                  <li key={point}>{t(point)}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </>
  )
}
