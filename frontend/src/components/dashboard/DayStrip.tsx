"use client"

import { GlassPanel } from "@/components/ui/GlassPanel"
import { LoadingLabel, Skeleton } from "@/components/ui/Skeleton"
import { useCurrentCity } from "@/context/CurrentCityContext"
import { useDashboardData } from "@/context/DashboardDataContext"
import { describeRain, shortDate, weekday } from "@/lib/rain-words"

const LOADING_DAYS = 7

/** The last 7 recorded days of the current city, from the backend. There is no forecast in the data yet. Pass loading to force the placeholder. */
export function DayStrip({ loading = false }: { loading?: boolean }) {
  const { city } = useCurrentCity()
  const { status, cityData } = useDashboardData()
  const days = (cityData(city.key)?.recent ?? []).slice(-LOADING_DAYS)

  if (loading || status === "loading") {
    return (
      <GlassPanel className="p-5">
        <LoadingLabel>Loading forecast</LoadingLabel>
        <Skeleton className="mb-3 h-5 w-32" />
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {Array.from({ length: LOADING_DAYS }, (_, index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
      </GlassPanel>
    )
  }

  if (days.length === 0) {
    return (
      <GlassPanel className="p-5">
        <h2 className="mb-1 font-semibold">Last 7 days</h2>
        <p className="text-sm" style={{ color: "var(--glass-text-muted)" }}>
          No recorded days are available for this city.
        </p>
      </GlassPanel>
    )
  }

  return (
    <GlassPanel className="p-5">
      <h2 className="font-semibold">Last 7 days · {city.name}</h2>
      <p className="mb-3 text-xs" style={{ color: "var(--glass-text-muted)" }}>
        Recorded weather, not a forecast
      </p>
      <ul className="grid grid-cols-4 gap-2 sm:grid-cols-7">
        {days.map((day) => {
          const weather = describeRain(day.rainMm)
          return (
            <li key={day.date} className="flex flex-col items-center gap-1 rounded-2xl py-2 text-center text-sm">
              <span className="font-medium">{weekday(day.date)}</span>
              <span className="text-xs" style={{ color: "var(--glass-text-muted)" }}>
                {shortDate(day.date)}
              </span>
              <span className="text-2xl" role="img" aria-label={weather.text}>
                {weather.icon}
              </span>
              <span className="tabular-nums">
                {day.highC === null ? "–" : `${Math.round(day.highC)}°`}{" "}
                <span style={{ color: "var(--glass-text-muted)" }}>{day.lowC === null ? "–" : `${Math.round(day.lowC)}°`}</span>
              </span>
              <span className="text-xs tabular-nums" style={{ color: "var(--glass-text-muted)" }}>
                {day.rainMm === null ? "–" : `${day.rainMm.toFixed(1)} mm`}
              </span>
            </li>
          )
        })}
      </ul>
    </GlassPanel>
  )
}
