import { FloatingNav } from "@/components/shell/FloatingNav"
import { GlassSlider } from "@/components/shell/GlassSlider"
import { ResizableFrame } from "@/components/shell/ResizableFrame"
import { SceneBackground } from "@/components/shell/SceneBackground"
import { EvacuationView } from "@/components/evacuation/EvacuationView"

/**
 * Evacuation centers: a list and a map of the designated shelters, filtered by city or search.
 * The same glass look as the other pages, with the same frame whose corners can be dragged to shrink it.
 */
export default function EvacuationPage() {
  return (
    <main className="min-h-svh">
      <SceneBackground />
      <GlassSlider />
      <FloatingNav />

      <ResizableFrame storageKey="evacuation" contentClassName="p-4 pr-[68px] pb-24 sm:p-6 sm:pr-[68px] sm:pb-24">
        <EvacuationView />
      </ResizableFrame>
    </main>
  )
}
