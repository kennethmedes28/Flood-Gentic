import { SceneBackground } from "@/components/ar/SceneBackground"
import { GlassPanel } from "@/components/ar/GlassPanel"
import { LoadingLabel, Skeleton } from "@/components/common/Skeleton"
import { CityList } from "@/components/dashboard/CityList"
import { DayStrip } from "@/components/dashboard/DayStrip"
import { MapView } from "@/components/map/MapView"
import { RainChart } from "@/components/dashboard/RainChart"

/**
 * Shown by Next.js while the page is loading.
 * Mirrors the dashboard layout using each component's loading state.
 */
export default function Loading() {
  return (
    <main className="min-h-svh p-4 pr-[68px] sm:p-6 sm:pr-[68px]">
      <SceneBackground />
      <LoadingLabel>Loading dashboard</LoadingLabel>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <GlassPanel className="p-4 lg:col-span-12">
          <Skeleton className="h-6 w-full" />
        </GlassPanel>
        <GlassPanel className="p-6 lg:col-span-5">
          <Skeleton className="h-48 w-full" />
        </GlassPanel>
        <div className="lg:col-span-7">
          <DayStrip loading />
        </div>
        <div className="lg:col-span-7">
          <RainChart loading />
        </div>
        <div className="lg:col-span-5">
          <MapView loading />
        </div>
        <div className="lg:col-span-8">
          <CityList loading />
        </div>
      </div>
    </main>
  )
}
