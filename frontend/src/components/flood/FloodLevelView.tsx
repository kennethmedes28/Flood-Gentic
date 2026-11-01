"use client"

import Link from "next/link"
import { useState } from "react"

import { FlowChart } from "@/components/flood/FlowChart"
import { FlowGauge } from "@/components/flood/FlowGauge"
import { LevelChip } from "@/components/flood/LevelChip"
import { RainBars } from "@/components/flood/RainBars"
import { GlassPanel } from "@/components/ui/GlassPanel"
import { LoadingLabel, Skeleton } from "@/components/ui/Skeleton"
import { useCurrentCity } from "@/context/CurrentCityContext"
import { useDashboardData } from "@/context/DashboardDataContext"
import { useLiveWeather } from "@/context/LiveWeatherContext"
import { CITIES } from "@/data/dashboard-cities"
import { LEVEL_STYLE, describeFlowChange, forecastRainLevel } from "@/lib/flood-levels"
import { shortDate, weekday } from "@/lib/rain-words"
import { riskLook } from "@/lib/risk"

/** How many recorded days the page shows and compares the river with. */
const WEEK_DAYS = 7

const MUTED = { color: "var(--glass-text-muted)" }

/** Classes shared by the two action buttons in "What to do". */
const ACTION_BUTTON = "inline-flex min-h-11 items-center justify-center rounded-full px-5 text-base font-semibold [text-shadow:none]"

/** "Marikina City" becomes "Marikina"; "Quezon City" keeps its City, because "Quezon" alone is not its name. */
function shortName(name: string): string {
  return name === "Quezon City" ? name : name.replace(/ City$/, "")
}

/** How many hours of the forecast are added up. */
const FORECAST_HOURS = 24

/** The next hours of the Tomorrow.io forecast of a city, summed up. Null when there is no forecast. */
function summariseForecast(hourly: { time: string; values: Record<string, number | null> }[], daily: { time: string; values: Record<string, number | null> }[]) {
  const now = Date.now()
  const hours = hourly.filter((entry) => new Date(entry.time).getTime() > now).slice(0, FORECAST_HOURS)
  if (hours.length === 0) return null

  const totalMm = hours.reduce((sum, entry) => sum + (entry.values.rainAccumulation ?? 0), 0)
  // The rain of each hour in mm, from the same figure as the total, so "at most X in one hour" can never exceed the total.
  const peakMmPerHour = Math.max(...hours.map((entry) => entry.values.rainAccumulation ?? 0))

  // The coming day with the highest chance of rain.
  const wettest = daily.reduce<{ time: string; chance: number } | null>((best, entry) => {
    const chance = entry.values.precipitationProbabilityMax
    return chance !== null && chance !== undefined && (best === null || chance > best.chance) ? { time: entry.time, chance } : best
  }, null)

  return { totalMm, peakMmPerHour, hoursCovered: hours.length, wettest, level: forecastRainLevel(peakMmPerHour, totalMm) }
}

/**
 * The flood level page: pick a city and see its flood risk, how high its river is compared with its own history, the last days
 * of river flow and rain, and what the rain forecast says. The numbers come from the backend (the recorded datasets and the
 * Tomorrow.io forecast), so they are as recent as the last recorded day, which can be days behind.
 *
 * It opens on the current city (see CurrentCityContext), and any of the 17 cities can be picked.
 */
