"use client"

import { useElementWidth } from "@/hooks/useElementWidth"
import { LEVEL_STYLE } from "@/lib/flood-levels"
import { shortDate } from "@/lib/rain-words"

const CHART_HEIGHT = 210
const MARGIN = { top: 14, right: 12, bottom: 28, left: 44 }
/** The "high river" line is drawn when it is at most this many times the highest recorded reading shown. */
const MAX_HIGH_LINE_TIMES_READINGS = 3

type FlowChartProps = {
  /** The recorded days, oldest first. */
  days: { date: string; riverFlowM3s: number | null }[]
  /** The flow from which the river counts as high for this city, or null. */
  highFlowM3s: number | null
}

/** The river's flow over the recorded days as a line, with a dashed line where the flow counts as high. */
export function FlowChart({ days, highFlowM3s }: FlowChartProps) {
  const { ref, width } = useElementWidth<HTMLDivElement>()
  const points = days.filter((day): day is { date: string; riverFlowM3s: number } => day.riverFlowM3s !== null)

  if (points.length < 2) {
    return (
      <p className="text-base" style={{ color: "var(--glass-text-muted)" }}>
        Not enough river readings for a chart.
      </p>
    )
  }

  // The range shown: from zero up to the highest reading, with a little room. The "high" line is drawn only when it is
  // not far above the readings: for some cities it is hundreds of times a normal day and would flatten the line.
  const highestReading = Math.max(...points.map((point) => point.riverFlowM3s))
  const showHighLine = highFlowM3s !== null && highFlowM3s <= highestReading * MAX_HIGH_LINE_TIMES_READINGS
  const maxFlow = Math.max(highestReading, showHighLine ? highFlowM3s : 0) * 1.1 || 1
  const plotWidth = Math.max(120, width - MARGIN.left - MARGIN.right)
  const plotHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom
  const x = (index: number) => MARGIN.left + (index / (points.length - 1)) * plotWidth
  const y = (flow: number) => MARGIN.top + (1 - flow / maxFlow) * plotHeight

  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)} ${y(point.riverFlowM3s).toFixed(1)}`).join(" ")
  const area = `${line} L${x(points.length - 1).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)} Z`
  const last = points[points.length - 1]
  const color = LEVEL_STYLE[highFlowM3s !== null && last.riverFlowM3s >= highFlowM3s ? "high" : "low"].color

  const first = points[0]
  const summary =
    `River flow over the last ${points.length} recorded days, from ${first.riverFlowM3s.toFixed(1)} to ${last.riverFlowM3s.toFixed(1)} cubic metres per second.` +
    (highFlowM3s === null ? "" : ` The river counts as high from ${highFlowM3s.toFixed(1)}.`)

  const labels = [
    { index: 0, text: shortDate(first.date), anchor: "start" as const },
    { index: Math.floor((points.length - 1) / 2), text: shortDate(points[Math.floor((points.length - 1) / 2)].date), anchor: "middle" as const },
    { index: points.length - 1, text: shortDate(last.date), anchor: "end" as const },
  ]

  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={CHART_HEIGHT} role="img" aria-label={summary} className="block">
        {/* Flow scale at the left. */}
        {[0, maxFlow / 2, maxFlow].map((flow) => (
          <text key={flow} x={MARGIN.left - 8} y={y(flow) + 4} fontSize={12} textAnchor="end" fill="currentColor" opacity={0.75}>
            {flow.toFixed(flow < 10 ? 1 : 0)}
          </text>
        ))}

        {highFlowM3s !== null && !showHighLine && (
          <text x={MARGIN.left + plotWidth - 4} y={MARGIN.top + 2} textAnchor="end" fontSize={12} fill="currentColor">
            High river starts at {highFlowM3s.toFixed(1)} m³/s (off this chart)
          </text>
        )}

        {showHighLine && highFlowM3s !== null && (
          <g>
            <line
              x1={MARGIN.left}
              x2={MARGIN.left + plotWidth}
              y1={y(highFlowM3s)}
              y2={y(highFlowM3s)}
              stroke={LEVEL_STYLE.high.color}
              strokeDasharray="5 4"
              strokeWidth={1.5}
            />
            <text x={MARGIN.left + plotWidth - 4} y={y(highFlowM3s) - 5} textAnchor="end" fontSize={12} fill="currentColor">
              High river from {highFlowM3s.toFixed(1)} m³/s
            </text>
          </g>
        )}

        <path d={area} fill={color} opacity={0.22} />
        <path d={line} fill="none" stroke={color} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(points.length - 1)} cy={y(last.riverFlowM3s)} r={6} fill={color} stroke="white" strokeWidth={2} />

        {labels.map((label) => (
          <text key={label.index} x={x(label.index)} y={CHART_HEIGHT - 8} fontSize={12} textAnchor={label.anchor} fill="currentColor" opacity={0.75}>
            {label.text}
          </text>
        ))}
      </svg>
    </div>
  )
}
