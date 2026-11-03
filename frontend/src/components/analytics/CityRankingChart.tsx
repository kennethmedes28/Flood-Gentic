"use client"

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import type { CityRow } from "@/lib/analytics-api"
import { cityName, type MetricKey } from "@/lib/analytics-format"

const ROW_HEIGHT = 26

/** For each metric: which number ranks the cities, and how it is written. */
const RANK_BY: Record<MetricKey, { pick: (row: CityRow) => number | null; unit: string; title: string }> = {
  rain: { pick: (row) => row.rainTotalMm, unit: "mm", title: "Rain in the period" },
  temperature: { pick: (row) => row.highAvgC, unit: "°C", title: "Average daily high" },
  river: { pick: (row) => row.riverMaxM3s, unit: "m³/s", title: "Peak river flow" },
  wind: { pick: (row) => row.gustMaxKmh, unit: "km/h", title: "Strongest gust" },
}

type CityRankingChartProps = {
  rows: CityRow[]
  metric: MetricKey
  /** The backend key of the chosen city, or "" for all of Metro Manila. */
  selectedKey: string
  /** The user clicked a city's bar. */
  onPick: (cityKey: string) => void
}

/** The 17 cities side by side for the same period, highest first. Clicking a bar picks that city. */
export function CityRankingChart({ rows, metric, selectedKey, onPick }: CityRankingChartProps) {
  const rank = RANK_BY[metric]
  const data = rows
    .map((row) => ({ key: row.city, name: cityName(row.city).replace(/ City$/, ""), value: rank.pick(row) }))
    .filter((row): row is { key: string; name: string; value: number } => row.value !== null)
    .sort((a, b) => b.value - a.value)

  return (
    <div>
      <h3 className="text-base font-semibold">
        {rank.title} by city ({rank.unit})
      </h3>
      <div className="mt-2 cursor-pointer" role="img" aria-label={`${rank.title} for each city. ${data[0] ? `Highest: ${data[0].name}, ${data[0].value} ${rank.unit}.` : ""}`}>
        <ResponsiveContainer width="100%" height={data.length * ROW_HEIGHT + 30}>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--glass-text-muted)" strokeOpacity={0.25} horizontal={false} />
            <XAxis type="number" tick={{ fill: "var(--glass-text)", fontSize: 12 }} stroke="var(--glass-text-muted)" />
            <YAxis type="category" dataKey="name" width={96} interval={0} tick={{ fill: "var(--glass-text)", fontSize: 12 }} stroke="var(--glass-text-muted)" />
            <Tooltip
              contentStyle={{ background: "rgba(11, 37, 69, 0.95)", border: "none", borderRadius: 12, color: "#fff" }}
              itemStyle={{ color: "#fff" }}
              labelStyle={{ color: "#fff", fontWeight: 600 }}
              cursor={{ fill: "rgba(255,255,255,0.15)" }}
              formatter={(value) => `${value} ${rank.unit}`}
            />
            <Bar
              dataKey="value"
              name={rank.title}
              radius={[0, 4, 4, 0]}
              isAnimationActive={false}
              fill="var(--glass-accent)"
              onClick={(_, index) => onPick(data[index].key)}
            >
              {data.map((row) => (
                <Cell key={row.key} fillOpacity={selectedKey === "" || selectedKey === row.key ? 1 : 0.5} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
