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

/**
 * Where each level starts for rain. These are the same limits the backend's flood risk rules use
 * (backend/agents/flood_risk_agent.py), which follow PAGASA's yellow, orange and red rainfall warnings.
 */
const PEAK_RAIN_MM_PER_HOUR = { watch: 7.5, high: 15, critical: 30 }
const TOTAL_RAIN_MM_PER_DAY = { watch: 40, high: 75, critical: 150 }

/** The level a given amount of rain reaches: low when it is under the first limit. */
function levelFromLimits(value: number, limits: { watch: number; high: number; critical: number }): FloodLevel {
  if (value >= limits.critical) return "critical"
  if (value >= limits.high) return "high"
  if (value >= limits.watch) return "watch"
  return "low"
}

/** The rain level of a forecast: the higher of its peak hour (mm per hour) and its total over 24 hours (mm). */
export function forecastRainLevel(peakMmPerHour: number, totalMm: number): FloodLevel {
  const fromPeak = levelFromLimits(peakMmPerHour, PEAK_RAIN_MM_PER_HOUR)
  const fromTotal = levelFromLimits(totalMm, TOTAL_RAIN_MM_PER_DAY)
  return LEVEL_ORDER.indexOf(fromPeak) >= LEVEL_ORDER.indexOf(fromTotal) ? fromPeak : fromTotal
}

/** How the river changed from the day before: "Rising 12% since the day before", "Falling …" or "Steady". */
export function describeFlowChange(previous: number | null | undefined, latest: number | null | undefined): { arrow: string; text: string } {
  if (previous === null || previous === undefined || latest === null || latest === undefined || previous <= 0) {
    return { arrow: "→", text: "Change not known" }
  }
  const percent = Math.round(((latest - previous) / previous) * 100)
  if (Math.abs(percent) < 5) return { arrow: "→", text: "Steady since the day before" }
  return percent > 0
    ? { arrow: "↗", text: `Rising ${percent}% since the day before` }
    : { arrow: "↘", text: `Falling ${Math.abs(percent)}% since the day before` }
}
