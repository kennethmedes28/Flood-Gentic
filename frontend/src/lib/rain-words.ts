import type { MessageKey } from "@/i18n/messages"

/** What a day's total rain (mm) looks like and is called, using the common PAGASA-style bands. `text` is a key of the interface texts (translate it with `t`). */
export type RainLook = { icon: string; text: MessageKey }

/** Lowest amount of each band, highest first. */
const BANDS: { fromMm: number; look: RainLook }[] = [
  { fromMm: 50, look: { icon: "⛈️", text: "rain.intense" } },
  { fromMm: 30, look: { icon: "🌧️", text: "rain.heavy" } },
  { fromMm: 10, look: { icon: "🌧️", text: "rain.moderate" } },
  { fromMm: 1, look: { icon: "🌦️", text: "rain.light" } },
  { fromMm: 0, look: { icon: "⛅", text: "rain.none" } },
]

const UNKNOWN: RainLook = { icon: "❔", text: "rain.unknown" }

/** The icon and words for a day's rain, or a neutral look when the amount is not known. */
export function describeRain(mm: number | null | undefined): RainLook {
  if (mm === null || mm === undefined) return UNKNOWN
  return BANDS.find((band) => mm >= band.fromMm)?.look ?? UNKNOWN
}

/** "30 Oct" for a date text such as "2026-10-30", read as a calendar day in Manila. */
export function shortDate(date: string, locale = "en-PH"): string {
  return new Date(`${date}T12:00:00+08:00`).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "Asia/Manila" })
}

/** True when the date text (such as "2026-11-03") is today's calendar day in Manila. */
export function isTodayInManila(date: string): boolean {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }) // "2026-11-03"
  return date === today
}

/**
 * How to name the day the recorded numbers are from: "Today so far" while it is still in progress (the data is refreshed
 * every few hours and the day is only final after midnight), otherwise "Latest recorded day". The date follows.
 */
export function recordedDayLabel(date: string | null | undefined, t: (key: MessageKey) => string, locale = "en-PH"): string {
  if (!date) return t("day.latest")
  return `${isTodayInManila(date) ? t("day.today") : t("day.latest")} · ${shortDate(date, locale)}`
}

/** "Fri" for a date text. */
export function weekday(date: string, locale = "en-PH"): string {
  return new Date(`${date}T12:00:00+08:00`).toLocaleDateString(locale, { weekday: "short", timeZone: "Asia/Manila" })
}

/** The Manila calendar day ("2026-11-01") of a UTC time such as "2026-10-31T22:00:00Z". */
export function manilaDay(isoTime: string): string {
  return new Date(isoTime).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })
}

/** The hour of the day (0-23) in Manila of a UTC time. */
export function manilaHour(isoTime: string): number {
  return Number(new Date(isoTime).toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Manila" }))
}
