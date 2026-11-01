"use client"

import { useEffect, useState } from "react"

/** Looping title animation shown first, until the user presses the button. */
const INTRO_GIF = "/flood-gentic_intro_blink_full.gif"
/** Animation played once after the button press, then the dashboard opens. */
const GATE_GIF = "/flood-gentic_gate_hexlogo.gif"
/**
 * How long the gate animation lasts. A GIF cannot tell us when it ends, so
 * this is the sum of its frame delays (51 frames, 3.32 seconds). Change it if
 * the GIF is replaced.
 *
 * The gate GIF must NOT loop (it has no loop marker, so it plays once and
 * stays on its last frame, the open gate). The timer starts when the image
 * loads, which can be later than the animation's first frame; with a looping
 * GIF the animation would wrap back to the closed gate before the dashboard
 * opens. Export a replacement GIF with looping turned off.
 */
const GATE_DURATION_MS = 3320

type Phase = "intro" | "gate" | "dashboard"

/** Remembers the intro was seen, so going back to this page in-app skips it. */
let introSeen = false

/**
 * Opening sequence:
 *   1. the intro GIF loops with a start button,
 *   2. pressing the button plays the gate GIF once,
 *   3. the dashboard (the children) opens.
 *
 * The dashboard is not rendered until step 3, so its video and map only
 * start loading once they are needed.
 */
export function IntroGate({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<Phase>(introSeen ? "dashboard" : "intro")

  // Download the (large) gate GIF while the intro is showing, so it starts
  // the moment the button is pressed. The image is not shown, only fetched.
  useEffect(() => {
    if (phase !== "intro") return
    const preload = new Image()
    preload.src = GATE_GIF

    // The map's code is small: fetch it now so the map can start as soon as the dashboard opens.
    // (The 37 MB background video is left alone: it would compete with the gate GIF for bandwidth.)
    void import("leaflet")
  }, [phase])

  function startGate() {
    // Reduced motion: skip the animation and go straight to the dashboard.
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    setPhase(reducedMotion ? "dashboard" : "gate")
  }

  function openDashboard() {
    introSeen = true
    setPhase("dashboard")
  }

  if (phase === "dashboard") return <>{children}</>

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      {phase === "intro" && (
        <>
          {/* Plain <img>: next/image would try to optimise (and freeze) the GIF. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={INTRO_GIF} alt="Flood Gentic" className="h-full w-full object-cover" />
          <button type="button" autoFocus onClick={startGate} className="enter-button">
            <span className="enter-button__face">
              Enter
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </button>
        </>
      )}

      {phase === "gate" && <GatePlayer onFinished={openDashboard} />}
    </div>
  )
}

/**
 * Plays the gate GIF from its first frame and calls onFinished when its
 * duration is over. The timer starts when the image has loaded, so a slow
 * download does not cut the animation short. If the image fails, the
 * dashboard opens right away.
 */
function GatePlayer({ onFinished }: { onFinished: () => void }) {
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!loaded) return
    const timer = window.setTimeout(onFinished, GATE_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [loaded, onFinished])

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={GATE_GIF}
      alt=""
      className="h-full w-full object-cover"
      onLoad={() => setLoaded(true)}
      onError={onFinished}
    />
  )
}
