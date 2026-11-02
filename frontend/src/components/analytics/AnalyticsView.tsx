"use client"

import { useEffect, useRef, useState } from "react"

import { CityRankingChart } from "@/components/analytics/CityRankingChart"
import { TrendChart } from "@/components/analytics/TrendChart"
import { BackToTopButton } from "@/components/shell/BackToTopButton"
import { GlassPanel } from "@/components/ui/GlassPanel"
import { LoadingLabel, Skeleton } from "@/components/ui/Skeleton"
import { CITIES } from "@/data/dashboard-cities"
import { analyticsQuery, fetchAnalytics, type Analytics, type AnalyticsFilters, type DayValue } from "@/lib/analytics-api"
import { METRICS, MONTH_NAMES, cityName, daysInMonth, formatValue, longDate, type MetricKey } from "@/lib/analytics-format"
import { describeRain } from "@/lib/rain-words"

const MUTED = { color: "var(--glass-text-muted)" }
const SELECT = "min-h-11 rounded-full border border-current bg-transparent px-4 text-base [&>option]:bg-white [&>option]:text-slate-900 disabled:opacity-50"
const CHIP = "min-h-11 rounded-full border border-current px-4 text-sm font-medium"

const NO_FILTERS: AnalyticsFilters = { cityKey: "", year: null, month: null, day: null }

/** What a click on a point opens, in words, for the hint under the chart. */
const DRILL_HINT = {
  year: "Click a bar or point to open that year.",
  month: "Click a bar or point to open that month.",
  day: "Click a bar or point to look at that day.",
}

/** The answer for one set of filters: the data, or a plain error message. */
type Result = { key: string; data?: Analytics; error?: string }

/** One of the six headline numbers. When it names a day, the button jumps to that day. */
function KpiCard({ title, value, sub, day, onJump }: { title: string; value: string; sub?: string; day?: DayValue | null; onJump: (date: string) => void }) {
  return (
    <div className="rounded-2xl bg-white/15 p-4">
      <p className="text-sm" style={MUTED}>
        {title}
      </p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {sub && (
        <p className="text-sm" style={MUTED}>
          {sub}
        </p>
      )}
      {day && (
        <button type="button" onClick={() => onJump(day.date)} className="mt-1 min-h-11 rounded-full border border-current px-3 text-sm font-medium">
          {longDate(day.date)}
          <span className="sr-only"> (open this day)</span>
        </button>
      )}
    </div>
  )
}

/**
 * Macro Weather Analytics: rain, temperature, river flow and wind since 2020 for Metro Manila or one city.
 *
 * Filters: city, year, month and day. With no year the chart has one point per year; picking a year shows its
 * months; picking a month shows its days; picking a day shows that day's numbers. Clicking a chart point, a
 * "headline" day or a city does the same as using the filters (drill down), and the path above the chart goes back up.
 * The numbers come from the backend (GET /analytics/weather), which reads the recorded dataset.
 */
