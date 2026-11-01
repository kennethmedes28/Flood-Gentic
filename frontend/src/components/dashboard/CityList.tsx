"use client"

import { useState } from "react"

import { GlassPanel } from "@/components/ui/GlassPanel"
import { LoadingLabel, Skeleton } from "@/components/ui/Skeleton"
import { useCurrentCity } from "@/context/CurrentCityContext"
import { useDashboardData } from "@/context/DashboardDataContext"
import { CITIES, type CityReading } from "@/data/dashboard-cities"
import { distanceKm } from "@/lib/geo"
import { describeFlow, riskLook } from "@/lib/risk"

/** How many cities are listed until the user asks for all of them. */
const COLLAPSED_COUNT = 6

/** The current city first, then the others from the nearest to the farthest. */
function citiesNearestFirst(current: CityReading): CityReading[] {
  const others = CITIES.filter((city) => city.name !== current.name)
  others.sort((a, b) => distanceKm(current.lat, current.lng, a.lat, a.lng) - distanceKm(current.lat, current.lng, b.lat, b.lng))
  return [current, ...others]
}

/**
 * Pass loading while the city readings are still being fetched.
 * The current city is listed first and marked "Current location"; the others follow, nearest first.
 * Only the first few are shown until "Show all" is pressed.
 */
export function CityList({ loading = false }: { loading?: boolean }) {
  const { city: current } = useCurrentCity()
  const { status, cityData } = useDashboardData()
  const [showAll, setShowAll] = useState(false)

  if (loading || status === "loading") {
    return (
      <GlassPanel className="flex-1 p-5">
        <LoadingLabel>Loading nearby areas</LoadingLabel>
        <Skeleton className="mb-3 h-5 w-32" />
        <div className="flex flex-col gap-2">
          {CITIES.slice(0, COLLAPSED_COUNT).map((city) => (
            <Skeleton key={city.name} className="h-11" />
          ))}
        </div>
      </GlassPanel>
    )
  }

  return (
    <GlassPanel className="flex-1 p-5">
      <h2 className="mb-3 font-semibold">Nearby areas</h2>
      <ul className="flex flex-col gap-2">
        {citiesNearestFirst(current)
          .slice(0, showAll ? undefined : COLLAPSED_COUNT)
          .map((city) => {
          const live = cityData(city.key)
          const risk = riskLook(live?.risk)
          const isCurrent = city.name === current.name
          return (
            <li
              key={city.name}
              aria-current={isCurrent ? "location" : undefined}
              className={`flex min-h-11 items-center justify-between gap-3 text-sm ${isCurrent ? "rounded-xl bg-white/30 px-3 py-2 ring-1 ring-[var(--glass-accent)]" : ""}`}
            >
              <span className="flex flex-col">
                <span className="flex items-center gap-1.5 font-medium">
                  {isCurrent && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                      <circle cx="12" cy="9.5" r="2.5" fill="currentColor" />
                    </svg>
                  )}
                  {city.name}
                </span>
                {isCurrent && (
                  <span className="text-xs font-semibold" style={{ color: "var(--glass-accent)" }}>
                    Current location
                  </span>
                )}
              </span>
              <span className="flex items-center gap-3">
                <span className="tabular-nums" style={{ color: "var(--glass-text-muted)" }}>
                  {describeFlow(live?.riverFlowM3s)}
                </span>
                <span
                  className="flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium text-white"
                  style={{ background: risk.color }}
                >
                  <span aria-hidden="true">{risk.symbol}</span>
                  {risk.label}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
      <button
        type="button"
        onClick={() => setShowAll((value) => !value)}
        aria-expanded={showAll}
        className="mt-3 min-h-11 rounded-full px-4 text-sm font-medium"
      >
        {showAll ? "Show fewer" : `Show all ${CITIES.length} cities`}
      </button>
    </GlassPanel>
  )
}
