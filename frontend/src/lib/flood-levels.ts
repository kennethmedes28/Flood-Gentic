/**
 * Flood levels, lowest first. These are the same four levels the backend's flood risk agent uses
 * (low, watch, high, critical), and the advice is its wording, so the page and the assistant agree.
 */
export type FloodLevel = "low" | "watch" | "high" | "critical"

export const LEVEL_ORDER: FloodLevel[] = ["low", "watch", "high", "critical"]

/**
 * Each level pairs a label and a symbol with its colour, never colour alone.
 * The colours are dark enough for white text on them (contrast of at least 4.5 to 1).
 */
export const LEVEL_STYLE: Record<FloodLevel, { label: string; symbol: string; color: string; advice: string }> = {
  low: {
    label: "Low",
    symbol: "●",
    color: "#15803d",
    advice: "No flood signal right now. Keep checking pagasa.dost.gov.ph.",
  },
  watch: {
    label: "Watch",
    symbol: "▲",
    color: "#b45309",
    advice: "Flooding is possible in low areas. Prepare your go bag and know your nearest evacuation center.",
  },
  high: {
    label: "High",
    symbol: "■",
    color: "#dc2626",
    advice: "Flooding is likely. Move valuables up, avoid low roads, and be ready to leave.",
  },
  critical: {
    label: "Critical",
    symbol: "◆",
    color: "#7e22ce",
    advice: "Serious flooding is expected. Follow your DRRMO's evacuation orders now.",
  },
}

/** A place where the water height is measured. All values are in metres. */
export type Station = {
  id: string
  /** The river or water body and the city, for the picker. */
  name: string
  /** Short name used in sentences. */
  place: string
  currentM: number
  /** How fast the water is rising (positive), falling (negative) or staying (0), in metres per hour. */
  trendMPerHour: number
  /** The height at which each level begins. */
  watchM: number
  highM: number
  criticalM: number
}

/** The level the water is at, for a height in metres. */
export function levelAt(station: Station, heightM: number): FloodLevel {
  if (heightM >= station.criticalM) return "critical"
  if (heightM >= station.highM) return "high"
  if (heightM >= station.watchM) return "watch"
  return "low"
}

/** The scale of the gauge: a little above the critical mark. */
export function gaugeMaxM(station: Station): number {
  return Math.ceil(station.criticalM * 1.15)
}

/** The next level above the current one and the height where it starts, or null when already critical. */
export function nextLevelUp(station: Station): { level: FloodLevel; atM: number } | null {
  const now = levelAt(station, station.currentM)
  if (now === "low") return { level: "watch", atM: station.watchM }
  if (now === "watch") return { level: "high", atM: station.highM }
  if (now === "high") return { level: "critical", atM: station.criticalM }
  return null
}

/**
 * Hours until the next level if the water keeps rising at today's pace, or null when it is not rising
 * or there is no higher level. This is a straight-line guess, not a forecast.
 */
export function hoursToNextLevel(station: Station): number | null {
  const next = nextLevelUp(station)
  if (!next || station.trendMPerHour <= 0) return null
  return (next.atM - station.currentM) / station.trendMPerHour
}

/** "Rising 12 cm per hour", "Falling 3 cm per hour" or "Steady". */
export function describeTrend(trendMPerHour: number): { word: string; arrow: string; text: string } {
  const centimetres = Math.round(Math.abs(trendMPerHour) * 100)
  if (centimetres === 0) return { word: "Steady", arrow: "→", text: "Steady" }
  return trendMPerHour > 0
    ? { word: "Rising", arrow: "↗", text: `Rising ${centimetres} cm per hour` }
    : { word: "Falling", arrow: "↘", text: `Falling ${centimetres} cm per hour` }
}

/** "about 1 h 40 min" for a number of hours. */
export function describeDuration(hours: number): string {
  const totalMinutes = Math.max(1, Math.round(hours * 60))
  const wholeHours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (wholeHours === 0) return `about ${minutes} min`
  return minutes === 0 ? `about ${wholeHours} h` : `about ${wholeHours} h ${minutes} min`
}
