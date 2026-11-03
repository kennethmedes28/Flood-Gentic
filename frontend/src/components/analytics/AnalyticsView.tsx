"use client"

import { useEffect, useRef, useState } from "react"

import { CityRankingChart } from "@/components/analytics/CityRankingChart"
import { TrendChart } from "@/components/analytics/TrendChart"
import { BackToTopButton } from "@/components/shell/BackToTopButton"
import { GlassPanel } from "@/components/ui/GlassPanel"
import { LoadingLabel, Skeleton } from "@/components/ui/Skeleton"
import { useLanguage } from "@/context/LanguageContext"
import { KeyedError } from "@/i18n/keyed-error"
import type { MessageKey } from "@/i18n/messages"
import { CITIES } from "@/data/dashboard-cities"
import { analyticsQuery, fetchAnalytics, type Analytics, type AnalyticsFilters, type DayValue } from "@/lib/analytics-api"
import { METRICS, cityName, daysInMonth, formatValue, longDate, monthName, type MetricKey } from "@/lib/analytics-format"
import { describeRain } from "@/lib/rain-words"

const MUTED = { color: "var(--glass-text-muted)" }
const SELECT = "min-h-11 rounded-full border border-current bg-transparent px-4 text-base [&>option]:bg-white [&>option]:text-slate-900 disabled:opacity-50"
const CHIP = "min-h-11 rounded-full border border-current px-4 text-sm font-medium"

const NO_FILTERS: AnalyticsFilters = { cityKey: "", year: null, month: null, day: null }

/** What a click on a point opens, in words, for the hint under the chart. */
const DRILL_HINT: Record<"year" | "month" | "day", MessageKey> = {
  year: "an.drill.year",
  month: "an.drill.month",
  day: "an.drill.day",
}

/** The twelve months, for the month picker. */
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

/** The answer for one set of filters: the data, or a plain error message. */
type Result = { key: string; data?: Analytics; error?: MessageKey }

