import { API_URL } from "@/lib/chat-api"

/**
 * The live weather from the backend (GET /weather/stream). The backend fetches Tomorrow.io once a day, keeps it in
 * Supabase and streams it as server-sent events, so the browser never talks to Tomorrow.io and never sees its key.
 */

/** One hour or one day of the forecast: its start time (UTC, ISO text) and the values, in metric units. */
export type ForecastEntry = {
  time: string
  values: Record<string, number | null>
}

export type CityForecast = {
  /** The backend's name for the city, for example "quezon city". */
  city: string
  /** The Manila day the forecast was fetched, for example "2026-11-01". */
  fetchedOn: string
  /** The entry for the current hour, or null when the forecast has run out. */
  now: ForecastEntry | null
  hourly: ForecastEntry[]
  daily: ForecastEntry[]
}

/** The shape of a city in the backend's answer (snake_case). */
type ApiCityForecast = {
  city: string
  fetched_on: string
  now: ForecastEntry | null
  hourly: ForecastEntry[]
  daily: ForecastEntry[]
}

type StreamHandlers = {
  /** The whole stored forecast: at the start, and again when a new day begins. */
  onSnapshot: (cities: CityForecast[]) => void
  /** Every minute: the entry for the current hour of each city. */
  onTick: (nows: { city: string; now: ForecastEntry | null }[]) => void
  /** The stream is connected (also after an automatic reconnect). */
  onOpen: () => void
  /** The connection broke. The browser keeps trying by itself; `permanent` is true when it has given up. */
  onConnectionLost: (permanent: boolean) => void
}

/** Open the live weather stream. Returns a function that closes it. */
export function openWeatherStream(cityKeys: string[], handlers: StreamHandlers): () => void {
  const source = new EventSource(`${API_URL}/weather/stream?cities=${encodeURIComponent(cityKeys.join(","))}`)

  source.onopen = handlers.onOpen
  source.onerror = () => handlers.onConnectionLost(source.readyState === EventSource.CLOSED)

  source.addEventListener("snapshot", (event) => {
    const body = JSON.parse((event as MessageEvent<string>).data) as { cities: ApiCityForecast[] }
    handlers.onSnapshot(
      body.cities.map((city) => ({
        city: city.city,
        fetchedOn: city.fetched_on,
        now: city.now,
        hourly: city.hourly,
        daily: city.daily,
      }))
    )
  })

  source.addEventListener("tick", (event) => {
    const body = JSON.parse((event as MessageEvent<string>).data) as { cities: { city: string; now: ForecastEntry | null }[] }
    handlers.onTick(body.cities)
  })

  // The backend closes a stream after a while ("end") and on a problem ("problem"). Closing here would stop the
  // browser's automatic reconnect, so "end" is left alone: the browser opens a fresh stream and gets a fresh snapshot.
  source.addEventListener("problem", () => handlers.onConnectionLost(false))

  return () => source.close()
}
