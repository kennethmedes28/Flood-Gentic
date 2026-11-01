"use client"

import { useState } from "react"

import { GlassPanel } from "@/components/ar/GlassPanel"
import { Skeleton } from "@/components/common/Skeleton"

/** PAGASA's weather site, which has the live satellite imagery. */
const PANAHON_URL = "https://www.panahon.gov.ph/"

/**
 * PAGASA's live weather and satellite site, shown full screen.
 *
 * We cannot check from here whether the site allows being shown in a frame;
 * if a browser blocks it, the frame stays empty. So the page always carries
 * a link that opens the site in its own tab. The logo button (from the
 * layout's page) stays on top for getting back to the other pages.
 */
export function SatelliteView() {
  const [loaded, setLoaded] = useState(false)

  return (
    <main className="fixed inset-0 bg-slate-900">
      {!loaded && <Skeleton className="absolute inset-0 h-full w-full rounded-none" />}

      <iframe
        src={PANAHON_URL}
        title="PAGASA live weather and satellite"
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        onLoad={() => setLoaded(true)}
        className="absolute inset-0 h-full w-full border-0"
      />

      {/* Small bar in the top corner. The rest of the screen belongs to the site. */}
      <GlassPanel className="absolute top-3 left-3 z-10 flex items-center gap-3 px-4 py-2 text-sm">
        <span className="font-semibold">Live satellite weather · PAGASA</span>
        <a
          href={PANAHON_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 items-center rounded-full px-2 underline"
        >
          Open in new tab
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </GlassPanel>
    </main>
  )
}
