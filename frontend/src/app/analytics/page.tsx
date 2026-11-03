import { FloatingNav } from "@/components/shell/FloatingNav"
import { GlassSlider } from "@/components/shell/GlassSlider"
import { ResizableFrame } from "@/components/shell/ResizableFrame"
import { SceneBackground } from "@/components/shell/SceneBackground"
import { AnalyticsView } from "@/components/analytics/AnalyticsView"

/**
 * Macro Weather Analytics: long-run rain, temperature, river flow and wind since 2020, by city, year, month and day,
 * from the backend (GET /analytics/weather). Same glass look and resizable frame as the other pages.
 */
export default function AnalyticsPage() {
  return (
    <main className="min-h-svh">
      <SceneBackground />
      <GlassSlider />
      <FloatingNav />

      <ResizableFrame storageKey="analytics" contentClassName="p-4 pr-[68px] pb-24 sm:p-6 sm:pr-[68px] sm:pb-24">
        <AnalyticsView />
      </ResizableFrame>
    </main>
  )
}
