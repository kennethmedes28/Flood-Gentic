"use client"

import { useEffect, useState } from "react"

import { GlassPanel } from "@/components/ar/GlassPanel"

type HudTopBarProps = {
  /** Place name shown on the left. */
  place: string
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
export function HudTopBar({ place, temperatureC, isSample = false }: HudTopBarProps) {
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
    <GlassPanel className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
      <span className="font-semibold">{place}</span>
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
    </GlassPanel>
  )
}
