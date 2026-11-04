"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import { HelpDialog } from "@/components/shell/HelpDialog"
import { MenuHint, useMenuHint } from "@/components/shell/MenuHint"
import { useHand, type Hand } from "@/context/HandContext"
import { useIconSize } from "@/context/IconSizeContext"
import { useLanguage } from "@/context/LanguageContext"
import { useLook, type Look } from "@/context/LookContext"
import { useTextSize, type TextSize } from "@/context/TextSizeContext"
import { useDraggable } from "@/hooks/useDraggable"
import { LANGUAGES, LANGUAGE_NAMES, type Language } from "@/i18n/define"
import type { MessageKey } from "@/i18n/messages"

/** The menu is as wide as this many rem, so it grows with the text size; it never gets wider than the screen. */
const MENU_WIDTH_REM = 16.25
/** Space kept free between the menu and the edge of the screen, and between the menu and the button, in pixels. */
const GAP = 8
/** The menu never gets shorter than this, so it stays usable on a very small screen (it then scrolls). */
const MIN_MENU_HEIGHT = 160

const HANDS: { value: Hand; label: MessageKey }[] = [
  { value: "left", label: "nav.left" },
  { value: "right", label: "nav.right" },
]

const SIZES: { value: TextSize; label: MessageKey }[] = [
  { value: "small", label: "nav.size.small" },
  { value: "default", label: "nav.size.default" },
  { value: "large", label: "nav.size.large" },
  { value: "xlarge", label: "nav.size.xlarge" },
]

const CURSOR_STATES: { value: "on" | "off"; label: MessageKey }[] = [
  { value: "on", label: "nav.on" },
  { value: "off", label: "nav.off" },
]

const LOOKS: { value: Look; label: MessageKey }[] = [
  { value: "default", label: "nav.themeDefault" },
  { value: "cyberpunk", label: "nav.themeCyberpunk" },
]

/**
 * Official flood hazard map (UP NOAH). Its server forbids being shown inside
 * another site (X-Frame-Options: SAMEORIGIN), so it opens in a new tab.
 */
const HAZARD_MAP_URL = "https://noah.up.edu.ph/know-your-hazards/flood"

const PAGES: { href: string; label: MessageKey }[] = [
  { href: "/", label: "nav.liveView" },
  { href: "/flood", label: "nav.floodLevel" },
  { href: "/analytics", label: "nav.analytics" },
  { href: "/satellite", label: "nav.satellite" },
  { href: "/evacuation", label: "nav.evacuation" },
  { href: "/assistant", label: "nav.assistant" },
  { href: "/contacts", label: "nav.contacts" },
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
  const { size: iconSize, setSize: setIconSize, pixels: buttonSize } = useIconSize()
  const { language, setLanguage, t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  const { position, handlers, onArrowKey } = useDraggable(buttonSize, () => toggleMenu())

  // First-time hint: an arrow and a short text pointing at this button. It is shown until the person opens the menu
  // or presses "Got it", and then never again (see MenuHint.tsx).
  const { showHint, dismissHint } = useMenuHint()

  function toggleMenu() {
    dismissHint() // opening the menu shows the person has found the button
    setOpen((current) => !current)
  }

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
  // The menu is sized in rem (so it grows with the text size) but never wider than the screen. Keep it inside the screen
  // horizontally, and keep it no taller than the free space on the side of the button it opens on, so that none of it is
  // pushed off the screen: a longer menu scrolls inside its box instead.
  const rootFontPx = open ? parseFloat(getComputedStyle(document.documentElement).fontSize) || 16 : 16
  const menuWidth = open ? Math.min(MENU_WIDTH_REM * rootFontPx, window.innerWidth - 2 * GAP) : 0
  const menuLeft = open ? Math.max(GAP, Math.min(position.x, window.innerWidth - menuWidth - GAP)) : 0
  const menuMaxHeight = open
    ? Math.max(
        MIN_MENU_HEIGHT,
        opensUpwards ? position.y - 2 * GAP : window.innerHeight - (position.y + buttonSize + GAP) - GAP
      )
    : 0

  return (
    <>
      {/* Invisible layer: tapping outside the menu closes it. */}
      {open && <div className="fixed inset-0 z-40" onPointerDown={() => setOpen(false)} />}

      <button
        ref={menuButton}
        type="button"
        className="fixed z-50 flex cursor-grab touch-none items-center select-none active:cursor-grabbing justify-center overflow-hidden rounded-full shadow-lg focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-white"
        style={{
          width: buttonSize,
          height: buttonSize,
          left: position.x,
          top: position.y,
        }}
        aria-label={t("nav.menuButton")}
        aria-haspopup="menu"
        aria-expanded={open}
        {...handlers}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            toggleMenu()
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
          className="glass-panel menu-scroll fixed z-50 flex flex-col overflow-y-auto overscroll-contain p-2"
          style={{
            width: menuWidth,
            maxHeight: menuMaxHeight,
            left: menuLeft,
            ...(opensUpwards
              ? { bottom: window.innerHeight - position.y + GAP }
              : { top: position.y + buttonSize + GAP }),
          }}
          role="menu"
          aria-label={t("nav.pages")}
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
              {t(page.label)}
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
            {t("nav.hazardMap")}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M7 17L17 7M9 7h8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="sr-only">{t("nav.opensNewTab")}</span>
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
            {t("nav.help")}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
              <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* Settings. Picking an option keeps the menu open. */}
          <OptionRow label={t("nav.language")} options={LANGUAGES.map((value) => ({ value, label: LANGUAGE_NAMES[value] }))} value={language} onChange={(value: Language) => setLanguage(value)} />
          <OptionRow label={t("nav.theme")} options={LOOKS.map((o) => ({ value: o.value, label: t(o.label) }))} value={look} onChange={setLook} />
          <OptionRow label={t("nav.textSize")} options={SIZES.map((o) => ({ value: o.value, label: t(o.label) }))} value={textSize} onChange={setTextSize} twoColumns />
          <OptionRow label={t("nav.iconSize")} options={SIZES.map((o) => ({ value: o.value, label: t(o.label) }))} value={iconSize} onChange={setIconSize} twoColumns />
          <OptionRow
            label={t("nav.handCursor")}
            options={CURSOR_STATES.map((o) => ({ value: o.value, label: t(o.label) }))}
            value={handEnabled ? "on" : "off"}
            onChange={(state) => setHandEnabled(state === "on")}
          />
          {handEnabled && <OptionRow label={t("nav.cursorHand")} options={HANDS.map((o) => ({ value: o.value, label: t(o.label) }))} value={hand} onChange={setHand} />}
        </nav>
      )}

      {showHint && !open && (
        <MenuHint buttonX={position.x} buttonY={position.y} buttonSize={buttonSize} onDismiss={dismissHint} />
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
