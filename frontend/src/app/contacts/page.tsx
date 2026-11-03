import { FloatingNav } from "@/components/shell/FloatingNav"
import { GlassSlider } from "@/components/shell/GlassSlider"
import { ResizableFrame } from "@/components/shell/ResizableFrame"
import { SceneBackground } from "@/components/shell/SceneBackground"
import { ContactsView } from "@/components/contacts/ContactsView"

/**
 * Emergency contacts: 911 first, then the hotlines of one city, national agencies and hospitals.
 * The same glass look as the other pages, with the same frame whose corners can be dragged to shrink it.
 */
export default function ContactsPage() {
  return (
    <main className="min-h-svh">
      <SceneBackground />
      <GlassSlider />
      <FloatingNav />

      <ResizableFrame storageKey="contacts" contentClassName="p-4 pr-[68px] pb-24 sm:p-6 sm:pr-[68px] sm:pb-24">
        <ContactsView />
      </ResizableFrame>
    </main>
  )
}
