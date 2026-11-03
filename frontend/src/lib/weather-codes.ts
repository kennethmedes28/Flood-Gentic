import type { MessageKey } from "@/i18n/messages"

/** What a Tomorrow.io weather code looks like and is called. `text` is a key of the interface texts (translate it with `t`). */
export type WeatherLook = { icon: string; text: MessageKey }

const UNKNOWN: WeatherLook = { icon: "❔", text: "sky.unknown" }

/** The codes Tomorrow.io documents, grouped by what they look like. */
const LOOKS: [number[], WeatherLook][] = [
  [[1000], { icon: "☀️", text: "sky.clear" }],
  [[1100], { icon: "🌤️", text: "sky.mostlyClear" }],
  [[1101], { icon: "⛅", text: "sky.partlyCloudy" }],
  [[1102], { icon: "🌥️", text: "sky.mostlyCloudy" }],
  [[1001], { icon: "☁️", text: "sky.cloudy" }],
  [[2000, 2100], { icon: "🌫️", text: "sky.fog" }],
  [[4000], { icon: "🌦️", text: "sky.drizzle" }],
  [[4200], { icon: "🌦️", text: "sky.lightRain" }],
  [[4001], { icon: "🌧️", text: "sky.rain" }],
  [[4201], { icon: "🌧️", text: "sky.heavyRain" }],
  [[8000], { icon: "⛈️", text: "sky.thunderstorm" }],
  [[5000, 5001, 5100, 5101], { icon: "❄️", text: "sky.snow" }],
  [[6000, 6001, 6200, 6201, 7000, 7101, 7102], { icon: "🧊", text: "sky.ice" }],
]

/** The icon and words for a weather code, or a neutral look when the code is missing or unknown. */
export function describeWeatherCode(code: number | null | undefined): WeatherLook {
  if (code === null || code === undefined) return UNKNOWN
  return LOOKS.find(([codes]) => codes.includes(code))?.[1] ?? UNKNOWN
}
