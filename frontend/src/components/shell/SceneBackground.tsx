"use client"

import { useEffect, useRef, useState } from "react"

import { useBackgroundVideo } from "@/context/BackgroundVideoContext"

/**
 * Full-screen looping video behind the whole app, when the user has turned it on (see BackgroundVideoButton).
 * It is off by default, and then only the plain gradient is shown and the video file is never loaded.
 *
 * Fallbacks: if the video fails to load, a plain gradient is shown instead,
 * so the HUD stays usable. The video pauses when the tab is hidden and
 * stays paused if the user prefers reduced motion.
 */
export function SceneBackground() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [failed, setFailed] = useState(false)
  const { enabled } = useBackgroundVideo()

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")

    // Play only when the tab is visible and motion is allowed.
    const syncPlayback = () => {
      if (document.hidden || reducedMotion.matches) {
        video.pause()
      } else {
        video.play().catch(() => {
          // Autoplay can be blocked; the first frame simply stays visible.
        })
      }
    }

    syncPlayback()
    document.addEventListener("visibilitychange", syncPlayback)
    reducedMotion.addEventListener("change", syncPlayback)
    return () => {
      document.removeEventListener("visibilitychange", syncPlayback)
      reducedMotion.removeEventListener("change", syncPlayback)
    }
  }, [enabled]) // runs again when the video appears, because the video element only exists while it is on

  return (
    <div
      className="fixed inset-0 -z-10 overflow-hidden bg-gradient-to-b from-sky-200 via-sky-300 to-slate-500"
      aria-hidden="true"
    >
      {enabled && !failed && (
        <video
          ref={videoRef}
          className="scene-video h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          onError={() => setFailed(true)}
        >
          <source src="/video/flood-bg.mp4" type="video/mp4" />
        </video>
      )}
      {/* Light haze so text stays readable. Kept subtle on purpose. */}
      <div className="scene-haze absolute inset-0" />
    </div>
  )
}
