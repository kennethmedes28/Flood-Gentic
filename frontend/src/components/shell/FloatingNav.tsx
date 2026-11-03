"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import { HelpDialog } from "@/components/shell/HelpDialog"
import { useHand, type Hand } from "@/context/HandContext"
import { useLook, type Look } from "@/context/LookContext"
import { useTextSize, type TextSize } from "@/context/TextSizeContext"
import { useDraggable } from "@/hooks/useDraggable"

const BUTTON_SIZE = 68
const MENU_WIDTH = 260

const HANDS: { value: Hand; label: string }[] = [
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
]

const TEXT_SIZES: { value: TextSize; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "default", label: "Default" },
  { value: "large", label: "Large" },
  { value: "xlarge", label: "Extra large" },
]

const CURSOR_STATES: { value: "on" | "off"; label: string }[] = [
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
]

const LOOKS: { value: Look; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "cyberpunk", label: "Cyberpunk" },
]

/**
 * Official flood hazard map (UP NOAH). Its server forbids being shown inside
 * another site (X-Frame-Options: SAMEORIGIN), so it opens in a new tab.
 */
const HAZARD_MAP_URL = "https://noah.up.edu.ph/know-your-hazards/flood"

const PAGES = [
  { href: "/", label: "Live view" },
  { href: "/flood", label: "Flood level" },
  { href: "/analytics", label: "Macro Weather Analytics" },
  { href: "/satellite", label: "Live PAGASA Satellite View" },
  { href: "/evacuation", label: "Evacuation" },
  { href: "/assistant", label: "AI Agent Flood Assistant" },
  { href: "/contacts", label: "Contacts" },
]

/**
 * Round button the user can drag anywhere. A tap opens a glass menu of pages.
 * The menu opens above or below the button, whichever side has more room.
 */
export function FloatingNav() {
  const pathname = usePathname()
  const { hand, setHand, enabled: handEnabled, setEnabled: setHandEnabled } = useHand()
  const { look, setLook } = useLook()
  const { size: textSize, setSize: setTextSize } = useTextSize()
  const [open, setOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  const { position, handlers, onArrowKey } = useDraggable(BUTTON_SIZE, () =>
    setOpen((current) => !current)
  )

  // Close the menu with Escape.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open])

  // The menu only exists after a tap, so the window size is safe to read here
  // (this component is also rendered on the server, where there is no window).
  const opensUpwards = open && position.y > window.innerHeight / 2
  // Keep the menu inside the screen horizontally.
  const menuLeft = open ? Math.min(position.x, window.innerWidth - MENU_WIDTH - 8) : 0

  return (
    <>
      {/* Invisible layer: tapping outside the menu closes it. */}
      {open && <div className="fixed inset-0 z-40" onPointerDown={() => setOpen(false)} />}

      <button
        ref={menuButton}
        type="button"
        className="fixed z-50 flex cursor-grab touch-none items-center select-none active:cursor-grabbing justify-center overflow-hidden rounded-full shadow-lg focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-white"
        style={{
          width: BUTTON_SIZE,
          height: BUTTON_SIZE,
          left: position.x,
          top: position.y,
        }}
        aria-label="Navigation menu"
        aria-haspopup="menu"
        aria-expanded={open}
        {...handlers}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            setOpen((current) => !current)
          } else if (onArrowKey(event.key)) {
            event.preventDefault()
          }
        }}
      >
        {/* Plain <img>: it is a small local SVG, and dragging must not start an image drag. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/flood_gentic_logo.svg"
          alt=""
          draggable={false}
          className="pointer-events-none h-full w-full object-cover"
        />
      </button>

      {open && (
        <nav
          className="glass-panel fixed z-50 flex max-h-[calc(100svh-1rem)] flex-col overflow-y-auto p-2"
          style={{
            width: MENU_WIDTH,
            left: menuLeft,
            ...(opensUpwards
              ? { bottom: window.innerHeight - position.y + 8 }
              : { top: position.y + BUTTON_SIZE + 8 }),
          }}
          role="menu"
          aria-label="Pages"
        >
          {PAGES.map((page) => (
            <Link
              key={page.href}
              href={page.href}
              role="menuitem"
              aria-current={pathname === page.href ? "page" : undefined}
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center rounded-full px-4 text-sm font-medium aria-[current=page]:bg-[var(--glass-accent)] aria-[current=page]:text-white aria-[current=page]:[text-shadow:none]"
            >
              {page.label}
            </Link>
          ))}

          <a
            href={HAZARD_MAP_URL}
            target="_blank"
            rel="noopener noreferrer"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex min-h-11 items-center justify-between rounded-full px-4 text-sm font-medium"
          >
            Hazard map
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M7 17L17 7M9 7h8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="sr-only">(opens in a new tab)</span>
          </a>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              setHelpOpen(true)
            }}
            className="flex min-h-11 items-center justify-between rounded-full px-4 text-sm font-medium"
          >
            Help and access guide
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
              <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* Settings. Picking an option keeps the menu open. */}
          <OptionRow label="Theme" options={LOOKS} value={look} onChange={setLook} />
          <OptionRow label="Text size" options={TEXT_SIZES} value={textSize} onChange={setTextSize} twoColumns />
          <OptionRow
            label="Hand cursor"
            options={CURSOR_STATES}
            value={handEnabled ? "on" : "off"}
            onChange={(state) => setHandEnabled(state === "on")}
          />
          {handEnabled && <OptionRow label="Cursor hand" options={HANDS} value={hand} onChange={setHand} />}
        </nav>
      )}

      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} returnFocusTo={menuButton} />
    </>
  )
}

/** A labelled row of pill buttons where exactly one option is selected. */
function OptionRow<T extends string>({
  label,
  options,
  value,
  onChange,
  twoColumns = false,
}: {
  label: string
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  /** Lay the options out in two columns, for rows with four options that would not fit on one line. */
  twoColumns?: boolean
}) {
  return (
    <div className="mt-1 border-t border-white/40 px-2 pt-2" role="group" aria-label={label}>
      <p className="mb-1 px-2 text-xs" style={{ color: "var(--glass-text-muted)" }}>
        {label}
      </p>
      <div className={twoColumns ? "grid grid-cols-2 gap-1" : "flex gap-1"}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="menuitemradio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className="min-h-11 flex-1 rounded-full text-sm font-medium aria-checked:bg-[var(--glass-accent)] aria-checked:text-white aria-checked:[text-shadow:none]"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
