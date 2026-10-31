import { GlassPanel } from "@/components/ar/GlassPanel"
import { LoadingLabel, Skeleton } from "@/components/common/Skeleton"
import { CITIES, RISK_STYLE } from "@/data/sample-cities"

/** Pass loading while the city readings are still being fetched. */
export function CityList({ loading = false }: { loading?: boolean }) {
  if (loading) {
    return (
      <GlassPanel className="p-5">
        <LoadingLabel>Loading nearby areas</LoadingLabel>
        <Skeleton className="mb-3 h-5 w-32" />
        <div className="flex flex-col gap-2">
          {CITIES.map((city) => (
            <Skeleton key={city.name} className="h-11" />
          ))}
        </div>
      </GlassPanel>
    )
  }

  return (
    <GlassPanel className="p-5">
      <h2 className="mb-3 font-semibold">Nearby areas</h2>
      <ul className="flex flex-col gap-2">
        {CITIES.map((city) => {
          const risk = RISK_STYLE[city.risk]
          return (
            <li
              key={city.name}
              className="flex min-h-11 items-center justify-between gap-3 text-sm"
            >
              <span className="font-medium">{city.name}</span>
              <span className="flex items-center gap-3">
                <span className="tabular-nums" style={{ color: "var(--glass-text-muted)" }}>
                  {city.waterLevelM} m
                </span>
                <span
                  className="flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium text-white"
                  style={{ background: risk.color }}
                >
                  <span aria-hidden="true">{risk.symbol}</span>
                  {risk.label}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </GlassPanel>
  )
}
