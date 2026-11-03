"use client"

import { LoadingLabel, Skeleton } from "@/components/ui/Skeleton"
import { useCurrentCity } from "@/context/CurrentCityContext"
import { useDashboardData } from "@/context/DashboardDataContext"
import { useLanguage } from "@/context/LanguageContext"
import { describeFlow, riskLook } from "@/lib/risk"
import { useLiveWeather } from "@/context/LiveWeatherContext"
import { missingText, reasonText } from "@/lib/dashboard-api"
import { describeRain, recordedDayLabel } from "@/lib/rain-words"
import { describeWeatherCode } from "@/lib/weather-codes"

/** The big card at the top left: the last recorded weather and the flood risk of the current city, from the backend. */
export function TodayCard() {
  const { city } = useCurrentCity()
  const { t, locale } = useLanguage()
  const { status, cityData, error, reload } = useDashboardData()
  const live = cityData(city.key)
  const { status: streamStatus, forecastFor } = useLiveWeather()
  const now = forecastFor(city.key)?.now?.values

  if (status === "loading") {
    return (
      <section className="glass-accent order-1 flex flex-col justify-between rounded-[22px] p-6 shadow-lg" aria-label={t("today.label")}>
        <LoadingLabel>{t("today.loading")}</LoadingLabel>
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-3 h-14 w-28" />
        <Skeleton className="mt-6 h-8 w-48" />
      </section>
    )
  }

  if (!live) {
    return (
      <section className="glass-accent order-1 flex flex-col justify-between rounded-[22px] p-6 shadow-lg" aria-label={t("today.label")}>
        <p className="text-sm opacity-90">{t("today.heading", { city: city.name })}</p>
        <p className="mt-2 text-lg font-semibold" role="alert">
          {error ? t(error) : t("today.noData")}
        </p>
        <button type="button" onClick={reload} className="mt-4 min-h-11 self-start rounded-full bg-white/25 px-5 text-sm font-medium">
          {t("today.retry")}
        </button>
      </section>
    )
  }

  const risk = riskLook(live.risk)
  const rain = describeRain(live.rainMm)
  const rainText = t(rain.text)
  const mmText = live.rainMm !== null ? ` ${live.rainMm.toFixed(1)} mm` : ""
  const degrees = (value: number | null | undefined) => (value === null || value === undefined ? "–" : `${Math.round(value)}°`)
  const day = recordedDayLabel(live.dataDate, t, locale)

  // Right now (Tomorrow.io, streamed): shown when it has arrived; the recorded day is the fallback.
  const sky = describeWeatherCode(now?.weatherCode)
  const windKmh = now?.windSpeed === null || now?.windSpeed === undefined ? null : Math.round(now.windSpeed * 3.6) // m/s to km/h
  const liveNote =
    streamStatus === "live" ? t("today.live") : streamStatus === "connecting" ? t("today.connecting") : streamStatus === "reconnecting" ? t("today.reconnecting") : t("today.liveUnavailable")

  return (
    <section className="glass-accent order-1 flex flex-col justify-between rounded-[22px] p-6 shadow-lg" aria-label={t("today.label")}>
      <div>
        <p className="flex items-center justify-between gap-2 text-sm opacity-90">
          <span>{city.name} · {now ? t("today.now") : day}</span>
          {now && <span className="text-xs font-semibold">● {liveNote}</span>}
        </p>
        <p className="mt-2 text-6xl font-light tabular-nums">{now ? degrees(now.temperature) : degrees(live.highC)}</p>
        {now ? (
          <>
            <p className="mt-1 text-sm opacity-90">
              <span aria-hidden="true">{sky.icon} </span>
              {t("today.skyLine", { sky: t(sky.text), feels: degrees(now.temperatureApparent) })}
            </p>
            <p className="text-xs opacity-90">
              {t("today.chanceOfRain", { percent: now.precipitationProbability ?? "–" })}
              {windKmh !== null && ` · ${t("today.wind", { kmh: windKmh })}`}
              {now.humidity !== null && now.humidity !== undefined && ` · ${t("today.humidity", { percent: Math.round(now.humidity) })}`}
            </p>
            <p className="mt-1 text-xs opacity-90">
              <span aria-hidden="true">{rain.icon} </span>
              {t("today.recordedLine", { day, rain: rainText, mm: mmText, high: degrees(live.highC), low: degrees(live.lowC) })}
            </p>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm opacity-90">
              <span aria-hidden="true">{rain.icon} </span>
              {t("today.rainLine", { rain: rainText, mm: live.rainMm !== null ? ` (${live.rainMm.toFixed(1)} mm)` : "", high: degrees(live.highC), low: degrees(live.lowC) })}
            </p>
            {live.windKmh !== null && <p className="text-xs opacity-90">{t("today.windUpTo", { kmh: Math.round(live.windKmh) })}</p>}
            <p className="text-xs opacity-90">{liveNote}</p>
          </>
        )}
      </div>
      <div className="mt-6">
        <p className="text-2xl font-semibold">
          <span aria-hidden="true">{risk.symbol} </span>
          {live.risk ? t("risk.floodRisk", { level: t(risk.label) }) : t("risk.unavailable")}
        </p>
        <p className="text-sm opacity-90">{t("risk.riverFlow", { flow: describeFlow(live.riverFlowM3s, t) })}</p>
        {live.riskReasonCodes.length > 0 && <p className="mt-1 text-xs opacity-90">{reasonText(live.riskReasonCodes[0], live.riskReasons[0], t)}</p>}
        {live.missing.length > 0 && <p className="mt-1 text-xs font-semibold">{t("risk.missing", { items: live.missing.map((item) => missingText(item, t)).join(", ") })}</p>}
      </div>
    </section>
  )
}
