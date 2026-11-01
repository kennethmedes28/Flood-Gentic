const EARTH_RADIUS_KM = 6371

/** Straight-line distance between two points in kilometres (haversine formula). */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const dLat = toRadians(bLat - aLat)
  const dLng = toRadians(bLng - aLng)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(aLat)) * Math.cos(toRadians(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a))
}

/** "850 m" under a kilometre, "2.3 km" above. */
export function formatDistance(km: number): string {
  return km < 1 ? `${Math.round((km * 1000) / 10) * 10} m` : `${km.toFixed(1)} km`
}
