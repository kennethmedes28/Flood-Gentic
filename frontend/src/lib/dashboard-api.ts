import { API_URL } from "@/lib/chat-api"
import type { FloodLevel } from "@/lib/flood-levels"

/** One recorded day, for the charts. */
export type DayRecord = {
  date: string
  rainMm: number | null
  highC: number | null
  lowC: number | null
  riverFlowM3s: number | null
}

/** What the dashboard knows about one city, from the last recorded day. A value that is not in the data is null. */
export type LiveCity = {
  key: string
  /** The day the numbers are from (it can be days behind today), for example "2026-10-30". */
  dataDate: string | null
  highC: number | null
  lowC: number | null
  rainMm: number | null
  windKmh: number | null
  gustKmh: number | null
  /** River flow in cubic metres per second. It is a flow, not a water height. */
  riverFlowM3s: number | null
  /** 0 to 1: the share of days since 2020 on which this city's river flow was lower. */
  riverPercentile: number | null
  /** The flow from which the river counts as high for this city (its 95th percentile). */
  riverHighFlowM3s: number | null
  risk: FloodLevel | null
  riskReasons: string[]
  /** What could not be found in the data for this city. */
  missing: string[]
  /** The last days, oldest first. */
  recent: DayRecord[]
}

export type DashboardData = {
  /** The newest day in the data, or null when there is none. */
  dataDate: string | null
  cities: LiveCity[]
}

/** The shape of the backend's answer (snake_case). */
type ApiCity = {
  city: string
  data_date: string | null
  high_c: number | null
  low_c: number | null
  rain_mm: number | null
  wind_kmh: number | null
  gust_kmh: number | null
  river_flow_m3s: number | null
  river_percentile: number | null
  river_high_flow_m3s: number | null
  risk_level: FloodLevel | null
  risk_reasons: string[]
  missing: string[]
  recent: { date: string; rain_mm: number | null; high_c: number | null; low_c: number | null; river_flow_m3s: number | null }[]
}

const TIMEOUT_MS = 45_000

/** Get the dashboard numbers for the given backend city keys. Throws an Error with a plain message on failure. */
export async function fetchDashboard(cityKeys: string[], signal?: AbortSignal): Promise<DashboardData> {
  const url = `${API_URL}/dashboard?cities=${encodeURIComponent(cityKeys.join(","))}`
  const timeout = AbortSignal.timeout(TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout })
  } catch {
    throw new Error("Can't reach the flood data service right now.")
  }
  if (!response.ok) throw new Error("The flood data service had a problem. Please try again.")

  const body = (await response.json()) as { data_date: string | null; cities: ApiCity[] }
  return {
    dataDate: body.data_date,
    cities: body.cities.map((city) => ({
      key: city.city,
      dataDate: city.data_date,
      highC: city.high_c,
      lowC: city.low_c,
      rainMm: city.rain_mm,
      windKmh: city.wind_kmh,
      gustKmh: city.gust_kmh,
      riverFlowM3s: city.river_flow_m3s,
      riverPercentile: city.river_percentile,
      riverHighFlowM3s: city.river_high_flow_m3s,
      risk: city.risk_level,
      riskReasons: city.risk_reasons,
      missing: city.missing,
      recent: city.recent.map((day) => ({
        date: day.date,
        rainMm: day.rain_mm,
        highC: day.high_c,
        lowC: day.low_c,
        riverFlowM3s: day.river_flow_m3s,
      })),
    })),
  }
}
