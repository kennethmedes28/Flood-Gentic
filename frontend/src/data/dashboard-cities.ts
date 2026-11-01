/** A place on the dashboard. Its weather and risk come from the backend (see DashboardDataContext). */
export type CityReading = {
  name: string
  /** The name the backend uses for the city, for example "quezon city". */
  key: string
  /** Map position (latitude, longitude). */
  lat: number
  lng: number
}

/** The cities on the dashboard. */
export const CITIES: CityReading[] = [
  { name: "Marikina", key: "marikina", lat: 14.65, lng: 121.102 },
  { name: "Quezon City", key: "quezon city", lat: 14.676, lng: 121.044 },
  { name: "Manila City", key: "manila", lat: 14.599, lng: 120.984 },
  { name: "Pasig", key: "pasig", lat: 14.576, lng: 121.085 },
]

/** The city the dashboard shows until the user shares a location. */
export const DEFAULT_CITY_NAME = "Manila City"
