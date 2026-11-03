import { CITIES } from "@/data/dashboard-cities"
import type { MessageKey } from "@/i18n/messages"

/** The name of a month (1 to 12) in the language of the page, for example "July" or "Hulyo". */
export function monthName(month: number, locale: string, style: "long" | "short" = "long"): string {
  return new Date(Date.UTC(2024, month - 1, 15)).toLocaleDateString(locale, { month: style, timeZone: "UTC" })
}

/** The text under a point of the chart: the year, the short month name, or the day of the month, from the point's period. */
export function periodLabel(period: string, locale: string): string {
  if (period.length === 4) return period
  if (period.length === 7) return monthName(Number(period.slice(5, 7)), locale, "short")
  return String(Number(period.slice(8, 10)))
}

/** The four sets of charts the page can show. */
export type MetricKey = "rain" | "temperature" | "river" | "wind"

export const METRICS: { key: MetricKey; label: MessageKey }[] = [
  { key: "rain", label: "an.metric.rain" },
  { key: "temperature", label: "an.metric.temperature" },
  { key: "river", label: "an.metric.river" },
  { key: "wind", label: "an.metric.wind" },
]

/** A hot day is one with a high of at least this. It matches the backend's count of hot days. */
export const HOT_DAY_C = 35

/** A number with its unit, or an en dash when the data has no value. */
export function formatValue(value: number | null | undefined, unit: string, digits = 1, locale = "en-PH"): string {
  if (value === null || value === undefined) return "–"
  return `${value.toLocaleString(locale, { maximumFractionDigits: digits })} ${unit}`.trim()
}

/** "15 Jul 2024" for a date text such as "2024-07-15". */
export function longDate(date: string, locale = "en-PH"): string {
  return new Date(`${date}T12:00:00+08:00`).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Manila" })
}

/** The display name of a city from its backend key; an empty key is all of Metro Manila. */
export function cityName(key: string, t: (key: MessageKey) => string): string {
  if (!key) return t("an.allMetro")
  return CITIES.find((city) => city.key === key)?.name ?? key
}

/** How many days a month has (month 1 to 12). */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}
