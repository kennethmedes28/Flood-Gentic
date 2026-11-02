import { CITIES } from "@/data/dashboard-cities"

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

/** The four sets of charts the page can show. */
export type MetricKey = "rain" | "temperature" | "river" | "wind"

export const METRICS: { key: MetricKey; label: string }[] = [
  { key: "rain", label: "Rainfall" },
  { key: "temperature", label: "Temperature and heat" },
  { key: "river", label: "River flow vs rain" },
  { key: "wind", label: "Wind and gusts" },
]

/** A hot day is one with a high of at least this. It matches the backend's count of hot days. */
export const HOT_DAY_C = 35

/** A number with its unit, or an en dash when the data has no value. */
export function formatValue(value: number | null | undefined, unit: string, digits = 1): string {
  if (value === null || value === undefined) return "–"
  return `${value.toLocaleString("en-PH", { maximumFractionDigits: digits })} ${unit}`.trim()
}

/** "15 Jul 2024" for a date text such as "2024-07-15". */
export function longDate(date: string): string {
  return new Date(`${date}T12:00:00+08:00`).toLocaleDateString("en-PH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Manila" })
}

/** The display name of a city from its backend key; an empty key is all of Metro Manila. */
export function cityName(key: string): string {
  if (!key) return "All of Metro Manila"
  return CITIES.find((city) => city.key === key)?.name ?? key
}

/** How many days a month has (month 1 to 12). */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}
