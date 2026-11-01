import { shortDate } from "@/lib/rain-words"

/** The rain of each recorded day as bars (millimetres), oldest first. */
export function RainBars({ days }: { days: { date: string; rainMm: number | null }[] }) {
  const maxRain = Math.max(0, ...days.map((day) => day.rainMm ?? 0))
  const summary = maxRain > 0 ? `Daily rain over the last ${days.length} days, peaking at ${maxRain.toFixed(1)} millimetres.` : "No rain in the last days."

  return (
    <div className="flex h-28 items-end gap-1" role="img" aria-label={summary}>
      {days.map((day) => (
        <div key={day.date} className="flex h-full flex-1 flex-col items-center justify-end gap-0.5" title={`${shortDate(day.date)}: ${day.rainMm ?? "–"} mm`}>
          <div
            className="min-h-px w-full rounded-t-sm"
            style={{ height: `${maxRain > 0 ? ((day.rainMm ?? 0) / maxRain) * 100 : 0}%`, background: "var(--glass-accent)" }}
          />
        </div>
      ))}
    </div>
  )
}
