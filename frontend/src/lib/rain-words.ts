/** What a day's total rain (mm) looks like and is called, using the common PAGASA-style bands. */
export type RainLook = { icon: string; text: string }

/** Lowest amount of each band, highest first. */
const BANDS: { fromMm: number; look: RainLook }[] = [
  { fromMm: 50, look: { icon: "⛈️", text: "Intense rain" } },
  { fromMm: 30, look: { icon: "🌧️", text: "Heavy rain" } },
  { fromMm: 10, look: { icon: "🌧️", text: "Moderate rain" } },
  { fromMm: 1, look: { icon: "🌦️", text: "Light rain" } },
  { fromMm: 0, look: { icon: "⛅", text: "Little or no rain" } },
]

const UNKNOWN: RainLook = { icon: "❔", text: "Rain not recorded" }

/** The icon and words for a day's rain, or a neutral look when the amount is not known. */
export function describeRain(mm: number | null | undefined): RainLook {
  if (mm === null || mm === undefined) return UNKNOWN
  return BANDS.find((band) => mm >= band.fromMm)?.look ?? UNKNOWN
}

/** "30 Oct" for a date text such as "2026-10-30", read as a calendar day in Manila. */
export function shortDate(date: string): string {
  return new Date(`${date}T12:00:00+08:00`).toLocaleDateString("en-PH", { day: "numeric", month: "short", timeZone: "Asia/Manila" })
}

/** "Fri" for a date text. */
export function weekday(date: string): string {
  return new Date(`${date}T12:00:00+08:00`).toLocaleDateString("en-PH", { weekday: "short", timeZone: "Asia/Manila" })
}

/** The Manila calendar day ("2026-11-01") of a UTC time such as "2026-10-31T22:00:00Z". */
export function manilaDay(isoTime: string): string {
  return new Date(isoTime).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" })
}

/** The hour of the day (0-23) in Manila of a UTC time. */
export function manilaHour(isoTime: string): number {
  return Number(new Date(isoTime).toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Manila" }))
}
