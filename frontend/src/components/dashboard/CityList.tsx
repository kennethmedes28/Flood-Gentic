"use client"

import { useState } from "react"

import { GlassPanel } from "@/components/ui/GlassPanel"
import { LoadingLabel, Skeleton } from "@/components/ui/Skeleton"
import { useCurrentCity } from "@/context/CurrentCityContext"
import { useDashboardData } from "@/context/DashboardDataContext"
import { CITIES, type CityReading } from "@/data/dashboard-cities"
import { describeFlowChange } from "@/lib/flood-levels"
import { distanceKm } from "@/lib/geo"
import { shortDate } from "@/lib/rain-words"
import type { LiveCity } from "@/lib/dashboard-api"
import { describeFlow, riskLook } from "@/lib/risk"

/** How many cities are listed until the user asks for all of them. */
const COLLAPSED_COUNT = 6

/** The current city first, then the others from the nearest to the farthest. */
function citiesNearestFirst(current: CityReading): CityReading[] {
  const others = CITIES.filter((city) => city.name !== current.name)
  others.sort((a, b) => distanceKm(current.lat, current.lng, a.lat, a.lng) - distanceKm(current.lat, current.lng, b.lat, b.lng))
  return [current, ...others]
}

/** How many recorded days the flow is compared with. */
const COMPARE_DAYS = 7

/** The lowest and highest river flow of the last 7 recorded days, or null when there are no readings. */
function flowRange(live: LiveCity): { low: number; high: number } | null {
  const flows = live.recent.slice(-COMPARE_DAYS).flatMap((day) => (day.riverFlowM3s === null ? [] : [day.riverFlowM3s]))
  return flows.length === 0 ? null : { low: Math.min(...flows), high: Math.max(...flows) }
}

/** One short line under a city: how its river flow changed since the day before, and the range over the last 7 days. */
function flowDetail(live: LiveCity | undefined): string {
  if (!live || live.riverFlowM3s === null) return "No river data for this city"
  const change = describeFlowChange(live.recent.at(-2)?.riverFlowM3s, live.riverFlowM3s)
  const range = flowRange(live)
  return range ? `${change.text} · last 7 days ${range.low.toFixed(1)}–${range.high.toFixed(1)}` : change.text
}

/** The rain (mm) of the last few recorded days added up, or null when none of them has a reading. */
function recentRainMm(live: LiveCity, days: number): number | null {
  const readings = live.recent.slice(-days).flatMap((day) => (day.rainMm === null ? [] : [day.rainMm]))
  return readings.length === 0 ? null : readings.reduce((sum, mm) => sum + mm, 0)
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
      <h2 className="font-semibold">Nearby areas</h2>
      <p className="mb-3 text-xs" style={{ color: "var(--glass-text-muted)" }}>
        River flow in m³/s, with the flood risk level
      </p>
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
              <span className="flex min-w-0 flex-col">
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
                <span className="text-xs" style={{ color: "var(--glass-text-muted)" }}>
                  {flowDetail(live)}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="whitespace-nowrap tabular-nums" style={{ color: "var(--glass-text-muted)" }}>
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

      <FlowExplanation cityName={current.name} live={cityData(current.key)} />
    </GlassPanel>
  )
}

/**
 * "Why is the flow 4.6 m³/s?" for the current city: what the number is, where it comes from, and the recorded facts
 * around it (the day before, how unusual it is, the rain). It says what the data shows, not what caused it.
 */
function FlowExplanation({ cityName, live }: { cityName: string; live: LiveCity | undefined }) {
  if (!live || live.riverFlowM3s === null || !live.dataDate) return null

  const flow = live.riverFlowM3s.toFixed(1)
  const day = shortDate(live.dataDate)
  const yesterday = live.recent.at(-2)?.riverFlowM3s
  const change = describeFlowChange(yesterday, live.riverFlowM3s)
  const range = flowRange(live)
  const rainToday = live.rainMm
  const rainThreeDays = recentRainMm(live, 3)

  return (
    <details className="mt-3 text-sm">
      <summary className="min-h-11 cursor-pointer py-2 font-medium">Why is the flow {flow} m³/s in {cityName}?</summary>
      <div className="space-y-2 pb-1" style={{ color: "var(--glass-text-muted)" }}>
        <p>
          <strong style={{ color: "inherit" }}>What it is:</strong> the river flow is how much water passes a point each second, in cubic
          metres. It is an estimate from a river model for {cityName}, not a reading from a gauge, and it is not a water height.
        </p>
        <p>
          <strong style={{ color: "inherit" }}>What the data shows:</strong> on {day} the flow was {flow} m³/s.{" "}
          {yesterday !== null && yesterday !== undefined && `The day before it was ${yesterday.toFixed(1)} m³/s (${change.text.replace(" since the day before", "").toLowerCase()}). `}
          {range && `Over the last ${COMPARE_DAYS} recorded days it ranged from ${range.low.toFixed(1)} to ${range.high.toFixed(1)} m³/s.`}
        </p>
        {(rainToday !== null || rainThreeDays !== null) && (
          <p>
            <strong style={{ color: "inherit" }}>Rain:</strong>{" "}
            {rainToday !== null && `${rainToday.toFixed(1)} mm fell on ${day}`}
            {rainThreeDays !== null && `, ${rainThreeDays.toFixed(1)} mm over the last 3 recorded days`}. Rain upstream raises a river with a
            delay of a day or more, so the flow also reflects the days before, not only the last one.
          </p>
        )}
        <p>
          The risk level combines this flow with the rain and how wet the ground is. It does not use the forecast.
        </p>
      </div>
    </details>
  )
}
