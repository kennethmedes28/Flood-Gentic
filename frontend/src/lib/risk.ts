import { LEVEL_STYLE, type FloodLevel } from "@/lib/flood-levels"

/** Flood risk levels, the same four the backend's flood risk rules use. */
export type Risk = FloodLevel

/** Each risk pairs a label and a symbol with its colour, never colour alone. */
export const RISK_STYLE: Record<Risk, { label: string; symbol: string; color: string }> = {
  low: { label: LEVEL_STYLE.low.label, symbol: LEVEL_STYLE.low.symbol, color: LEVEL_STYLE.low.color },
  watch: { label: LEVEL_STYLE.watch.label, symbol: LEVEL_STYLE.watch.symbol, color: LEVEL_STYLE.watch.color },
  high: { label: LEVEL_STYLE.high.label, symbol: LEVEL_STYLE.high.symbol, color: LEVEL_STYLE.high.color },
  critical: { label: LEVEL_STYLE.critical.label, symbol: LEVEL_STYLE.critical.symbol, color: LEVEL_STYLE.critical.color },
}

/** Shown instead of a risk level when the backend could not work one out. */
export const NO_RISK_STYLE = { label: "No data", symbol: "?", color: "#475569" }

/** The look of a risk level, or the "No data" look when there is none. */
export function riskLook(risk: Risk | null | undefined) {
  return risk ? RISK_STYLE[risk] : NO_RISK_STYLE
}

/** River flow as text, for example "6.6 m³/s", or a plain word when it could not be read. */
export function describeFlow(flowM3s: number | null | undefined): string {
  return flowM3s === null || flowM3s === undefined ? "No river data" : `${flowM3s.toFixed(1)} m³/s`
}