/** One of the six headline numbers. When it names a day, the button jumps to that day. */
function KpiCard({ title, value, sub, day, onJump }: { title: string; value: string; sub?: string; day?: DayValue | null; onJump: (date: string) => void }) {
  const { t, locale } = useLanguage()
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
          {longDate(day.date, locale)}
          <span className="sr-only">{t("an.openDay")}</span>
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
  const { t, locale } = useLanguage()
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
        if (!controller.signal.aborted) setResult({ key, error: caught instanceof KeyedError ? caught.key : "an.generic" })
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

  const where = cityName(filters.cityKey, t)
  const when = filters.year === null ? t("an.since") : filters.month === null ? String(filters.year) : `${monthName(filters.month, locale)} ${filters.year}`
  const metricLabel = t(METRICS.find((item) => item.key === metric)?.label ?? "an.metric.rain")
  const lastOfData = data?.points[data.points.length - 1]
  const chartSummary = data
    ? t("an.chartSummary", {
        metric: metricLabel,
        where,
        when,
        count: data.points.length,
        unit: t(`an.levelPlural.${data.level}`),
        last: lastOfData ? t("an.chartSummaryLast", { period: lastOfData.period }) : "",
      })
    : ""

  return (
    <div ref={topRef} className="flex flex-col gap-4">
      <BackToTopButton insideRef={topRef} focusRef={cityFilterRef} />

      {/* Title and filters */}
      <GlassPanel className="p-5">
        <h1 className="text-xl font-semibold">{t("an.title")}</h1>
        <p className="text-base" style={MUTED}>
          {t("an.subtitle")}
        </p>
        <p className="mt-2 text-sm" style={MUTED}>
          {t("an.recorded")}
          {data?.dataFirstDate && data.dataLastDate ? t("an.recordedRange", { from: longDate(data.dataFirstDate, locale), to: longDate(data.dataLastDate, locale) }) : ""}
          {t("an.notForecast")}
          {filters.cityKey === "" && t("an.allMetroNote")}
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t("an.city")}
            <select ref={cityFilterRef} value={filters.cityKey} onChange={(event) => setCity(event.target.value)} className={SELECT}>
              <option value="">{t("an.allMetro")}</option>
              {CITIES.map((city) => (
                <option key={city.key} value={city.key}>
                  {city.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            {t("an.year")}
            <select value={filters.year ?? ""} onChange={(event) => setYear(event.target.value ? Number(event.target.value) : null)} className={SELECT}>
              <option value="">{t("an.allYears")}</option>
              {(data?.yearsAvailable ?? []).map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            {t("an.month")}
            <select value={filters.month ?? ""} disabled={filters.year === null} onChange={(event) => setMonth(event.target.value ? Number(event.target.value) : null)} className={SELECT}>
              <option value="">{t("an.allMonths")}</option>
              {MONTHS.map((month) => (
                <option key={month} value={month}>
                  {monthName(month, locale)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium">
            {t("an.day")}
            <select value={filters.day ?? ""} disabled={filters.month === null} onChange={(event) => setDay(event.target.value ? Number(event.target.value) : null)} className={SELECT}>
              <option value="">{t("an.allDays")}</option>
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
            {t("an.reset")}
          </button>
        </div>

        {/* Where you are: each step goes back up to that level. */}
        <nav aria-label={t("an.whereYouAre")} className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <button type="button" onClick={() => setYear(null)} className="min-h-11 underline" aria-current={filters.year === null ? "page" : undefined}>
            {t("an.allYearsCrumb", { where })}
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
                {monthName(filters.month, locale)}
              </button>
            </>
          )}
          {filters.day !== null && (
            <>
              <span aria-hidden="true">›</span>
              <span aria-current="page" className="font-semibold">
                {t("an.dayCrumb", { day: filters.day })}
              </span>
            </>
          )}
        </nav>
      </GlassPanel>

      {error && (
        <GlassPanel className="p-5">
          <p role="alert" className="text-base">
            {t(error)}
          </p>
          <button type="button" onClick={() => setAttempt((count) => count + 1)} className={`${CHIP} mt-2`}>
            {t("an.retry")}
          </button>
        </GlassPanel>
      )}

      {!data && !error && (
        <GlassPanel className="p-5">
          <LoadingLabel>{t("an.loading")}</LoadingLabel>
          <Skeleton className="h-24 w-full" />
        </GlassPanel>
      )}

      {data && (
        <div className={`flex flex-col gap-4 transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
          {/* Headline numbers */}
          <section aria-label={t("an.kpiLabel", { where, when })}>
            <GlassPanel className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-3">
              <KpiCard
                title={t("an.kpi.totalRain")}
                value={formatValue(data.summary.rainTotalMm, "mm", 0, locale)}
                sub={t("an.kpi.rainDays", { rain: data.summary.rainDays, heavy: data.summary.heavyRainDays })}
                onJump={jumpToDate}
              />
              <KpiCard title={t("an.kpi.wettest")} value={formatValue(data.wettestDay?.value, "mm")} day={data.wettestDay} onJump={jumpToDate} />
              <KpiCard
                title={t("an.kpi.hottest")}
                value={formatValue(data.hottestDay?.value, "°C")}
                sub={t("an.kpi.hotDays", { count: data.summary.hotDays })}
                day={data.hottestDay}
                onJump={jumpToDate}
              />
              <KpiCard
                title={t("an.kpi.highLow")}
                value={`${formatValue(data.summary.highAvgC, "°C")} / ${formatValue(data.summary.lowAvgC, "°C")}`}
                sub={t("an.kpi.coolestNight", { value: formatValue(data.coolestNight?.value, "°C", 1, locale) })}
                onJump={jumpToDate}
              />
              <KpiCard title={t("an.kpi.peakRiver")} value={formatValue(data.peakRiverDay?.value, "m³/s")} day={data.peakRiverDay} onJump={jumpToDate} />
              <KpiCard title={t("an.kpi.gust")} value={formatValue(data.strongestGust?.value, "km/h")} day={data.strongestGust} onJump={jumpToDate} />
            </GlassPanel>
          </section>

          {/* The one day that was picked */}
          {filters.day !== null && (
            <GlassPanel className="p-5">
              <h2 className="text-lg font-semibold">
                {t("an.dayTitle", { where, day: data.dayDetail ? longDate(data.dayDetail.date, locale) : t("an.dayNumber", { day: filters.day }) })}
              </h2>
              {data.dayDetail ? (
                <>
                  <p className="text-base">
                    {describeRain(data.dayDetail.rainMm).icon} {t(describeRain(data.dayDetail.rainMm).text)}
                  </p>
                  <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {[
                      [t("an.dayRain"), formatValue(data.dayDetail.rainMm, "mm")],
                      [t("an.dayHigh"), formatValue(data.dayDetail.highC, "°C")],
                      [t("an.dayLow"), formatValue(data.dayDetail.lowC, "°C")],
                      [t("an.dayWind"), formatValue(data.dayDetail.windKmh, "km/h")],
                      [t("an.dayGust"), formatValue(data.dayDetail.gustKmh, "km/h")],
                      [t("an.dayRiver"), formatValue(data.dayDetail.riverFlowM3s, "m³/s")],
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
                <p className="text-base">{t("an.dayNothing")}</p>
              )}
            </GlassPanel>
          )}

          {/* The main chart */}
          <GlassPanel className="p-5">
            <div role="tablist" aria-label={t("an.chartKind")} className="flex flex-wrap gap-2">
              {METRICS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={metric === item.key}
                  onClick={() => setMetric(item.key)}
                  className="min-h-11 rounded-full px-4 text-sm font-medium aria-selected:bg-[var(--glass-accent)] aria-selected:text-white aria-selected:[text-shadow:none]"
                >
                  {t(item.label)}
                </button>
              ))}
            </div>
            <h2 className="mt-3 text-lg font-semibold">
              {t("an.chartTitle", { metric: metricLabel, where, when })}
            </h2>
            <p className="mb-2 text-sm" style={MUTED}>
              {t("an.onePoint", { level: t(`an.level.${data.level}`) })} {t(DRILL_HINT[data.level])}
            </p>
            {data.points.length === 0 ? (
              <p className="text-base">{t("an.noData")}</p>
            ) : (
              <TrendChart points={data.points} metric={metric} selectedPeriod={selectedPeriod} onPick={drillInto} daily={data.level === "day"} summary={chartSummary} />
            )}
          </GlassPanel>

          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:items-start">
            {/* The rainiest days */}
            <GlassPanel className="p-5 lg:col-span-5">
              <h2 className="text-lg font-semibold">{t("an.rainiest")}</h2>
              <p className="text-sm" style={MUTED}>
                {where}, {when}
              </p>
              {data.rainiestDays.length === 0 ? (
                <p className="mt-2 text-base">{t("an.noRain")}</p>
              ) : (
                <ol className="mt-3 flex flex-col gap-2">
                  {data.rainiestDays.map((day) => (
                    <li key={day.date}>
                      <button type="button" onClick={() => jumpToDate(day.date)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl bg-white/15 px-4 text-left">
                        <span className="text-base">{longDate(day.date, locale)}</span>
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
                {t("an.samePeriod")}
              </p>
            </GlassPanel>
          </div>

          {/* The same numbers as a table: for keyboard and screen reader users, and for anyone who wants the exact figures. */}
          <GlassPanel className="p-5">
            <details>
              <summary className="min-h-11 cursor-pointer text-lg font-semibold">{t("an.table")}</summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <caption className="sr-only">
                    {t("an.tableCaption", { where, when, level: t(`an.level.${data.level}`) })}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col" className="py-2 pr-3">
                        {t(`an.col.${data.level}`)}
                      </th>
                      <th scope="col" className="pr-3">{t("an.col.rain")}</th>
                      <th scope="col" className="pr-3">{t("an.col.rainDays")}</th>
                      <th scope="col" className="pr-3">{t("an.col.high")}</th>
                      <th scope="col" className="pr-3">{t("an.col.low")}</th>
                      <th scope="col" className="pr-3">{t("an.col.gust")}</th>
                      <th scope="col" className="pr-3">{t("an.col.river")}</th>
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