export function AnalyticsView() {
  const [filters, setFilters] = useState<AnalyticsFilters>(NO_FILTERS)
  const [metric, setMetric] = useState<MetricKey>("rain")
  const [result, setResult] = useState<Result | null>(null)
  const [attempt, setAttempt] = useState(0) // changing this loads again
  const key = analyticsQuery(filters)
  const topRef = useRef<HTMLDivElement>(null) // the top of the page, used to find the scrolling area
  const cityFilterRef = useRef<HTMLSelectElement>(null) // where "Back to top" puts keyboard focus

  // Load the numbers whenever a filter changes. The previous answer stays on screen (dimmed) until the new one arrives.
  useEffect(() => {
    const controller = new AbortController()
    fetchAnalytics(filters, controller.signal)
      .then((data) => setResult({ key, data }))
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setResult({ key, error: caught instanceof Error ? caught.message : "Something went wrong." })
      })
    return () => controller.abort()
  }, [filters, key, attempt])

  const data = result?.data
  const loading = result?.key !== key
  const error = !loading ? result?.error : undefined

  // --- changing the filters (a deeper filter is cleared when a shallower one changes) ---
  const setCity = (cityKey: string) => setFilters((current) => ({ ...current, cityKey }))
  const setYear = (year: number | null) => setFilters((current) => ({ ...current, year, month: null, day: null }))
  const setMonth = (month: number | null) => setFilters((current) => ({ ...current, month, day: null }))
  const setDay = (day: number | null) => setFilters((current) => ({ ...current, day }))
  const jumpToDate = (date: string) => {
    const [year, month, day] = date.split("-").map(Number)
    setFilters((current) => ({ ...current, year, month, day }))
  }

  /** A click on the chart: open the year or month, or pick the day. */
  function drillInto(index: number) {
    const point = data?.points[index]
    if (!point || !data) return
    if (data.level === "year") setYear(Number(point.period))
    else if (data.level === "month") setMonth(Number(point.period.slice(5, 7)))
    else setDay(Number(point.period.slice(8, 10)))
  }

  const selectedPeriod =
    filters.day !== null && filters.year !== null && filters.month !== null
      ? `${filters.year}-${String(filters.month).padStart(2, "0")}-${String(filters.day).padStart(2, "0")}`
      : null

  const where = cityName(filters.cityKey)
  const when = filters.year === null ? "2020 to now" : filters.month === null ? String(filters.year) : `${MONTH_NAMES[filters.month - 1]} ${filters.year}`
  const lastOfData = data?.points[data.points.length - 1]
  const chartSummary = data
    ? `${METRICS.find((item) => item.key === metric)?.label} for ${where}, ${when}: ${data.points.length} ${data.level}s${lastOfData ? `, the last is ${lastOfData.period}` : ""}. The same numbers are in the table below.`
    : ""

  return (
    <div ref={topRef} className="flex flex-col gap-4">
      <BackToTopButton insideRef={topRef} focusRef={cityFilterRef} />

      {/* Title and filters */}
      <GlassPanel className="p-5">
        <h1 className="text-xl font-semibold">Macro Weather Analytics</h1>
        <p className="text-base" style={MUTED}>
          Rain, temperature, river flow and wind since 2020. Pick a city and a period, or click the chart to drill down.
        </p>
        <p className="mt-2 text-sm" style={MUTED}>
          Recorded data{data?.dataFirstDate && data.dataLastDate ? ` from ${longDate(data.dataFirstDate)} to ${longDate(data.dataLastDate)}` : ""}. It
          describes what already happened. It is not a forecast and not an official PAGASA statistic.
          {filters.cityKey === "" && " For all of Metro Manila, rain, temperature and river flow are the average of the 17 cities, and wind and gusts are the highest of them."}
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            City
            <select ref={cityFilterRef} value={filters.cityKey} onChange={(event) => setCity(event.target.value)} className={SELECT}>
              <option value="">All of Metro Manila</option>
              {CITIES.map((city) => (
                <option key={city.key} value={city.key}>
                  {city.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            Year
            <select value={filters.year ?? ""} onChange={(event) => setYear(event.target.value ? Number(event.target.value) : null)} className={SELECT}>
              <option value="">All years</option>
              {(data?.yearsAvailable ?? []).map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            Month
            <select value={filters.month ?? ""} disabled={filters.year === null} onChange={(event) => setMonth(event.target.value ? Number(event.target.value) : null)} className={SELECT}>
              <option value="">All months</option>
              {MONTH_NAMES.map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            Day
            <select value={filters.day ?? ""} disabled={filters.month === null} onChange={(event) => setDay(event.target.value ? Number(event.target.value) : null)} className={SELECT}>
              <option value="">All days</option>
              {filters.year !== null &&
                filters.month !== null &&
                Array.from({ length: daysInMonth(filters.year, filters.month) }, (_, index) => index + 1).map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
            </select>
          </label>

          <button type="button" onClick={() => setFilters(NO_FILTERS)} className={CHIP}>
            Reset filters
          </button>
        </div>

        {/* Where you are: each step goes back up to that level. */}
        <nav aria-label="Where you are" className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <button type="button" onClick={() => setYear(null)} className="min-h-11 underline" aria-current={filters.year === null ? "page" : undefined}>
            {where}, all years
          </button>
          {filters.year !== null && (
            <>
              <span aria-hidden="true">›</span>
              <button type="button" onClick={() => setMonth(null)} className="min-h-11 underline" aria-current={filters.month === null ? "page" : undefined}>
                {filters.year}
              </button>
            </>
          )}
          {filters.month !== null && (
            <>
              <span aria-hidden="true">›</span>
              <button type="button" onClick={() => setDay(null)} className="min-h-11 underline" aria-current={filters.day === null ? "page" : undefined}>
                {MONTH_NAMES[filters.month - 1]}
              </button>
            </>
          )}
          {filters.day !== null && (
            <>
              <span aria-hidden="true">›</span>
              <span aria-current="page" className="font-semibold">
                Day {filters.day}
              </span>
            </>
          )}
        </nav>
      </GlassPanel>

      {error && (
        <GlassPanel className="p-5">
          <p role="alert" className="text-base">
            {error}
          </p>
          <button type="button" onClick={() => setAttempt((count) => count + 1)} className={`${CHIP} mt-2`}>
            Try again
          </button>
        </GlassPanel>
      )}

      {!data && !error && (
        <GlassPanel className="p-5">
          <LoadingLabel>Loading the weather statistics</LoadingLabel>
          <Skeleton className="h-24 w-full" />
        </GlassPanel>
      )}

      {data && (
        <div className={`flex flex-col gap-4 transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          {/* Headline numbers */}
          <section aria-label={`Headline numbers for ${where}, ${when}`}>
            <GlassPanel className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-3">
              <KpiCard
                title="Total rain"
                value={formatValue(data.summary.rainTotalMm, "mm", 0)}
                sub={`${data.summary.rainDays} rain days, ${data.summary.heavyRainDays} heavy`}
                onJump={jumpToDate}
              />
              <KpiCard title="Wettest day" value={formatValue(data.wettestDay?.value, "mm")} day={data.wettestDay} onJump={jumpToDate} />
              <KpiCard
                title="Hottest day"
                value={formatValue(data.hottestDay?.value, "°C")}
                sub={`${data.summary.hotDays} days at 35 °C or hotter`}
                day={data.hottestDay}
                onJump={jumpToDate}
              />
              <KpiCard
                title="Average high and low"
                value={`${formatValue(data.summary.highAvgC, "°C")} / ${formatValue(data.summary.lowAvgC, "°C")}`}
                sub={`Coolest night ${formatValue(data.coolestNight?.value, "°C")}`}
                onJump={jumpToDate}
              />
              <KpiCard title="Peak river flow" value={formatValue(data.peakRiverDay?.value, "m³/s")} day={data.peakRiverDay} onJump={jumpToDate} />
              <KpiCard title="Strongest gust" value={formatValue(data.strongestGust?.value, "km/h")} day={data.strongestGust} onJump={jumpToDate} />
            </GlassPanel>
          </section>

          {/* The one day that was picked */}
          {filters.day !== null && (
            <GlassPanel className="p-5">
              <h2 className="text-lg font-semibold">
                {where}, {data.dayDetail ? longDate(data.dayDetail.date) : `day ${filters.day}`}
              </h2>
              {data.dayDetail ? (
                <>
                  <p className="text-base">
                    {describeRain(data.dayDetail.rainMm).icon} {describeRain(data.dayDetail.rainMm).text}
                  </p>
                  <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {[
                      ["Rain", formatValue(data.dayDetail.rainMm, "mm")],
                      ["High", formatValue(data.dayDetail.highC, "°C")],
                      ["Low", formatValue(data.dayDetail.lowC, "°C")],
                      ["Wind (strongest)", formatValue(data.dayDetail.windKmh, "km/h")],
                      ["Gust (strongest)", formatValue(data.dayDetail.gustKmh, "km/h")],
                      ["River flow", formatValue(data.dayDetail.riverFlowM3s, "m³/s")],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-2xl bg-white/15 p-3">
                        <dt className="text-sm" style={MUTED}>
                          {label}
                        </dt>
                        <dd className="text-lg font-semibold tabular-nums">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              ) : (
                <p className="text-base">Nothing was recorded for this day.</p>
              )}
            </GlassPanel>
          )}

          {/* The main chart */}
          <GlassPanel className="p-5">
            <div role="tablist" aria-label="What to chart" className="flex flex-wrap gap-2">
              {METRICS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={metric === item.key}
                  onClick={() => setMetric(item.key)}
                  className="min-h-11 rounded-full px-4 text-sm font-medium aria-selected:bg-[var(--glass-accent)] aria-selected:text-white aria-selected:[text-shadow:none]"
                >
                  {item.label}
                </button>
              ))}
            </div>
            <h2 className="mt-3 text-lg font-semibold">
              {METRICS.find((item) => item.key === metric)?.label}: {where}, {when}
            </h2>
            <p className="mb-2 text-sm" style={MUTED}>
              One point per {data.level}. {DRILL_HINT[data.level]}
            </p>
            {data.points.length === 0 ? (
              <p className="text-base">There is no recorded data for this choice.</p>
            ) : (
              <TrendChart points={data.points} metric={metric} selectedPeriod={selectedPeriod} onPick={drillInto} daily={data.level === "day"} summary={chartSummary} />
            )}
          </GlassPanel>

          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:items-start">
            {/* The rainiest days */}
            <GlassPanel className="p-5 lg:col-span-5">
              <h2 className="text-lg font-semibold">Rainiest days</h2>
              <p className="text-sm" style={MUTED}>
                {where}, {when}
              </p>
              {data.rainiestDays.length === 0 ? (
                <p className="mt-2 text-base">No rain was recorded.</p>
              ) : (
                <ol className="mt-3 flex flex-col gap-2">
                  {data.rainiestDays.map((day) => (
                    <li key={day.date}>
                      <button type="button" onClick={() => jumpToDate(day.date)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl bg-white/15 px-4 text-left">
                        <span className="text-base">{longDate(day.date)}</span>
                        <span className="text-base font-semibold tabular-nums">{formatValue(day.value, "mm")}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </GlassPanel>

            {/* The cities side by side */}
            <GlassPanel className="p-5 lg:col-span-7">
              <CityRankingChart rows={data.cityRanking} metric={metric} selectedKey={filters.cityKey} onPick={setCity} />
              <p className="mt-1 text-sm" style={MUTED}>
                Same period, all 17 cities. Click a bar to look at that city.
              </p>
            </GlassPanel>
          </div>

          {/* The same numbers as a table: for keyboard and screen reader users, and for anyone who wants the exact figures. */}
          <GlassPanel className="p-5">
            <details>
              <summary className="min-h-11 cursor-pointer text-lg font-semibold">Table of the numbers</summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <caption className="sr-only">
                    {where}, {when}: one row per {data.level}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col" className="py-2 pr-3">
                        {data.level === "year" ? "Year" : data.level === "month" ? "Month" : "Day"}
                      </th>
                      <th scope="col" className="pr-3">Rain (mm)</th>
                      <th scope="col" className="pr-3">Rain days</th>
                      <th scope="col" className="pr-3">Avg high (°C)</th>
                      <th scope="col" className="pr-3">Avg low (°C)</th>
                      <th scope="col" className="pr-3">Gust (km/h)</th>
                      <th scope="col" className="pr-3">River peak (m³/s)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.points.map((point, index) => (
                      <tr key={point.period} className="border-t border-white/30">
                        <th scope="row" className="py-1 pr-3 font-medium">
                          <button type="button" onClick={() => drillInto(index)} className="min-h-11 underline">
                            {point.period}
                          </button>
                        </th>
                        <td className="pr-3 tabular-nums">{formatValue(point.rainTotalMm, "")}</td>
                        <td className="pr-3 tabular-nums">{point.rainDays}</td>
                        <td className="pr-3 tabular-nums">{formatValue(point.highAvgC, "")}</td>
                        <td className="pr-3 tabular-nums">{formatValue(point.lowAvgC, "")}</td>
                        <td className="pr-3 tabular-nums">{formatValue(point.gustMaxKmh, "")}</td>
                        <td className="pr-3 tabular-nums">{formatValue(point.riverMaxM3s, "")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </GlassPanel>
        </div>
      )}
    </div>
  )
}
