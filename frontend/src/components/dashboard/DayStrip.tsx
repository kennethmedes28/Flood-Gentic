"use client"

import { useState } from "react"

import { GlassPanel } from "@/components/ui/GlassPanel"
import { LoadingLabel, Skeleton } from "@/components/ui/Skeleton"
import { ToggleGroup } from "@/components/ui/ToggleGroup"
import { useCurrentCity } from "@/context/CurrentCityContext"
import { useDashboardData } from "@/context/DashboardDataContext"
import { useLiveWeather } from "@/context/LiveWeatherContext"
import { describeRain, manilaDay, shortDate, weekday } from "@/lib/rain-words"
import { describeWeatherCode } from "@/lib/weather-codes"
import { useLanguage } from "@/context/LanguageContext"
import type { MessageKey } from "@/i18n/messages"

const DAYS_SHOWN = 7

type View = "forecast" | "recorded"

/** One column of the strip, the same whether it comes from the forecast or from recorded days. */
type DayItem = {
  date: string
  icon: string
  iconText: MessageKey
  highC: number | null
  lowC: number | null
  /** Shown under the temperatures, for example "70% rain" or "6.8 mm". */
  detail: string
}

const degrees = (value: number | null) => (value === null ? "–" : `${Math.round(value)}°`)

/** The next days of the forecast, from the live weather (Tomorrow.io, stored once a day). */
function forecastItems(daily: { time: string; values: Record<string, number | null> }[], t: (key: MessageKey, params?: Record<string, string | number>) => string): DayItem[] {
  return daily.slice(0, DAYS_SHOWN).map(({ time, values }) => {
    const look = describeWeatherCode(values.weatherCodeMax)
    const chance = values.precipitationProbabilityMax
    return {
      date: manilaDay(time),
      icon: look.icon,
      iconText: look.text,
      highC: values.temperatureMax ?? null,
      lowC: values.temperatureMin ?? null,
      detail: chance === null || chance === undefined ? "–" : t("strip.rainChance", { percent: Math.round(chance) }),
    }
  })
}

/** The last recorded days, from the project dataset. */
function recordedItems(days: { date: string; rainMm: number | null; highC: number | null; lowC: number | null }[]): DayItem[] {
  return days.slice(-DAYS_SHOWN).map((day) => {
    const look = describeRain(day.rainMm)
    return {
      date: day.date,
      icon: look.icon,
      iconText: look.text,
      highC: day.highC,
      lowC: day.lowC,
      detail: day.rainMm === null ? "–" : `${day.rainMm.toFixed(1)} mm`,
    }
  })
}

/**
 * The days of the current city: the forecast for the coming days (live weather) or the last recorded days.
 * Without a forecast (for example the live weather is unavailable) only the recorded days are shown.
 * Pass loading to force the placeholder.
 */
export function DayStrip({ loading = false }: { loading?: boolean }) {
  const { city } = useCurrentCity()
  const { status, cityData } = useDashboardData()
  const { forecastFor } = useLiveWeather()
  const { t, locale } = useLanguage()
  const [chosen, setChosen] = useState<View>("forecast")

  const forecast = forecastItems(forecastFor(city.key)?.daily ?? [], t)
  const recorded = recordedItems(cityData(city.key)?.recent ?? [])
  const view: View = forecast.length > 0 ? chosen : "recorded"
  const days = view === "forecast" ? forecast : recorded

  if (loading || (status === "loading" && forecast.length === 0)) {
    return (
      <GlassPanel className="p-5">
        <LoadingLabel>{t("strip.loading")}</LoadingLabel>
        <Skeleton className="mb-3 h-5 w-32" />
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {Array.from({ length: DAYS_SHOWN }, (_, index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
      </GlassPanel>
    )
  }

  return (
    <GlassPanel className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">{view === "forecast" ? t("strip.forecast") : t("strip.last7")} · {city.name}</h2>
          <p className="text-xs" style={{ color: "var(--glass-text-muted)" }}>
            {view === "forecast" ? t("strip.forecastNote") : t("strip.recordedNote")}
          </p>
        </div>
        {forecast.length > 0 && (
          <ToggleGroup
            label={t("strip.daysToShow")}
            value={view}
            onChange={setChosen}
            options={[
              { value: "forecast", text: t("strip.forecast") },
              { value: "recorded", text: t("strip.last7") },
            ]}
          />
        )}
      </div>

      {days.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--glass-text-muted)" }}>
          {t("strip.none")}
        </p>
      ) : (
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {days.map((day) => (
            <li key={day.date} className="flex flex-col items-center gap-1 rounded-2xl py-2 text-center text-sm">
              <span className="font-medium">{weekday(day.date, locale)}</span>
              <span className="text-xs" style={{ color: "var(--glass-text-muted)" }}>
                {shortDate(day.date, locale)}
              </span>
              <span className="text-2xl" role="img" aria-label={t(day.iconText)}>
                {day.icon}
              </span>
              <span className="tabular-nums">
                {degrees(day.highC)} <span style={{ color: "var(--glass-text-muted)" }}>{degrees(day.lowC)}</span>
              </span>
              <span className="text-xs tabular-nums" style={{ color: "var(--glass-text-muted)" }}>
                {day.detail}
              </span>
            </li>
          ))}
        </ul>
      )}
    </GlassPanel>
  )
}
