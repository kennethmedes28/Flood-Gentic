"use client"

import { useElementWidth } from "@/hooks/useElementWidth"
import { LEVEL_STYLE, levelAt, type FloodLevel, type Station } from "@/lib/flood-levels"
import { sampleHistory } from "@/data/flood-stations"

const CHART_HEIGHT = 230
/** Room around the drawing for the height labels (left), the level names (right) and the hours (bottom). */
const WIDE_MARGIN = { top: 12, right: 126, bottom: 28, left: 40 }
/** On narrow screens the level names move inside the drawing, so the line keeps most of the width. */
const NARROW_MARGIN = { top: 12, right: 12, bottom: 28, left: 36 }
const NARROW_BELOW_PX = 480
/** Hours shown along the bottom. */
const HOUR_LABELS = [
  { index: 0, text: "24 h ago" },
  { index: 12, text: "12 h ago" },
  { index: 24, text: "Now" },
]

/** The water height over the last 24 hours as a line, over bands that show where each level begins. */
export function LevelChart({ station }: { station: Station }) {
  const { ref, width } = useElementWidth<HTMLDivElement>()
  const history = sampleHistory(station)
  const narrow = width < NARROW_BELOW_PX
  const MARGIN = narrow ? NARROW_MARGIN : WIDE_MARGIN

  // The height range shown: the readings and all three marks, with a little room.
  const lowest = Math.min(...history)
  const highest = Math.max(...history)
  const minM = Math.max(0, Math.floor(Math.min(lowest, station.watchM) - 1))
  const maxM = Math.ceil(Math.max(highest, station.criticalM) + 1)

  const plotWidth = Math.max(120, width - MARGIN.left - MARGIN.right)
  const plotHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom
  const x = (index: number) => MARGIN.left + (index / (history.length - 1)) * plotWidth
  const y = (heightM: number) => MARGIN.top + (1 - (heightM - minM) / (maxM - minM)) * plotHeight

  const line = history.map((heightM, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)} ${y(heightM).toFixed(1)}`).join(" ")
  const area = `${line} L${x(history.length - 1).toFixed(1)} ${y(minM)} L${x(0).toFixed(1)} ${y(minM)} Z`

  // Bands from the bottom up: low, watch, high, critical.
  const bands: { level: FloodLevel; fromM: number; toM: number }[] = [
    { level: "low", fromM: minM, toM: station.watchM },
    { level: "watch", fromM: station.watchM, toM: station.highM },
    { level: "high", fromM: station.highM, toM: station.criticalM },
    { level: "critical", fromM: station.criticalM, toM: maxM },
  ]

  const nowLevel = levelAt(station, station.currentM)
  const nowColor = LEVEL_STYLE[nowLevel].color
  const summary =
    `Water height at ${station.name} over the last 24 hours, from ${history[0]} to ${station.currentM} metres. ` +
    `Lowest ${Math.min(...history)}, highest ${Math.max(...history)}. Now at the ${LEVEL_STYLE[nowLevel].label} level.`

  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={CHART_HEIGHT} role="img" aria-label={summary} className="block">
        {bands.map((band) => {
          const top = y(Math.min(band.toM, maxM))
          const bottom = y(Math.max(band.fromM, minM))
          return (
            <rect
              key={band.level}
              x={MARGIN.left}
              width={plotWidth}
              y={top}
              height={Math.max(0, bottom - top)}
              fill={LEVEL_STYLE[band.level].color}
              opacity={0.16}
            />
          )
        })}

        {/* Level names and their starting heights, at the right. */}
        {bands.slice(1).map((band) => (
          <g key={band.level}>
            <line
              x1={MARGIN.left}
              x2={MARGIN.left + plotWidth}
              y1={y(band.fromM)}
              y2={y(band.fromM)}
              stroke={LEVEL_STYLE[band.level].color}
              strokeDasharray="5 4"
              strokeWidth={1.5}
            />
            <text
              x={narrow ? MARGIN.left + plotWidth - 6 : MARGIN.left + plotWidth + 8}
              y={narrow ? y(band.fromM) - 5 : y(band.fromM) + 4}
              textAnchor={narrow ? "end" : "start"}
              fontSize={narrow ? 12 : 13}
              fill="currentColor"
            >
              {LEVEL_STYLE[band.level].label} {band.fromM} m
            </text>
          </g>
        ))}

        {/* Height scale at the left. */}
        {[minM, Math.round((minM + maxM) / 2), maxM].map((heightM) => (
          <text key={heightM} x={MARGIN.left - 8} y={y(heightM) + 4} fontSize={12} textAnchor="end" fill="currentColor" opacity={0.75}>
            {heightM}
          </text>
        ))}

        <path d={area} fill={nowColor} opacity={0.22} />
        <path d={line} fill="none" stroke={nowColor} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(history.length - 1)} cy={y(station.currentM)} r={6} fill={nowColor} stroke="white" strokeWidth={2} />

        {HOUR_LABELS.map((label) => (
          <text
            key={label.text}
            x={x(label.index)}
            y={CHART_HEIGHT - 8}
            fontSize={12}
            textAnchor={label.index === 0 ? "start" : label.index === 24 ? "end" : "middle"}
            fill="currentColor"
            opacity={0.75}
          >
            {label.text}
          </text>
        ))}
      </svg>
    </div>
  )
}
