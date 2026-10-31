"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"

import { useHand, type Hand } from "@/context/HandContext"
import { useDraggable } from "@/hooks/useDraggable"

const BUTTON_SIZE = 68
const MENU_WIDTH = 210

const HANDS: { value: Hand; label: string }[] = [
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
]

const PAGES = [
  { href: "/", label: "Live view" },
  { href: "/flood", label: "Flood level" },
  { href: "/evacuation", label: "Evacuation" },
  { href: "/assistant", label: "Assistant" },
  { href: "/contacts", label: "Contacts" },
]

/**
 * Round button the user can drag anywhere. A tap opens a glass menu of pages.
 * The menu opens above or below the button, whichever side has more room.
 */
export function FloatingNav() {
  const pathname = usePathname()
  const { hand, setHand } = useHand()
  const [open, setOpen] = useState(false)
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
          className="glass-panel fixed z-50 flex flex-col p-2"
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
              className="flex min-h-11 items-center rounded-full px-4 text-sm font-medium aria-[current=page]:bg-[#1d6fe8] aria-[current=page]:text-white aria-[current=page]:[text-shadow:none]"
            >
              {page.label}
            </Link>
          ))}

          {/* Setting: which hand is used as the cursor. The menu stays open. */}
          <div className="mt-1 border-t border-white/40 px-2 pt-2" role="group" aria-label="Cursor hand">
            <p className="mb-1 px-2 text-xs" style={{ color: "var(--glass-text-muted)" }}>
              Cursor hand
            </p>
            <div className="flex gap-1">
              {HANDS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={hand === option.value}
                  onClick={() => setHand(option.value)}
                  className="min-h-11 flex-1 rounded-full text-sm font-medium aria-checked:bg-[#1d6fe8] aria-checked:text-white aria-checked:[text-shadow:none]"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </nav>
      )}
    </>
  )
}
