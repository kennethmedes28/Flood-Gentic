"use client"

import { GlassPanel } from "@/components/ui/GlassPanel"
import { LoadingLabel, Skeleton } from "@/components/ui/Skeleton"
import { useCurrentCity } from "@/context/CurrentCityContext"
import { useDashboardData } from "@/context/DashboardDataContext"

/** The rain of each of the last 14 recorded days in the current city, from the backend. Pass loading to force the placeholder. */
export function RainChart({ loading = false }: { loading?: boolean }) {
  const { city } = useCurrentCity()
  const { status, cityData } = useDashboardData()
  const days = cityData(city.key)?.recent ?? []

  if (loading || status === "loading") {
    return (
      <GlassPanel className="p-5">
        <LoadingLabel>Loading rainfall</LoadingLabel>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-4 h-40 w-full" />
      </GlassPanel>
    )
  }

  if (days.length === 0) {
    return (
      <GlassPanel className="p-5">
        <h2 className="font-semibold">Rainfall, last 14 days</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--glass-text-muted)" }}>
          No recorded rain is available for this city.
        </p>
      </GlassPanel>
    )
  }

  const maxRain = Math.max(...days.map((day) => day.rainMm ?? 0))
  /** Bars are scaled to the biggest value; with no rain at all they stay flat rather than dividing by zero. */
  const barHeight = (mm: number) => (maxRain > 0 ? (mm / maxRain) * 100 : 0)

  return (
    <GlassPanel className="p-5">
      <h2 className="font-semibold">Rainfall, last 14 days · {city.name}</h2>
      <p className="text-xs" style={{ color: "var(--glass-text-muted)" }}>
        Millimetres per day (recorded)
      </p>

      <div
        className="mt-4 flex h-40 items-end gap-1.5"
        role="img"
        aria-label={maxRain > 0 ? `Daily rain peaking at ${maxRain.toFixed(1)} millimetres` : "No rain recorded in the last 14 days"}
      >
        {days.map((day, index) => (
          <div key={index} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[9px] tabular-nums">{day.rainMm === null ? "–" : day.rainMm.toFixed(1)}</span>
            <div
              className="w-full min-h-px rounded-t-md"
              style={{ height: `${barHeight(day.rainMm ?? 0)}%`, background: "var(--glass-accent)" }}
            />
            <span className="text-[10px] tabular-nums" style={{ color: "var(--glass-text-muted)" }}>
              {new Date(`${day.date}T12:00:00+08:00`).getDate()}
            </span>
          </div>
        ))}
      </div>
    </GlassPanel>
  )
}
