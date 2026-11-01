"use client"

import { useCallback, useState } from "react"

export type Position = { lat: number; lng: number }

type State = { status: "off" | "locating" | "on"; position: Position | null; message: string }

/**
 * The user's position, only when they switch it on. Nothing is asked of the browser before that.
 * The position lives in this state and is never saved or sent anywhere; switching off forgets it.
 */
export function useMyPosition() {
  const [state, setState] = useState<State>({ status: "off", position: null, message: "" })

  const setOn = useCallback((on: boolean) => {
    if (!on) {
      setState({ status: "off", position: null, message: "" })
      return
    }
    if (!navigator.geolocation) {
      setState({ status: "off", position: null, message: "Your browser can't share a location." })
      return
    }
    setState({ status: "locating", position: null, message: "Finding your location…" })
    navigator.geolocation.getCurrentPosition(
      (found) => setState({ status: "on", position: { lat: found.coords.latitude, lng: found.coords.longitude }, message: "" }),
      (failure) =>
        setState({
          status: "off",
          position: null,
          message:
            failure.code === failure.PERMISSION_DENIED
              ? "Location not shared, so the list has no distances."
              : "Couldn't find your location. Please try again.",
        }),
      { timeout: 10_000 }
    )
  }, [])

  return { ...state, setOn }
}
