/** What a Tomorrow.io weather code looks like and is called. */
export type WeatherLook = { icon: string; text: string }

const UNKNOWN: WeatherLook = { icon: "❔", text: "Weather unavailable" }

/** The codes Tomorrow.io documents, grouped by what they look like. */
const LOOKS: [number[], WeatherLook][] = [
  [[1000], { icon: "☀️", text: "Clear" }],
  [[1100], { icon: "🌤️", text: "Mostly clear" }],
  [[1101], { icon: "⛅", text: "Partly cloudy" }],
  [[1102], { icon: "🌥️", text: "Mostly cloudy" }],
  [[1001], { icon: "☁️", text: "Cloudy" }],
  [[2000, 2100], { icon: "🌫️", text: "Fog" }],
  [[4000], { icon: "🌦️", text: "Drizzle" }],
  [[4200], { icon: "🌦️", text: "Light rain" }],
  [[4001], { icon: "🌧️", text: "Rain" }],
  [[4201], { icon: "🌧️", text: "Heavy rain" }],
  [[8000], { icon: "⛈️", text: "Thunderstorm" }],
  [[5000, 5001, 5100, 5101], { icon: "❄️", text: "Snow" }],
  [[6000, 6001, 6200, 6201, 7000, 7101, 7102], { icon: "🧊", text: "Freezing rain or ice" }],
]

/** The icon and words for a weather code, or a neutral look when the code is missing or unknown. */
export function describeWeatherCode(code: number | null | undefined): WeatherLook {
  if (code === null || code === undefined) return UNKNOWN
  return LOOKS.find(([codes]) => codes.includes(code))?.[1] ?? UNKNOWN
}
