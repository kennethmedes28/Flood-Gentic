import { FloatingNav } from "@/components/shell/FloatingNav"
import { GlassSlider } from "@/components/shell/GlassSlider"
import { ResizableFrame } from "@/components/shell/ResizableFrame"
import { SceneBackground } from "@/components/shell/SceneBackground"
import { ChatWindow } from "@/components/assistant/ChatWindow"

/**
 * The AI assistant: the same glass look as the dashboard, with a
 * chat that fills the screen height. The frame fades the chat out when the
 * glass slider is at its minimum, as on the dashboard, and its corner brackets
 * can be dragged toward the centre to shrink it (see ResizableFrame).
 */
export default function AssistantPage() {
  return (
    <main className="h-svh">
      <SceneBackground />
      <GlassSlider />
      <FloatingNav />

      <ResizableFrame storageKey="assistant" contentClassName="p-4 pr-[68px] sm:p-6 sm:pr-[68px]" fillHeight>
        <div className="mx-auto h-full max-w-4xl">
          <ChatWindow />
        </div>
      </ResizableFrame>
    </main>
  )
}
