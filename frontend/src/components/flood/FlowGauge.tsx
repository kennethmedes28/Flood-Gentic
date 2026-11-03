import { useLanguage } from "@/context/LanguageContext"
import { LEVEL_STYLE, type FloodLevel } from "@/lib/flood-levels"

/** Height of the glass tube. */
const TUBE_HEIGHT = "h-72"

type FlowGaugeProps = {
  /** River flow in cubic metres per second. */
  flowM3s: number
  /** The lowest and highest flow of the last 7 recorded days (the flow itself is one of the 7). */
  lowM3s: number
  highM3s: number
  /** The flood risk level, which sets the colour of the water. */
  level: FloodLevel | null
}

/** A flow as a percentage of the tube, from the bottom. */
function percentOf(flowM3s: number, maxM3s: number): number {
  return Math.min(100, Math.max(0, (flowM3s / maxM3s) * 100))
}

/**
 * A glass tube filled up to the river's current flow, with a mark at the lowest and the highest flow of the last 7 days,
 * so it shows whether the river is up or down compared with the week. The flow is written next to the water and the
 * marks are labelled, so the colours are never the only clue.
 * This is a flow in m³/s, not a water height: there is no height in the data.
 */
export function FlowGauge({ flowM3s, lowM3s, highM3s, level }: FlowGaugeProps) {
  const { t } = useLanguage()
  const color = LEVEL_STYLE[level ?? "low"].color
  // The tube reaches a little above the week's highest flow, so the water never touches the top.
  const maxM3s = Math.max(highM3s * 1.15, flowM3s * 1.15, 0.1)
  const fillPercent = percentOf(flowM3s, maxM3s)
  const sameValue = Math.abs(highM3s - lowM3s) < 0.05 // a flat week: one mark is enough

  const marks = [
    { label: t("gauge.high"), flow: highM3s },
    ...(sameValue ? [] : [{ label: t("gauge.low"), flow: lowM3s }]),
  ]

  const summary = t("gauge.summary", { flow: flowM3s.toFixed(1), low: lowM3s.toFixed(1), high: highM3s.toFixed(1) })

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

      {/* The tube, with the water and the marks. */}
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
        {marks.map((mark) => (
          <span key={mark.label} className="absolute inset-x-0 border-t-2 border-dashed border-current opacity-60" style={{ bottom: `${percentOf(mark.flow, maxM3s)}%` }} />
        ))}
      </div>

      {/* Right: the name and flow of each mark. */}
      <div className={`relative w-32 shrink-0 ${TUBE_HEIGHT}`} aria-hidden="true">
        {marks.map((mark) => (
          <span
            key={mark.label}
            className="absolute left-0 flex translate-y-1/2 items-baseline gap-1.5 text-sm"
            style={{ bottom: `${percentOf(mark.flow, maxM3s)}%` }}
          >
            <span className="font-semibold">{mark.label}</span>
            <span className="tabular-nums" style={{ color: "var(--glass-text-muted)" }}>
              {mark.flow.toFixed(1)}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}
