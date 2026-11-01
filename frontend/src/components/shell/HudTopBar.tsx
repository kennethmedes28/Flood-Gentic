"use client"

import { useEffect, useState } from "react"

import { GlassPanel } from "@/components/ui/GlassPanel"

type HudTopBarProps = {
  /** Place name shown on the left. */
  place: string
  /** A few words under or beside the place, such as where it came from. */
  placeNote?: string
  /** Buttons or links shown next to the place (for example "Use my location"). */
  action?: React.ReactNode
  /** A sentence about what just happened (for example a location error), announced to screen readers. */
  message?: string
  /** Temperature in Celsius. Pass null while no real value is available. */
  temperatureC: number | null
  /** True when the temperature is placeholder data, so it gets labelled. */
  isSample?: boolean
}

/** Format the current time as e.g. "3:45 PM". */
function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })
}

/** HUD bar showing the place, the local time and the temperature. */
export function HudTopBar({ place, placeNote, action, message, temperatureC, isSample = false }: HudTopBarProps) {
  // Start empty so the server and browser render the same thing,
  // then fill in the real time after the page has loaded.
  const [time, setTime] = useState("")

  useEffect(() => {
    const update = () => setTime(formatTime(new Date()))
    update()
    const timer = window.setInterval(update, 10_000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <GlassPanel className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-2 font-semibold">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            <circle cx="12" cy="9.5" r="2.5" fill="currentColor" />
          </svg>
          {place}
        </span>
        {placeNote && (
          <span className="text-xs" style={{ color: "var(--glass-text-muted)" }}>
            {placeNote}
          </span>
        )}
        {action}
      </div>
      <div className="flex items-center gap-4">
        <time className="tabular-nums">{time || "--:--"}</time>
        <span className="tabular-nums">
          {temperatureC === null ? "--°C" : `${temperatureC}°C`}
          {isSample && (
            <span className="ml-1 text-xs" style={{ color: "var(--glass-text-muted)" }}>
              (sample)
            </span>
          )}
        </span>
      </div>
      {message && (
        <p className="w-full text-xs" role="status" style={{ color: "var(--glass-text-muted)" }}>
          {message}
        </p>
      )}
    </GlassPanel>
  )
}
