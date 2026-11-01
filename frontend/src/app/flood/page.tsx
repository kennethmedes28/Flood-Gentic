import { DashboardDataProvider } from "@/context/DashboardDataContext"
import { LiveWeatherProvider } from "@/context/LiveWeatherContext"
import { FloatingNav } from "@/components/shell/FloatingNav"
import { GlassSlider } from "@/components/shell/GlassSlider"
import { ResizableFrame } from "@/components/shell/ResizableFrame"
import { SceneBackground } from "@/components/shell/SceneBackground"
import { FloodLevelView } from "@/components/flood/FloodLevelView"

/**
 * Flood level: the flood risk and river flow of each city, from the backend (recorded datasets) with the Tomorrow.io rain forecast.
 * The same video and glass look as the dashboard, and the same frame whose corners can be dragged to shrink it.
 * The data providers are opened here, as on the dashboard, because only these pages use them.
 */
export default function FloodPage() {
  return (
    <DashboardDataProvider>
      <LiveWeatherProvider>
        <main className="min-h-svh">
          <SceneBackground />
          <GlassSlider />
          <FloatingNav />

          <ResizableFrame storageKey="flood" contentClassName="p-4 pr-[68px] pb-24 sm:p-6 sm:pr-[68px] sm:pb-24">
            <FloodLevelView />
          </ResizableFrame>
        </main>
      </LiveWeatherProvider>
    </DashboardDataProvider>
  )
}
