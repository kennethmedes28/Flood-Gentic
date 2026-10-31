import { GlassPanel } from "@/components/ar/GlassPanel"
import { LoadingLabel, Skeleton } from "@/components/common/Skeleton"

/** SAMPLE data: expected rain in mm for the next 12 hours. */
const HOURLY_RAIN_MM = [2, 4, 6, 9, 12, 14, 11, 8, 6, 4, 3, 1]
const START_HOUR = 15

/** Pass loading while the rainfall data is still being fetched. */
export function RainChart({ loading = false }: { loading?: boolean }) {
  if (loading) {
    return (
      <GlassPanel className="p-5">
        <LoadingLabel>Loading rainfall</LoadingLabel>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-4 h-40 w-full" />
      </GlassPanel>
    )
  }

  const maxRain = Math.max(...HOURLY_RAIN_MM)

  return (
    <GlassPanel className="p-5">
      <h2 className="font-semibold">Rainfall, next 12 hours</h2>
      <p className="text-xs" style={{ color: "var(--glass-text-muted)" }}>
        Millimetres per hour (sample)
      </p>

      <div
        className="mt-4 flex h-40 items-end gap-1.5"
        role="img"
        aria-label={`Hourly rainfall peaking at ${maxRain} millimetres`}
      >
        {HOURLY_RAIN_MM.map((mm, index) => (
          <div key={index} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[10px] tabular-nums">{mm}</span>
            <div
              className="w-full rounded-t-md"
              style={{
                height: `${(mm / maxRain) * 100}%`,
                background: "var(--glass-accent)",
              }}
            />
            <span className="text-[10px] tabular-nums" style={{ color: "var(--glass-text-muted)" }}>
              {(START_HOUR + index) % 24}h
            </span>
          </div>
        ))}
      </div>
    </GlassPanel>
  )
}
