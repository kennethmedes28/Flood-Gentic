import { LEVEL_STYLE, gaugeMaxM, levelAt, type Station } from "@/lib/flood-levels"

/** Height of the glass tube. */
const TUBE_HEIGHT = "h-72"

/** A height in metres as a percentage of the tube, from the bottom. */
function percentOf(heightM: number, maxM: number): number {
  return Math.min(100, Math.max(0, (heightM / maxM) * 100))
}

/**
 * A glass tube filled with water up to the station's current height, with a mark at the start of each level.
 * The height is written next to the water, and each mark is labelled, so the colours are never the only clue.
 */
export function LevelGauge({ station }: { station: Station }) {
  const maxM = gaugeMaxM(station)
  const level = levelAt(station, station.currentM)
  const color = LEVEL_STYLE[level].color
  const fillPercent = percentOf(station.currentM, maxM)

  const marks = [
    { label: "Critical", heightM: station.criticalM, color: LEVEL_STYLE.critical.color },
    { label: "High", heightM: station.highM, color: LEVEL_STYLE.high.color },
    { label: "Watch", heightM: station.watchM, color: LEVEL_STYLE.watch.color },
  ]

  return (
    <div
      className="flex items-stretch justify-center gap-3"
      role="img"
      aria-label={`Water height ${station.currentM} metres, ${LEVEL_STYLE[level].label} level. Watch starts at ${station.watchM} metres, High at ${station.highM}, Critical at ${station.criticalM}.`}
    >
      {/* Left: the current height, level with the water surface. */}
      <div className={`relative w-16 shrink-0 ${TUBE_HEIGHT}`} aria-hidden="true">
        <span
          className="absolute right-0 translate-y-1/2 rounded-md px-2 py-0.5 text-sm font-semibold tabular-nums text-white [text-shadow:none]"
          style={{ bottom: `${fillPercent}%`, background: color }}
        >
          {station.currentM} m
        </span>
      </div>

      {/* The tube, with the water and the level marks. */}
      <div className={`relative w-20 shrink-0 ${TUBE_HEIGHT}`} aria-hidden="true">
        <div className="absolute inset-0 overflow-hidden rounded-[2.5rem] border-2 border-white/70 bg-white/20 shadow-inner">
          <div
            className="absolute inset-x-0 bottom-0 transition-[height] duration-700 ease-out motion-reduce:transition-none"
            style={{ height: `${fillPercent}%`, background: `linear-gradient(180deg, ${color}e6, ${color})` }}
          >
            {/* A slow ripple along the surface (still when the device asks for less motion). */}
            <svg className="water-surface absolute -top-2 left-0 h-3 w-[200%]" viewBox="0 0 200 12" preserveAspectRatio="none">
              <path
                d="M0 6 Q12.5 0 25 6 T50 6 T75 6 T100 6 T125 6 T150 6 T175 6 T200 6 V12 H0 Z"
                fill={color}
              />
            </svg>
          </div>
        </div>
        {marks.map((mark) => (
          <span
            key={mark.label}
            className="absolute inset-x-0 border-t-2 border-dashed"
            style={{ bottom: `${percentOf(mark.heightM, maxM)}%`, borderColor: mark.color }}
          />
        ))}
      </div>

      {/* Right: the name and height where each level starts. */}
      <div className={`relative w-28 shrink-0 ${TUBE_HEIGHT}`} aria-hidden="true">
        {marks.map((mark) => (
          <span
            key={mark.label}
            className="absolute left-0 flex translate-y-1/2 items-baseline gap-1.5 text-sm"
            style={{ bottom: `${percentOf(mark.heightM, maxM)}%` }}
          >
            <span className="font-semibold">{mark.label}</span>
            <span className="tabular-nums" style={{ color: "var(--glass-text-muted)" }}>
              {mark.heightM} m
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}
