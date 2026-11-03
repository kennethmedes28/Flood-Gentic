import { KeyedError } from "@/i18n/keyed-error"
import { MESSAGES, type MessageKey } from "@/i18n/messages"
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
  /** The same reasons as codes with a number, which the page writes in the chosen language (see `reasonKey`). */
  riskReasonCodes: { code: string; value: number | null }[]
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
  risk_reason_codes?: { code: string; value: number | null }[] // missing from an older cached answer
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
    throw new KeyedError("error.dashboardNetwork")
  }
  if (!response.ok) throw new KeyedError("error.dashboardProblem")

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
      riskReasonCodes: city.risk_reason_codes ?? [],
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

/** The interface text of a reason code from the backend, or null for a code this version does not know (show the English text then). */
export function reasonKey(code: string): MessageKey | null {
  const key = `reason.${code}`
  return key in MESSAGES.en ? (key as MessageKey) : null
}

/** What the backend lists as not found in the data, as an interface text; any other text is shown as it came. */
export function missingText(item: string, t: (key: MessageKey) => string): string {
  return item === "recorded weather for this city" ? t("missing.cityWeather") : item
}

/** One reason as text in the chosen language: the translated sentence with its number, or the backend's English sentence. */
export function reasonText(
  reason: { code: string; value: number | null },
  english: string | undefined,
  t: (key: MessageKey, params?: Record<string, string | number>) => string
): string {
  const key = reasonKey(reason.code)
  if (!key) return english ?? ""
  if (reason.value === null) return reason.code === "calm" ? t(key) : (english ?? "") // every other reason needs its number
  const digits = reason.code === "peak_rain" || reason.code === "high_river" ? 1 : 0
  return t(key, { value: reason.value.toFixed(digits) })
}
