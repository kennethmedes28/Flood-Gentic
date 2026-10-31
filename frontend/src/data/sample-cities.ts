/** Flood risk levels used by the list and the map. */
export type Risk = "low" | "moderate" | "high"

export type CityReading = {
  name: string
  risk: Risk
  waterLevelM: number
  /** Map position (latitude, longitude). */
  lat: number
  lng: number
}

/** Each risk pairs a label and a symbol with its colour, never colour alone. */
export const RISK_STYLE: Record<Risk, { label: string; symbol: string; color: string }> = {
  low: { label: "Low", symbol: "●", color: "#16a34a" },
  moderate: { label: "Moderate", symbol: "▲", color: "#d97706" },
  high: { label: "High", symbol: "■", color: "#dc2626" },
}

/** SAMPLE data: replace with real city readings. */
export const CITIES: CityReading[] = [
  { name: "Marikina", risk: "high", waterLevelM: 15.2, lat: 14.65, lng: 121.102 },
  { name: "Quezon City", risk: "moderate", waterLevelM: 8.4, lat: 14.676, lng: 121.044 },
  { name: "Manila", risk: "moderate", waterLevelM: 6.1, lat: 14.599, lng: 120.984 },
  { name: "Pasig", risk: "low", waterLevelM: 3.2, lat: 14.576, lng: 121.085 },
]

/** Where the map starts: Quezon City. */
export const DEFAULT_CENTER = { lat: 14.65, lng: 121.04 }
