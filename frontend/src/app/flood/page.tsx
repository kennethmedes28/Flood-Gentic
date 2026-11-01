import { FloatingNav } from "@/components/shell/FloatingNav"
import { GlassSlider } from "@/components/shell/GlassSlider"
import { ResizableFrame } from "@/components/shell/ResizableFrame"
import { SceneBackground } from "@/components/shell/SceneBackground"
import { FloodLevelView } from "@/components/flood/FloodLevelView"

/**
 * Flood level: the water height at river stations, shown on a gauge and over the last 24 hours.
 * The same video and glass look as the dashboard, and the same frame whose corners can be dragged to shrink it.
 * All readings are SAMPLE data.
 */
export default function FloodPage() {
  return (
    <main className="min-h-svh">
      <SceneBackground />
      <GlassSlider />
      <FloatingNav />

      <ResizableFrame storageKey="flood" contentClassName="p-4 pr-[68px] pb-24 sm:p-6 sm:pr-[68px] sm:pb-24">
        <FloodLevelView />
      </ResizableFrame>
    </main>
  )
}
