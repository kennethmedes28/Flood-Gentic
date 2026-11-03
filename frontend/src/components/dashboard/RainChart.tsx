"use client"

import { useState } from "react"

import { GlassPanel } from "@/components/ui/GlassPanel"
import { LoadingLabel, Skeleton } from "@/components/ui/Skeleton"
import { ToggleGroup } from "@/components/ui/ToggleGroup"
import { useCurrentCity } from "@/context/CurrentCityContext"
import { useDashboardData } from "@/context/DashboardDataContext"
import { useLiveWeather } from "@/context/LiveWeatherContext"
import { manilaHour } from "@/lib/rain-words"
import { useLanguage } from "@/context/LanguageContext"

const HOURS_SHOWN = 12

type View = "hours" | "days"

/** One bar of the chart. */
type Bar = { key: string; mm: number; label: string }

/** The next hours of rain from the live weather: only hours that have not started yet. */
function hourBars(hourly: { time: string; values: Record<string, number | null> }[]): Bar[] {
  const now = Date.now()
  return hourly
    .filter((entry) => new Date(entry.time).getTime() > now)
    .slice(0, HOURS_SHOWN)
    .map((entry) => ({ key: entry.time, mm: entry.values.rainIntensity ?? 0, label: `${manilaHour(entry.time)}h` }))
}

/** The rain of each recorded day. */
function dayBars(days: { date: string; rainMm: number | null }[]): Bar[] {
  return days.map((day) => ({ key: day.date, mm: day.rainMm ?? 0, label: String(Number(day.date.slice(8))) }))
}

/**
 * The rain of the current city: the next 12 hours (live weather, Tomorrow.io) or the last 14 recorded days.
 * Without live weather only the recorded days are shown. Pass loading to force the placeholder.
 */
export function RainChart({ loading = false }: { loading?: boolean }) {
  const { city } = useCurrentCity()
  const { status, cityData } = useDashboardData()
  const { forecastFor } = useLiveWeather()
  const { t } = useLanguage()
  const [chosen, setChosen] = useState<View>("hours")

  const hours = hourBars(forecastFor(city.key)?.hourly ?? [])
  const days = dayBars(cityData(city.key)?.recent ?? [])
  const view: View = hours.length > 0 ? chosen : "days"
  const bars = view === "hours" ? hours : days

  if (loading || (status === "loading" && hours.length === 0)) {
    return (
      <GlassPanel className="p-5">
        <LoadingLabel>{t("rainChart.loading")}</LoadingLabel>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-4 h-40 w-full" />
      </GlassPanel>
    )
  }

  const maxRain = Math.max(0, ...bars.map((bar) => bar.mm))
  /** Bars are scaled to the biggest value; with no rain at all they stay flat rather than dividing by zero. */
  const barHeight = (mm: number) => (maxRain > 0 ? (mm / maxRain) * 100 : 0)
  const title = view === "hours" ? t("rainChart.titleHours") : t("rainChart.titleDays")
  const unit = view === "hours" ? t("rainChart.unitHours") : t("rainChart.unitDays")

  return (
    <GlassPanel className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">
            {title} · {city.name}
          </h2>
          <p className="text-xs" style={{ color: "var(--glass-text-muted)" }}>
            {unit}
          </p>
        </div>
        {hours.length > 0 && (
          <ToggleGroup
            label={t("rainChart.range")}
            value={view}
            onChange={setChosen}
            options={[
              { value: "hours", text: t("rainChart.next12") },
              { value: "days", text: t("rainChart.last14") },
            ]}
          />
        )}
      </div>

      {bars.length === 0 ? (
        <p className="mt-3 text-sm" style={{ color: "var(--glass-text-muted)" }}>
          {t("rainChart.none")}
        </p>
      ) : (
        <div
          className="mt-4 flex h-40 items-end gap-1.5"
          role="img"
          aria-label={maxRain > 0 ? t("rainChart.peaking", { title, mm: maxRain.toFixed(1) }) : t("rainChart.noRain", { title })}
        >
          {bars.map((bar) => (
            <div key={bar.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[9px] tabular-nums">{bar.mm.toFixed(1)}</span>
              <div className="min-h-px w-full rounded-t-md" style={{ height: `${barHeight(bar.mm)}%`, background: "var(--glass-accent)" }} />
              <span className="text-[10px] tabular-nums" style={{ color: "var(--glass-text-muted)" }}>
                {bar.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </GlassPanel>
  )
}
