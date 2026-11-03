"use client"

import { useEffect, useState } from "react"

import { useT } from "@/context/LanguageContext"

/** Looping title animation (animated WebP) shown first, until the user presses the button. */
const INTRO_ANIMATION = "/flood-gentic_intro_blink_full.webp"
/** Animation played once after the button press, then the dashboard opens. */
const GATE_ANIMATION = "/flood-gentic_gate_hexlogo.webp"
/**
 * How long the gate animation lasts. An animated image cannot tell us when it ends, so
 * this is the sum of its frame delays (3.32 seconds). Change it if the file is replaced.
 *
 * The gate animation must NOT loop (its loop count is 1, so it plays once and
 * stays on its last frame, the open gate). The timer starts when the image
 * loads, which can be later than the animation's first frame; with a looping
 * file the animation would wrap back to the closed gate before the dashboard
 * opens. Export a replacement with the loop count set to 1.
 */
const GATE_DURATION_MS = 3320

type Phase = "intro" | "gate" | "dashboard"

/** Remembers the intro was seen, so going back to this page in-app skips it. */
let introSeen = false

/**
 * Opening sequence:
 *   1. the intro animation loops with a start button,
 *   2. pressing the button plays the gate animation once,
 *   3. the dashboard (the children) opens.
 *
 * The dashboard is not rendered until step 3, so its map only
 * start loading once they are needed.
 */
export function IntroGate({ children }: { children: React.ReactNode }) {
  const t = useT()
  const [phase, setPhase] = useState<Phase>(introSeen ? "dashboard" : "intro")

  // Download the gate animation while the intro is showing, so it starts
  // the moment the button is pressed. The image is not shown, only fetched.
  useEffect(() => {
    if (phase !== "intro") return
    const preload = new Image()
    preload.src = GATE_ANIMATION

    // The map's code is small: fetch it now so the map can start as soon as the dashboard opens.
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
          {/* Plain <img>: next/image would try to optimise (and freeze) the animation. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={INTRO_ANIMATION} alt={t("intro.alt")} className="h-full w-full object-cover" />
          <button type="button" autoFocus onClick={startGate} className="enter-button">
            <span className="enter-button__face">
              {t("intro.enter")}
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
 * Plays the gate animation from its first frame and calls onFinished when its
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
      src={GATE_ANIMATION}
      alt=""
      className="h-full w-full object-cover"
      onLoad={() => setLoaded(true)}
      onError={onFinished}
    />
  )
}
