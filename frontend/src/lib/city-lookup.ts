import { CITIES, type CityReading } from "@/data/dashboard-cities"
import { distanceKm } from "@/lib/geo"

/** A position counts as being in one of these cities only when it is this close (km); the dashboard covers Metro Manila. */
const MAX_MATCH_KM = 20

/** The dashboard city with this name, if there is one. */
export function findCity(name: string): CityReading | undefined {
  return CITIES.find((city) => city.name === name)
}

/** The dashboard city nearest to a position, or null when none is within MAX_MATCH_KM (the user is outside Metro Manila). */
export function nearestCity(lat: number, lng: number): CityReading | null {
  let best: CityReading | null = null
  let bestKm = MAX_MATCH_KM
  for (const city of CITIES) {
    const km = distanceKm(lat, lng, city.lat, city.lng)
    if (km <= bestKm) {
      best = city
      bestKm = km
    }
  }
  return best
}
