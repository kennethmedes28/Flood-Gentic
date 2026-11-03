"use client"

import { useLanguage } from "@/context/LanguageContext"
import { periodLabel } from "@/lib/analytics-format"
import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import type { MetricKey } from "@/lib/analytics-format"
import type { Point } from "@/lib/analytics-api"

const CHART_HEIGHT = 320

/** Colours that stay readable on the light, dark and cyberpunk glass. */
const COLOR = {
  rain: "var(--glass-accent)",
  high: "#dc2626",
  low: "#2563eb",
  river: "#d97706",
  wind: "#7c3aed",
  gust: "#c026d3",
}

const AXIS = { tick: { fill: "var(--glass-text)", fontSize: 12 }, stroke: "var(--glass-text-muted)" }
const TOOLTIP = {
  contentStyle: { background: "rgba(11, 37, 69, 0.95)", border: "none", borderRadius: 12, color: "#fff" },
  labelStyle: { color: "#fff", fontWeight: 600 },
  itemStyle: { color: "#fff" },
}

type TrendChartProps = {
  points: Point[]
  metric: MetricKey
  /** The period (for example "2024-07") that is open or chosen, which stands out from the others. */
  selectedPeriod: string | null
  /** The user clicked a bar or a point: its position in `points`. */
  onPick: (index: number) => void
  /** True for the daily chart, where the highest and lowest of a "group" are the same as its average. */
  daily: boolean
  /** A sentence for screen readers. */
  summary: string
}

/**
 * The main chart of the page. What it draws depends on the chosen metric:
 * rainfall (bars), temperature and heat (lines), river flow against rain (bars and a line on a second axis)
 * and wind and gusts (lines). Clicking a bar or a point drills into that year or month, or picks that day.
 * A table with the same numbers is on the page for anyone who cannot use the chart.
 */
export function TrendChart({ points, metric, selectedPeriod, onPick, daily, summary }: TrendChartProps) {
  const { t, locale } = useLanguage()
  // The text under each point follows the chosen language (the backend's own labels are English).
  const labelled = points.map((point) => ({ ...point, label: periodLabel(point.period, locale) }))
  const handleClick = (state: { activeTooltipIndex?: number | string | null }) => {
    const index = Number(state.activeTooltipIndex)
    if (Number.isInteger(index) && index >= 0 && index < points.length) onPick(index)
  }

  return (
    <div className="cursor-pointer" role="img" aria-label={summary}>
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <ComposedChart data={labelled} onClick={handleClick} margin={{ top: 10, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="var(--glass-text-muted)" strokeOpacity={0.25} vertical={false} />
          <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" />
          <Tooltip {...TOOLTIP} labelFormatter={(_, payload) => payload?.[0]?.payload?.period ?? ""} />
          <Legend wrapperStyle={{ color: "var(--glass-text)", fontSize: 13 }} />

          {(metric === "rain" || metric === "river") && (
            <>
              <YAxis yAxisId="left" {...AXIS} width={52} unit=" mm" />
              <Bar yAxisId="left" dataKey="rainTotalMm" name={t("an.series.rain")} unit=" mm" fill={COLOR.rain} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {points.map((point) => (
                  <Cell key={point.period} fillOpacity={selectedPeriod === null || selectedPeriod === point.period ? 1 : 0.5} />
                ))}
              </Bar>
            </>
          )}
          {metric === "river" && (
            <>
              <YAxis yAxisId="right" orientation="right" {...AXIS} width={60} unit=" m³/s" />
              <Line yAxisId="right" dataKey="riverAvgM3s" name={t("an.series.riverAvg")} unit=" m³/s" stroke={COLOR.river} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
              {!daily && <Line yAxisId="right" dataKey="riverMaxM3s" name={t("an.series.riverPeak")} unit=" m³/s" stroke={COLOR.river} strokeDasharray="5 4" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />}
            </>
          )}

          {metric === "temperature" && (
            <>
              <YAxis {...AXIS} width={52} unit=" °C" domain={["auto", "auto"]} />
              <Line dataKey="highAvgC" name={daily ? t("an.series.high") : t("an.series.avgHigh")} unit=" °C" stroke={COLOR.high} strokeWidth={2.5} dot={daily ? false : { r: 3 }} connectNulls isAnimationActive={false} />
              <Line dataKey="lowAvgC" name={daily ? t("an.series.low") : t("an.series.avgLow")} unit=" °C" stroke={COLOR.low} strokeWidth={2.5} dot={daily ? false : { r: 3 }} connectNulls isAnimationActive={false} />
              {!daily && <Line dataKey="highMaxC" name={t("an.series.hottest")} unit=" °C" stroke={COLOR.high} strokeDasharray="5 4" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />}
              {!daily && <Line dataKey="lowMinC" name={t("an.series.coolest")} unit=" °C" stroke={COLOR.low} strokeDasharray="5 4" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />}
            </>
          )}

          {metric === "wind" && (
            <>
              <YAxis {...AXIS} width={64} unit=" km/h" />
              <Line dataKey="windMaxKmh" name={t("an.series.wind")} unit=" km/h" stroke={COLOR.wind} strokeWidth={2.5} dot={daily ? false : { r: 3 }} connectNulls isAnimationActive={false} />
              <Line dataKey="gustMaxKmh" name={t("an.series.gust")} unit=" km/h" stroke={COLOR.gust} strokeWidth={2.5} dot={daily ? false : { r: 3 }} connectNulls isAnimationActive={false} />
            </>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
