import { GlassPanel } from "@/components/ar/GlassPanel"
import { LoadingLabel, Skeleton } from "@/components/common/Skeleton"

/** SAMPLE data: replace with the real 7-day forecast. */
const DAYS = [
  { day: "Today", icon: "🌧️", high: 31, low: 25, rain: 80 },
  { day: "Sun", icon: "⛈️", high: 30, low: 25, rain: 90 },
  { day: "Mon", icon: "🌧️", high: 30, low: 24, rain: 70 },
  { day: "Tue", icon: "🌦️", high: 31, low: 25, rain: 45 },
  { day: "Wed", icon: "⛅", high: 32, low: 25, rain: 30 },
  { day: "Thu", icon: "☀️", high: 33, low: 26, rain: 10 },
  { day: "Fri", icon: "🌦️", high: 32, low: 26, rain: 40 },
]

/** Pass loading while the forecast is still being fetched. */
export function DayStrip({ loading = false }: { loading?: boolean }) {
  if (loading) {
    return (
      <GlassPanel className="p-5">
        <LoadingLabel>Loading forecast</LoadingLabel>
        <Skeleton className="mb-3 h-5 w-32" />
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {DAYS.map((d) => (
            <Skeleton key={d.day} className="h-28" />
          ))}
        </div>
      </GlassPanel>
    )
  }

  return (
    <GlassPanel className="p-5">
      <h2 className="mb-3 font-semibold">7-day forecast</h2>
      <ul className="grid grid-cols-4 gap-2 sm:grid-cols-7">
        {DAYS.map((d) => (
          <li
            key={d.day}
            className="flex flex-col items-center gap-1 rounded-2xl py-2 text-center text-sm"
          >
            <span className="font-medium">{d.day}</span>
            <span className="text-2xl" aria-hidden="true">
              {d.icon}
            </span>
            <span className="tabular-nums">
              {d.high}° <span style={{ color: "var(--glass-text-muted)" }}>{d.low}°</span>
            </span>
            <span className="text-xs tabular-nums" style={{ color: "var(--glass-text-muted)" }}>
              {d.rain}% rain
            </span>
          </li>
        ))}
      </ul>
    </GlassPanel>
  )
}
