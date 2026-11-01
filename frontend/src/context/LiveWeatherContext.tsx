"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"

import { CITIES } from "@/data/dashboard-cities"
import { openWeatherStream, type CityForecast } from "@/lib/live-weather-api"

type LiveWeatherValue = {
  /** connecting: waiting for the first data; live: streaming; reconnecting: the connection broke, the browser retries;
   *  unavailable: the browser gave up. */
  status: "connecting" | "live" | "reconnecting" | "unavailable"
  /** The stored forecast of one city by its backend key, or undefined when there is none (yet). */
  forecastFor: (key: string) => CityForecast | undefined
}

const EMPTY: LiveWeatherValue = { status: "connecting", forecastFor: () => undefined }

const LiveWeatherContext = createContext<LiveWeatherValue>(EMPTY)

/**
 * Keeps the live weather stream (GET /weather/stream) open for the dashboard cities and shares what it sends.
 * The stream is opened when the page opens, so the data is usually ready by the time the intro animation ends.
 * If the connection drops the browser reconnects by itself and the last data stays on screen meanwhile.
 */
export function LiveWeatherProvider({ children }: { children: React.ReactNode }) {
  const [forecasts, setForecasts] = useState<Map<string, CityForecast>>(new Map())
  const [status, setStatus] = useState<LiveWeatherValue["status"]>("connecting")

  useEffect(() => {
    const close = openWeatherStream(
      CITIES.map((city) => city.key),
      {
        onOpen: () => setStatus("live"),
        onConnectionLost: (permanent) => setStatus(permanent ? "unavailable" : "reconnecting"),
        onSnapshot: (cities) => setForecasts(new Map(cities.map((city) => [city.city, city]))),
        onTick: (nows) =>
          setForecasts((current) => {
            const next = new Map(current)
            for (const { city, now } of nows) {
              const existing = next.get(city)
              if (existing) next.set(city, { ...existing, now })
            }
            return next
          }),
      }
    )
    return close
  }, [])

  const value = useMemo<LiveWeatherValue>(
    () => ({ status, forecastFor: (key) => forecasts.get(key) }),
    [status, forecasts]
  )

  return <LiveWeatherContext.Provider value={value}>{children}</LiveWeatherContext.Provider>
}

export function useLiveWeather(): LiveWeatherValue {
  return useContext(LiveWeatherContext)
}
