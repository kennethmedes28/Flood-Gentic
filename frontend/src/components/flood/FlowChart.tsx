"use client"

import { useLanguage } from "@/context/LanguageContext"
import { useElementWidth } from "@/hooks/useElementWidth"
import { LEVEL_STYLE, type FloodLevel } from "@/lib/flood-levels"
import { shortDate } from "@/lib/rain-words"

const CHART_HEIGHT = 210
const MARGIN = { top: 14, right: 12, bottom: 28, left: 44 }

type FlowChartProps = {
  /** The recorded days, oldest first. */
  days: { date: string; riverFlowM3s: number | null }[]
  /** The flood risk level, which sets the colour of the line. */
  level: FloodLevel | null
}

/** The river's flow over the recorded days as a line. */
export function FlowChart({ days, level }: FlowChartProps) {
  const { t, locale } = useLanguage()
  const { ref, width } = useElementWidth<HTMLDivElement>()
  const points = days.filter((day): day is { date: string; riverFlowM3s: number } => day.riverFlowM3s !== null)

  if (points.length < 2) {
    return (
      <p className="text-base" style={{ color: "var(--glass-text-muted)" }}>
        {t("chart.notEnough")}
      </p>
    )
  }

  // The range shown: from zero up to the highest reading, with a little room.
  const maxFlow = Math.max(...points.map((point) => point.riverFlowM3s)) * 1.1 || 1
  const plotWidth = Math.max(120, width - MARGIN.left - MARGIN.right)
  const plotHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom
  const x = (index: number) => MARGIN.left + (index / (points.length - 1)) * plotWidth
  const y = (flow: number) => MARGIN.top + (1 - flow / maxFlow) * plotHeight

  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)} ${y(point.riverFlowM3s).toFixed(1)}`).join(" ")
  const area = `${line} L${x(points.length - 1).toFixed(1)} ${y(0)} L${x(0).toFixed(1)} ${y(0)} Z`
  const last = points[points.length - 1]
  const color = LEVEL_STYLE[level ?? "low"].color

  const first = points[0]
  const summary =
    t("chart.summary", { days: points.length, first: first.riverFlowM3s.toFixed(1), last: last.riverFlowM3s.toFixed(1) })

  const labels = [
    { index: 0, text: shortDate(first.date, locale), anchor: "start" as const },
    { index: Math.floor((points.length - 1) / 2), text: shortDate(points[Math.floor((points.length - 1) / 2)].date, locale), anchor: "middle" as const },
    { index: points.length - 1, text: shortDate(last.date, locale), anchor: "end" as const },
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
