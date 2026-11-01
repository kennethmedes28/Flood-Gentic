import { FloatingNav } from "@/components/ar/FloatingNav"
import { GlassSlider } from "@/components/ar/GlassSlider"
import { HudCorners } from "@/components/ar/HudCorners"
import { SceneBackground } from "@/components/ar/SceneBackground"
import { ChatWindow } from "@/components/assistant/ChatWindow"

/**
 * The AI assistant: the same video and glass look as the dashboard, with a
 * chat that fills the screen height. The `glass-fade` wrapper fades the
 * chat out when the glass slider is at its minimum, as on the dashboard.
 */
export default function AssistantPage() {
  return (
    <main className="h-svh p-4 pr-[68px] sm:p-6 sm:pr-[68px]">
      <SceneBackground />
      <GlassSlider />
      <FloatingNav />

      <div className="glass-fade mx-auto h-full max-w-4xl">
        <HudCorners />
        <ChatWindow />
      </div>
    </main>
  )
}
