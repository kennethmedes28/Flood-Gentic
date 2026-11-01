/** A place on the dashboard. Its weather and risk come from the backend (see DashboardDataContext). */
export type CityReading = {
  name: string
  /** The name the backend uses for the city, for example "quezon city". */
  key: string
  /** Map position (latitude, longitude). */
  lat: number
  lng: number
}

/** The cities on the dashboard: all 17 of Metro Manila. The names match the evacuation and contact data. */
export const CITIES: CityReading[] = [
  { name: "Caloocan City", key: "caloocan", lat: 14.6488, lng: 120.983 },
  { name: "Las Piñas City", key: "las pinas", lat: 14.4445, lng: 120.9939 },
  { name: "Makati City", key: "makati", lat: 14.5547, lng: 121.0244 },
  { name: "Malabon City", key: "malabon", lat: 14.6625, lng: 120.9568 },
  { name: "Mandaluyong City", key: "mandaluyong", lat: 14.5794, lng: 121.0359 },
  { name: "Manila City", key: "manila", lat: 14.5995, lng: 120.9842 },
  { name: "Marikina City", key: "marikina", lat: 14.6507, lng: 121.1029 },
  { name: "Muntinlupa City", key: "muntinlupa", lat: 14.4081, lng: 121.0415 },
  { name: "Navotas City", key: "navotas", lat: 14.6667, lng: 120.9417 },
  { name: "Parañaque City", key: "paranaque", lat: 14.4793, lng: 121.0198 },
  { name: "Pasay City", key: "pasay", lat: 14.5378, lng: 121.0014 },
  { name: "Pasig City", key: "pasig", lat: 14.5764, lng: 121.0851 },
  { name: "Pateros", key: "pateros", lat: 14.5454, lng: 121.0687 },
  { name: "Quezon City", key: "quezon city", lat: 14.676, lng: 121.0437 },
  { name: "San Juan City", key: "san juan", lat: 14.6019, lng: 121.0355 },
  { name: "Taguig City", key: "taguig", lat: 14.5176, lng: 121.0509 },
  { name: "Valenzuela City", key: "valenzuela", lat: 14.7011, lng: 120.983 },
]

/** The city the dashboard shows until the user shares a location. */
export const DEFAULT_CITY_NAME = "Manila City"
