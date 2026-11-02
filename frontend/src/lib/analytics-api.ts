import { API_URL } from "@/lib/chat-api"

/** The filters of the analytics page. `cityKey` "" means all of Metro Manila combined. */
export type AnalyticsFilters = {
  cityKey: string
  year: number | null
  month: number | null
  day: number | null
}

/** Totals, averages and extremes for a group of days. A value that is not in the data is null. */
export type Stats = {
  days: number
  rainTotalMm: number | null
  rainMaxDayMm: number | null
  rainDays: number
  heavyRainDays: number
  highAvgC: number | null
  highMaxC: number | null
  hotDays: number
  lowAvgC: number | null
  lowMinC: number | null
  windMaxKmh: number | null
  gustMaxKmh: number | null
  riverAvgM3s: number | null
  riverMaxM3s: number | null
}

/** One year, month or day on a chart. */
export type Point = Stats & {
  /** "2024", "2024-07" or "2024-07-15". */
  period: string
  /** The text for the chart axis: "2024", "Jul" or "15". */
  label: string
}

export type DayValue = { date: string; value: number }

export type DayRecord = {
  date: string
  rainMm: number | null
  highC: number | null
  lowC: number | null
  windKmh: number | null
  gustKmh: number | null
  riverFlowM3s: number | null
}

export type CityRow = {
  /** The backend key, for example "quezon city". */
  city: string
  rainTotalMm: number | null
  highAvgC: number | null
  riverMaxM3s: number | null
  gustMaxKmh: number | null
}

export type Analytics = {
  /** What each point stands for. */
  level: "year" | "month" | "day"
  yearsAvailable: number[]
  dataFirstDate: string | null
  dataLastDate: string | null
  summary: Stats
  wettestDay: DayValue | null
  hottestDay: DayValue | null
  coolestNight: DayValue | null
  strongestGust: DayValue | null
  peakRiverDay: DayValue | null
  rainiestDays: DayValue[]
  points: Point[]
  dayDetail: DayRecord | null
  cityRanking: CityRow[]
}

/** The shape of the backend's answer (snake_case). */
type ApiStats = {
  days: number
  rain_total_mm: number | null
  rain_max_day_mm: number | null
  rain_days: number
  heavy_rain_days: number
  high_avg_c: number | null
  high_max_c: number | null
  hot_days: number
  low_avg_c: number | null
  low_min_c: number | null
  wind_max_kmh: number | null
  gust_max_kmh: number | null
  river_avg_m3s: number | null
  river_max_m3s: number | null
}

type ApiAnalytics = {
  level: Analytics["level"]
  years_available: string[]
  data_first_date: string | null
  data_last_date: string | null
  summary: ApiStats
  wettest_day: DayValue | null
  hottest_day: DayValue | null
  coolest_night: DayValue | null
  strongest_gust: DayValue | null
  peak_river_day: DayValue | null
  rainiest_days: DayValue[]
  points: (ApiStats & { period: string; label: string })[]
  day_detail: {
    date: string
    rain_mm: number | null
    high_c: number | null
    low_c: number | null
    wind_kmh: number | null
    gust_kmh: number | null
    river_flow_m3s: number | null
  } | null
  city_ranking: { city: string; rain_total_mm: number | null; high_avg_c: number | null; river_max_m3s: number | null; gust_max_kmh: number | null }[]
}

const TIMEOUT_MS = 30_000

function toStats(stats: ApiStats): Stats {
  return {
    days: stats.days,
    rainTotalMm: stats.rain_total_mm,
    rainMaxDayMm: stats.rain_max_day_mm,
    rainDays: stats.rain_days,
    heavyRainDays: stats.heavy_rain_days,
    highAvgC: stats.high_avg_c,
    highMaxC: stats.high_max_c,
    hotDays: stats.hot_days,
    lowAvgC: stats.low_avg_c,
    lowMinC: stats.low_min_c,
    windMaxKmh: stats.wind_max_kmh,
    gustMaxKmh: stats.gust_max_kmh,
    riverAvgM3s: stats.river_avg_m3s,
    riverMaxM3s: stats.river_max_m3s,
  }
}

/** The query text for the filters; only the filters that are set are included. */
export function analyticsQuery(filters: AnalyticsFilters): string {
  const query = new URLSearchParams()
  if (filters.cityKey) query.set("city", filters.cityKey)
  if (filters.year !== null) query.set("year", String(filters.year))
  if (filters.month !== null) query.set("month", String(filters.month))
  if (filters.day !== null) query.set("day", String(filters.day))
  return query.toString()
}

/** Get the statistics for the filters (GET /analytics/weather). Throws an Error with a plain message on failure. */
export async function fetchAnalytics(filters: AnalyticsFilters, signal?: AbortSignal): Promise<Analytics> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(`${API_URL}/analytics/weather?${analyticsQuery(filters)}`, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout })
  } catch {
    throw new Error("Can't reach the weather data service right now.")
  }
  if (!response.ok) throw new Error("The weather data service had a problem. Please try again.")

  const body = (await response.json()) as ApiAnalytics
  return {
    level: body.level,
    yearsAvailable: body.years_available.map(Number),
    dataFirstDate: body.data_first_date,
    dataLastDate: body.data_last_date,
    summary: toStats(body.summary),
    wettestDay: body.wettest_day,
    hottestDay: body.hottest_day,
    coolestNight: body.coolest_night,
    strongestGust: body.strongest_gust,
    peakRiverDay: body.peak_river_day,
    rainiestDays: body.rainiest_days,
    points: body.points.map((point) => ({ ...toStats(point), period: point.period, label: point.label })),
    dayDetail: body.day_detail && {
      date: body.day_detail.date,
      rainMm: body.day_detail.rain_mm,
      highC: body.day_detail.high_c,
      lowC: body.day_detail.low_c,
      windKmh: body.day_detail.wind_kmh,
      gustKmh: body.day_detail.gust_kmh,
      riverFlowM3s: body.day_detail.river_flow_m3s,
    },
    cityRanking: body.city_ranking.map((row) => ({
      city: row.city,
      rainTotalMm: row.rain_total_mm,
      highAvgC: row.high_avg_c,
      riverMaxM3s: row.river_max_m3s,
      gustMaxKmh: row.gust_max_kmh,
    })),
  }
}
