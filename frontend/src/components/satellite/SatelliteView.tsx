"use client"

import { useState } from "react"

import { useLanguage } from "@/context/LanguageContext"
import { GlassPanel } from "@/components/ui/GlassPanel"
import { Skeleton } from "@/components/ui/Skeleton"

/** PAGASA's weather site, which has the live satellite imagery. */
const PANAHON_URL = "https://www.panahon.gov.ph/"

/**
 * What the PAGASA site may do inside the frame. It is an interactive map (PANaHON) that loads its layers on demand,
 * so it needs what a normal tab has: scripts and its own storage, forms (sign in), dialogs, downloads (saved map
 * images), and pop-ups that open as normal tabs instead of inheriting this sandbox. It may only leave the frame
 * (change this page) after a click. Without the pop-up flag, a widget that opens a tab opens it with the same limits.
 */
const FRAME_SANDBOX = [
  "allow-scripts",
  "allow-same-origin",
  "allow-forms",
  "allow-modals",
  "allow-downloads",
  "allow-popups",
  "allow-popups-to-escape-sandbox",
  "allow-top-navigation-by-user-activation",
].join(" ")

/** Browser features the map may ask for (full screen, "my location", copying text). */
const FRAME_PERMISSIONS = "fullscreen; geolocation; clipboard-write"

/**
 * PAGASA's live weather and satellite site, shown full screen.
 *
 * We cannot check from here whether the site allows being shown in a frame;
 * if a browser blocks it, the frame stays empty. So the page always carries
 * a link that opens the site in its own tab. The logo button (from the
 * layout's page) stays on top for getting back to the other pages.
 *
 * Known limit: inside a frame the browser keeps the site's cookies and saved
 * login apart from the ones in a normal tab, so a layer that needs a sign-in
 * can keep loading here while it works in a normal tab. The link opens that tab.
 */
export function SatelliteView() {
  const { t } = useLanguage()
  const [loaded, setLoaded] = useState(false)

  return (
    <main className="fixed inset-0 bg-slate-900">
      {!loaded && <Skeleton className="absolute inset-0 h-full w-full rounded-none" />}

      <iframe
        src={PANAHON_URL}
        title={t("sat.title")}
        sandbox={FRAME_SANDBOX}
        allow={FRAME_PERMISSIONS}
        allowFullScreen
        onLoad={() => setLoaded(true)}
        className="absolute inset-0 h-full w-full border-0"
      />

      {/* Small bar in the top corner. The rest of the screen belongs to the site. */}
      <GlassPanel className="absolute top-3 left-3 z-10 flex items-center gap-3 px-4 py-2 text-sm">
        <span className="font-semibold">{t("sat.bar")}</span>
        <a
          href={PANAHON_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-11 items-center rounded-full px-2 underline"
        >
          {t("sat.open")}
          <span className="sr-only">{t("sat.newTab")}</span>
        </a>
      </GlassPanel>
    </main>
  )
}
