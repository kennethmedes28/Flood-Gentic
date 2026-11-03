"use client"

import { LoadingLabel, Skeleton } from "@/components/ui/Skeleton"
import { useCurrentCity } from "@/context/CurrentCityContext"
import { useDashboardData } from "@/context/DashboardDataContext"
import { describeFlow, riskLook } from "@/lib/risk"
import { useLiveWeather } from "@/context/LiveWeatherContext"
import { describeRain, recordedDayLabel } from "@/lib/rain-words"
import { describeWeatherCode } from "@/lib/weather-codes"

/** The big card at the top left: the last recorded weather and the flood risk of the current city, from the backend. */
export function TodayCard() {
  const { city } = useCurrentCity()
  const { status, cityData, error, reload } = useDashboardData()
  const live = cityData(city.key)
  const { status: streamStatus, forecastFor } = useLiveWeather()
  const now = forecastFor(city.key)?.now?.values

  if (status === "loading") {
    return (
      <section className="glass-accent order-1 flex flex-col justify-between rounded-[22px] p-6 shadow-lg" aria-label="Today's flood risk">
        <LoadingLabel>Loading today&apos;s conditions</LoadingLabel>
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-3 h-14 w-28" />
        <Skeleton className="mt-6 h-8 w-48" />
      </section>
    )
  }

  if (!live) {
    return (
      <section className="glass-accent order-1 flex flex-col justify-between rounded-[22px] p-6 shadow-lg" aria-label="Today's flood risk">
        <p className="text-sm opacity-90">Today · {city.name}</p>
        <p className="mt-2 text-lg font-semibold" role="alert">
          {error || "No data for this city."}
        </p>
        <button type="button" onClick={reload} className="mt-4 min-h-11 self-start rounded-full bg-white/25 px-5 text-sm font-medium">
          Try again
        </button>
      </section>
    )
  }

  const risk = riskLook(live.risk)
  const rain = describeRain(live.rainMm)
  const degrees = (value: number | null | undefined) => (value === null || value === undefined ? "–" : `${Math.round(value)}°`)
  const day = recordedDayLabel(live.dataDate)

  // Right now (Tomorrow.io, streamed): shown when it has arrived; the recorded day is the fallback.
  const sky = describeWeatherCode(now?.weatherCode)
  const windKmh = now?.windSpeed === null || now?.windSpeed === undefined ? null : Math.round(now.windSpeed * 3.6) // m/s to km/h
  const liveNote =
    streamStatus === "live" ? "Live" : streamStatus === "connecting" ? "Connecting…" : streamStatus === "reconnecting" ? "Reconnecting…" : "Live weather unavailable"

  return (
    <section className="glass-accent order-1 flex flex-col justify-between rounded-[22px] p-6 shadow-lg" aria-label="Today's flood risk">
      <div>
        <p className="flex items-center justify-between gap-2 text-sm opacity-90">
          <span>{city.name} · {now ? "Now" : day}</span>
          {now && <span className="text-xs font-semibold">● {liveNote}</span>}
        </p>
        <p className="mt-2 text-6xl font-light tabular-nums">{now ? degrees(now.temperature) : degrees(live.highC)}</p>
        {now ? (
          <>
            <p className="mt-1 text-sm opacity-90">
              <span aria-hidden="true">{sky.icon} </span>
              {sky.text}, feels like {degrees(now.temperatureApparent)}
            </p>
            <p className="text-xs opacity-90">
              {now.precipitationProbability ?? "–"}% chance of rain
              {windKmh !== null && ` · wind ${windKmh} km/h`}
              {now.humidity !== null && now.humidity !== undefined && ` · humidity ${Math.round(now.humidity)}%`}
            </p>
            <p className="mt-1 text-xs opacity-90">
              {recordedDayLabel(live.dataDate)}: <span aria-hidden="true">{rain.icon} </span>
              {rain.text}
              {live.rainMm !== null && ` ${live.rainMm.toFixed(1)} mm`}, high {degrees(live.highC)}, low {degrees(live.lowC)}
            </p>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm opacity-90">
              <span aria-hidden="true">{rain.icon} </span>
              {rain.text}
              {live.rainMm !== null && ` (${live.rainMm.toFixed(1)} mm)`} · high {degrees(live.highC)}, low {degrees(live.lowC)}
            </p>
            {live.windKmh !== null && <p className="text-xs opacity-90">Wind up to {Math.round(live.windKmh)} km/h</p>}
            <p className="text-xs opacity-90">{liveNote}</p>
          </>
        )}
      </div>
      <div className="mt-6">
        <p className="text-2xl font-semibold">
          <span aria-hidden="true">{risk.symbol} </span>
          {live.risk ? `${risk.label} flood risk` : "Flood risk unavailable"}
        </p>
        <p className="text-sm opacity-90">River flow {describeFlow(live.riverFlowM3s)}</p>
        {live.riskReasons.length > 0 && <p className="mt-1 text-xs opacity-90">{live.riskReasons[0]}</p>}
        {live.missing.length > 0 && <p className="mt-1 text-xs font-semibold">Not in the data: {live.missing.join(", ")}.</p>}
      </div>
    </section>
  )
}