export function FloodLevelView() {
  const { city: currentCity } = useCurrentCity()
  const { status, cityData, error, reload } = useDashboardData()
  const { forecastFor } = useLiveWeather()
  const [chosenKey, setChosenKey] = useState<string | null>(null)

  const city = CITIES.find((candidate) => candidate.key === (chosenKey ?? currentCity.key)) ?? currentCity
  const live = cityData(city.key)
  const stream = forecastFor(city.key)
  const forecast = stream ? summariseForecast(stream.hourly, stream.daily) : null

  if (status === "loading") {
    return (
      <div className="flex flex-col gap-4">
        <LoadingLabel>Loading flood levels</LoadingLabel>
        <GlassPanel className="p-5">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="mt-4 h-11 w-full" />
        </GlassPanel>
        <Skeleton className="h-80 w-full" />
      </div>
    )
  }

  if (!live) {
    return (
      <GlassPanel className="p-5">
        <h1 className="text-xl font-semibold">Flood level</h1>
        <p className="mt-2 text-base" role="alert">
          {error || "No flood data for this city yet."}
        </p>
        <button type="button" onClick={reload} className="mt-3 min-h-11 rounded-full px-5 text-base font-medium">
          Try again
        </button>
      </GlassPanel>
    )
  }

  const level = live.risk
  const risk = riskLook(level)
  const flowChange = describeFlowChange(live.recent.at(-2)?.riverFlowM3s, live.riverFlowM3s)
  const week = live.recent.slice(-WEEK_DAYS)
  const weekFlows = week.flatMap((day) => (day.riverFlowM3s === null ? [] : [day.riverFlowM3s]))
  const weekLow = weekFlows.length > 0 ? Math.min(...weekFlows) : null
  const weekHigh = weekFlows.length > 0 ? Math.max(...weekFlows) : null
  const dataDay = live.dataDate ? shortDate(live.dataDate) : "unknown date"

  return (
    <div className="flex flex-col gap-4">
      {/* Title and city picker. The radio buttons give arrow-key movement and a screen-reader group for free. */}
      <GlassPanel className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Flood level</h1>
            <p className="text-base" style={MUTED}>
              Flood risk and river flow by city in Metro Manila.
            </p>
          </div>
          <span className="rounded-full border border-current px-3 py-1 text-sm font-medium">Recorded up to {dataDay} · not official</span>
        </div>

        <fieldset className="mt-4">
          <legend className="sr-only">Choose a city</legend>
          <div className="flex flex-wrap gap-2">
            {CITIES.map((candidate) => {
              const candidateRisk = riskLook(cityData(candidate.key)?.risk)
              return (
                <label key={candidate.key} className="cursor-pointer">
                  <input
                    type="radio"
                    name="city"
                    value={candidate.key}
                    checked={candidate.key === city.key}
                    onChange={() => setChosenKey(candidate.key)}
                    className="peer sr-only"
                  />
                  <span className="flex min-h-11 items-center gap-2 rounded-full border border-white/50 px-4 text-base font-medium peer-checked:bg-[var(--glass-accent)] peer-checked:text-white peer-checked:[text-shadow:none] peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--glass-accent)]">
                    <span
                      className="grid size-6 place-items-center rounded-full text-xs text-white [text-shadow:none]"
                      style={{ background: candidateRisk.color }}
                      aria-hidden="true"
                    >
                      {candidateRisk.symbol}
                    </span>
                    {shortName(candidate.name)}
                    <span className="sr-only">, {candidateRisk.label} risk</span>
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>
      </GlassPanel>

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:items-start">
        {/* The river gauge. */}
        <GlassPanel className="p-5 lg:col-span-5">
          <h2 className="text-lg font-semibold">{city.name}</h2>
          <p className="text-base" style={MUTED}>
            River flow on {dataDay}
          </p>

          {live.riverFlowM3s === null ? (
            <p className="mt-3 text-base">No river readings for this city.</p>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                <p className="text-5xl font-light tabular-nums">
                  {live.riverFlowM3s.toFixed(1)}
                  <span className="ml-1 text-xl">m³/s</span>
                </p>
                <div className="flex flex-col items-start gap-1">
                  {level && <LevelChip level={level} />}
                  <p className="text-base">
                    <span aria-hidden="true">{flowChange.arrow} </span>
                    {flowChange.text}
                  </p>
                </div>
              </div>
              {weekLow !== null && weekHigh !== null && (
                <p className="mt-2 text-base" style={MUTED}>
                  Over the last {week.length} recorded days: {weekLow.toFixed(1)} to {weekHigh.toFixed(1)} m³/s.{" "}
                  {live.riverFlowM3s <= weekLow
                    ? "Today is the lowest of the week."
                    : live.riverFlowM3s >= weekHigh
                      ? "Today is the highest of the week."
                      : ""}
                </p>
              )}
              {weekLow !== null && weekHigh !== null && (
                <div className="mt-5">
                  <FlowGauge flowM3s={live.riverFlowM3s} lowM3s={weekLow} highM3s={weekHigh} level={level} />
                </div>
              )}
            </>
          )}
        </GlassPanel>

        <div className="flex flex-col gap-4 lg:col-span-7">
          {/* The recorded days. */}
          <GlassPanel className="p-5">
            <h2 className="text-lg font-semibold">Last {week.length} recorded days</h2>
            <p className="text-sm" style={MUTED}>
              River flow in m³/s, and the rain that fell each day (mm)
            </p>
            <div className="mt-3">
              <FlowChart days={week} level={level} />
            </div>
            <div className="mt-2">
              <RainBars days={week} />
            </div>
            <p className="mt-1 text-base tabular-nums" style={MUTED}>
              Rain on {dataDay}: {live.rainMm === null ? "not recorded" : `${live.rainMm.toFixed(1)} mm`}
            </p>
          </GlassPanel>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* What the rain forecast says. */}
            <GlassPanel className="p-5">
              <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                What may come next
                {forecast && <LevelChip level={forecast.level} className="!px-2 !py-0.5 !text-xs" />}
              </h2>
              {forecast ? (
                <>
                  <p className="mt-2 text-base leading-relaxed">
                    About {forecast.totalMm.toFixed(1)} mm of rain is forecast in the next {forecast.hoursCovered} hours, at most{" "}
                    {forecast.peakMmPerHour.toFixed(1)} mm in one hour.
                    {forecast.wettest &&
                      ` The highest chance of rain is ${weekday(new Date(forecast.wettest.time).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }))}, ${Math.round(forecast.wettest.chance)}%.`}
                  </p>
                  <p className="mt-2 text-sm" style={MUTED}>
                    The level uses the same rain limits as the flood risk rules. It is a forecast, not a warning, and it is not
                    part of the risk level shown above.
                  </p>
                </>
              ) : (
                <p className="mt-2 text-base">The rain forecast isn&apos;t available right now.</p>
              )}
            </GlassPanel>

            {/* What to do. */}
            <GlassPanel className="p-5">
              <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold">
                What to do
                {level && <LevelChip level={level} className="!px-2 !py-0.5 !text-xs" />}
              </h2>
              <p className="mt-2 text-base leading-relaxed">{level ? LEVEL_STYLE[level].advice : "The flood risk could not be worked out. Check pagasa.dost.gov.ph."}</p>
              {live.riskReasons.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm" style={MUTED}>
                  {live.riskReasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <a href="tel:911" className={`${ACTION_BUTTON} bg-[var(--glass-accent)] text-white`}>
                  Call 911 if in danger
                </a>
                <Link href="/assistant" className={`${ACTION_BUTTON} border border-current`}>
                  Ask the AI Agent Flood Assistant
                </Link>
              </div>
            </GlassPanel>
          </div>
        </div>
      </div>

      <GlassPanel className="p-5 text-sm">
        <p className="font-semibold">Disclaimer</p>
        <p className="mt-1" style={MUTED}>
          River flow, rain and the risk level are from the last recorded day in the project dataset, which can be days behind today.
          The risk is a rule-based estimate, not an official flood warning. Flow is in m³/s: there is no water height in the data.
          The rain forecast is from Tomorrow.io. For official warnings, see pagasa.dost.gov.ph and ndrrmc.gov.ph.
        </p>
      </GlassPanel>

      {/* Tells screen-reader users what changed when they pick another city. */}
      <p className="sr-only" role="status">
        Showing {city.name}: {risk.label} {level ? "risk" : ""}, river flow {live.riverFlowM3s === null ? "unknown" : `${live.riverFlowM3s.toFixed(1)} cubic metres per second`}.
      </p>
    </div>
  )
}
