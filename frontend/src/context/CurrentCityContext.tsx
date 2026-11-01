"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

import { CITIES, DEFAULT_CITY_NAME, type CityReading } from "@/data/dashboard-cities"
import { findCity } from "@/lib/city-lookup"
import { locate, readSaved, save, type Located } from "@/lib/current-location"

type CurrentCityValue = {
  /** The city the dashboard is about: the default one, or the one nearest to the user while sharing. */
  city: CityReading
  /** True while the user has chosen to share their location. */
  sharing: boolean
  /** True when the user shares their location but it is outside Metro Manila, so the default city is shown. */
  outside: boolean
  /** True while the browser is finding the position. */
  locating: boolean
  /** A short sentence about what just happened (for example why sharing was turned off), or "". */
  note: string
  /** Turn sharing on (asks the browser, only now) or off (back to the default city). */
  setSharing: (on: boolean) => void
}

const defaultCity = findCity(DEFAULT_CITY_NAME) ?? CITIES[0]

/** Used outside the provider (for example the loading page), where the default city is all that is needed. */
const FALLBACK: CurrentCityValue = {
  city: defaultCity,
  sharing: false,
  outside: false,
  locating: false,
  note: "",
  setSharing: () => {},
}

const CurrentCityContext = createContext<CurrentCityValue>(FALLBACK)

/** Shown when the position is outside what the dashboard covers. Sharing stays on; the default city is shown. */
const OUTSIDE_NOTE = `You're outside Metro Manila, which this dashboard covers, so it shows ${DEFAULT_CITY_NAME}.`

/** Why sharing was turned off again. */
const NOT_SHARED_NOTES: Record<Exclude<Located["kind"], "city" | "outside">, string> = {
  unsupported: "Your browser can't share a location.",
  denied: `Location not shared. The dashboard shows ${DEFAULT_CITY_NAME}.`,
  failed: "Couldn't find your location. Please try again.",
}

/**
 * Whether the user shares their location, and the city the dashboard shows because of it.
 *
 * Sharing is off at first, so the dashboard shows Manila City and the browser is never asked for the position.
 * Turning it on asks the browser once, and the nearest dashboard city is shown. If the position is outside Metro
 * Manila, sharing stays on but the dashboard shows the default city (Manila City) and says why. If sharing cannot work
 * at all (refused, no signal, unsupported) it turns itself off again with a message. The choice is remembered; after a
 * reload the saved city is shown, and if the browser already allows location for this site the nearest city is
 * quietly checked again (no prompt, no message).
 */
export function CurrentCityProvider({ children }: { children: React.ReactNode }) {
  const [cityName, setCityName] = useState(DEFAULT_CITY_NAME)
  const [sharing, setSharingState] = useState(false)
  const [outside, setOutside] = useState(false)
  const [locating, setLocating] = useState(false)
  const [note, setNote] = useState("")

  // Restore the choice after the page has loaded (storage can be unavailable).
  useEffect(() => {
    const restore = async () => {
      const saved = readSaved()
      if (!saved) return
      setSharingState(true)
      setCityName(saved.city ?? DEFAULT_CITY_NAME)
      setOutside(saved.city === null)

      // A permission the user gave earlier is remembered by the browser: then it is safe to look again without a prompt.
      try {
        const permission = await navigator.permissions?.query({ name: "geolocation" })
        if (permission?.state !== "granted") return
        const result = await locate()
        if (result.kind === "city" || result.kind === "outside") {
          const name = result.kind === "city" ? result.city.name : null
          setCityName(name ?? DEFAULT_CITY_NAME)
          setOutside(name === null)
          save({ city: name })
        }
      } catch {
        // Ignore: the saved city stays.
      }
    }
    void restore()
  }, [])

  const setSharing = useCallback(async (on: boolean) => {
    if (!on) {
      setSharingState(false)
      setOutside(false)
      setCityName(DEFAULT_CITY_NAME)
      setNote("")
      save(undefined)
      return
    }

    setLocating(true)
    setNote("Finding your location…")
    const result = await locate()
    setLocating(false)

    if (result.kind === "city" || result.kind === "outside") {
      // The user shared, so sharing stays on. Outside Metro Manila there is no nearby city: the default one is shown.
      setSharingState(true)
      setOutside(result.kind === "outside")
      setCityName(result.kind === "city" ? result.city.name : DEFAULT_CITY_NAME)
      setNote(result.kind === "outside" ? OUTSIDE_NOTE : "")
      save({ city: result.kind === "city" ? result.city.name : null })
    } else {
      setSharingState(false)
      setOutside(false)
      setCityName(DEFAULT_CITY_NAME)
      setNote(NOT_SHARED_NOTES[result.kind])
      save(undefined)
    }
  }, [])

  const value = useMemo<CurrentCityValue>(
    () => ({ city: findCity(cityName) ?? defaultCity, sharing, outside, locating, note, setSharing }),
    [cityName, sharing, outside, locating, note, setSharing]
  )

  return <CurrentCityContext.Provider value={value}>{children}</CurrentCityContext.Provider>
}

export function useCurrentCity(): CurrentCityValue {
  return useContext(CurrentCityContext)
}
