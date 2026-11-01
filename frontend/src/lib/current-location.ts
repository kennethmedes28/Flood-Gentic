import { findCity, nearestCity } from "@/lib/city-lookup"
import type { CityReading } from "@/data/dashboard-cities"

/** Where the "share my location" choice is remembered in the browser. */
const STORAGE_KEY = "floodguard:share-location"

/** What came of asking the browser for the position. */
export type Located =
  | { kind: "city"; city: CityReading }
  | { kind: "outside" }
  | { kind: "denied" }
  | { kind: "failed" }
  | { kind: "unsupported" }

/** Ask the browser where the user is and match it to the nearest dashboard city. The position itself is not kept. */
export function locate(): Promise<Located> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ kind: "unsupported" })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const city = nearestCity(position.coords.latitude, position.coords.longitude)
        resolve(city ? { kind: "city", city } : { kind: "outside" })
      },
      (failure) => resolve({ kind: failure.code === failure.PERMISSION_DENIED ? "denied" : "failed" }),
      { timeout: 10_000 }
    )
  })
}

/**
 * What was saved while sharing was on: the nearest dashboard city, or null when the user was outside Metro Manila.
 * Returns undefined when sharing was off (nothing saved). Older versions saved only a city name; that still works.
 */
export function readSaved(): { city: string | null } | undefined {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (!saved) return undefined
    const name = saved.startsWith("{") ? (JSON.parse(saved) as { city?: string | null }).city : saved
    return { city: name && findCity(name) ? name : null }
  } catch {
    return undefined
  }
}

/** Remember that sharing is on, with the nearest city (null when outside Metro Manila), or forget it (undefined). */
export function save(sharing: { city: string | null } | undefined) {
  try {
    if (sharing) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sharing))
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Ignore: the choice just won't persist.
  }
}

