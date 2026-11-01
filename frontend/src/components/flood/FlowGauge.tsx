import { LEVEL_STYLE } from "@/lib/flood-levels"

/** Height of the glass tube. */
const TUBE_HEIGHT = "h-72"

type FlowGaugeProps = {
  /** River flow in cubic metres per second. */
  flowM3s: number
  /** 0 to 1: the share of days since 2020 on which this city's flow was lower. */
  percentile: number
  /** The flow from which the river counts as high for this city, or null when it is not known. */
  highFlowM3s: number | null
  /** The share of days (0 to 1) from which the river counts as high. */
  highFromPercentile: number
}

/**
 * A glass tube that shows how high the river is for THIS city: it is filled to the flow's place among all the days since
 * 2020 (half full = a middling day), with a mark where the river counts as high. Raw flow is not used for the height,
 * because storm days are hundreds of times a normal day and a straight scale would leave the water at the very bottom.
 * The flow is written next to the water and the mark is labelled, so the colours are never the only clue.
 * This is a flow in m³/s, not a water height: there is no height in the data.
 */
export function FlowGauge({ flowM3s, percentile, highFlowM3s, highFromPercentile }: FlowGaugeProps) {
  const isHigh = percentile >= highFromPercentile
  const color = LEVEL_STYLE[isHigh ? "high" : "low"].color
  const fillPercent = Math.min(100, Math.max(0, percentile * 100))
  const markPercent = highFromPercentile * 100

  const summary =
    `River flow ${flowM3s.toFixed(1)} cubic metres per second, higher than ${Math.round(percentile * 100)} percent of the days since 2020.` +
    (highFlowM3s === null ? "" : ` The river counts as high from ${highFlowM3s.toFixed(1)}. It is ${isHigh ? "above" : "below"} that.`)

  return (
    <div className="flex items-stretch justify-center gap-3" role="img" aria-label={summary}>
      {/* Left: the current flow, level with the water surface. */}
      <div className={`relative w-24 shrink-0 ${TUBE_HEIGHT}`} aria-hidden="true">
        <span
          className="absolute right-0 translate-y-1/2 rounded-md px-2 py-0.5 text-sm font-semibold whitespace-nowrap tabular-nums text-white [text-shadow:none]"
          style={{ bottom: `${fillPercent}%`, background: color }}
        >
          {flowM3s.toFixed(1)} m³/s
        </span>
      </div>

      {/* The tube, with the water and the mark. */}
      <div className={`relative w-20 shrink-0 ${TUBE_HEIGHT}`} aria-hidden="true">
        <div className="absolute inset-0 overflow-hidden rounded-[2.5rem] border-2 border-white/70 bg-white/20 shadow-inner">
          <div
            className="absolute inset-x-0 bottom-0 transition-[height] duration-700 ease-out motion-reduce:transition-none"
            style={{ height: `${fillPercent}%`, background: `linear-gradient(180deg, ${color}e6, ${color})` }}
          >
            {/* A slow ripple along the surface (still when the device asks for less motion). */}
            <svg className="water-surface absolute -top-2 left-0 h-3 w-[200%]" viewBox="0 0 200 12" preserveAspectRatio="none">
              <path d="M0 6 Q12.5 0 25 6 T50 6 T75 6 T100 6 T125 6 T150 6 T175 6 T200 6 V12 H0 Z" fill={color} />
            </svg>
          </div>
        </div>
        <span className="absolute inset-x-0 border-t-2 border-dashed" style={{ bottom: `${markPercent}%`, borderColor: LEVEL_STYLE.high.color }} />
      </div>

      {/* Right: what the mark means. */}
      <div className={`relative w-36 shrink-0 ${TUBE_HEIGHT}`} aria-hidden="true">
        <span className="absolute left-0 flex translate-y-1/2 flex-col text-sm leading-tight" style={{ bottom: `${markPercent}%` }}>
          <span className="font-semibold">High river</span>
          <span style={{ color: "var(--glass-text-muted)" }}>the top {Math.round(100 - markPercent)}% of days</span>
          {highFlowM3s !== null && (
            <span className="tabular-nums" style={{ color: "var(--glass-text-muted)" }}>
              from {highFlowM3s.toFixed(1)} m³/s
            </span>
          )}
        </span>
      </div>
    </div>
  )
}
