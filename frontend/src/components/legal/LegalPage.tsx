import Link from "next/link"

import { FloatingNav } from "@/components/shell/FloatingNav"
import { SceneBackground } from "@/components/shell/SceneBackground"
import { GlassPanel } from "@/components/ui/GlassPanel"

type LegalPageProps = {
  title: string
  /** When the text was last changed, for example "3 November 2026". */
  updated: string
  children: React.ReactNode
}

/**
 * The frame of the privacy and data-deletion pages: the app's background and menu, and one readable panel of text.
 * These pages are plain server-rendered text on purpose, so anyone (and Facebook's and Google's review) can open them
 * without signing in or running scripts.
 */
export function LegalPage({ title, updated, children }: LegalPageProps) {
  return (
    <main className="min-h-svh">
      <SceneBackground />
      <FloatingNav />

      <div className="mx-auto max-w-3xl px-4 pt-6 pb-28 sm:px-6">
        <GlassPanel className="p-6 sm:p-8">
          <p className="text-sm">
            <Link href="/" className="underline underline-offset-2">
              Flood-Gentic
            </Link>
          </p>
          <h1 className="mt-2 text-2xl font-semibold">{title}</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--glass-text-muted)" }}>
            Last updated {updated}
          </p>
          <div className="mt-6 flex flex-col gap-4 text-base leading-relaxed [&_a]:underline [&_a]:underline-offset-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">
            {children}
          </div>
        </GlassPanel>
      </div>
    </main>
  )
}
