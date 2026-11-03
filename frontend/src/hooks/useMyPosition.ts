"use client"

import { useCallback, useState } from "react"

import type { MessageKey } from "@/i18n/messages"

export type Position = { lat: number; lng: number }

type State = { status: "off" | "locating" | "on"; position: Position | null; message: MessageKey | "" }

/**
 * The user's position, only when they switch it on. Nothing is asked of the browser before that.
 * The message is the key of an interface text (translate it with `t`).
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
      setState({ status: "off", position: null, message: "geo.unsupported" })
      return
    }
    setState({ status: "locating", position: null, message: "geo.finding" })
    navigator.geolocation.getCurrentPosition(
      (found) => setState({ status: "on", position: { lat: found.coords.latitude, lng: found.coords.longitude }, message: "" }),
      (failure) =>
        setState({
          status: "off",
          position: null,
          message:
            failure.code === failure.PERMISSION_DENIED
              ? "geo.denied"
              : "geo.failed",
        }),
      { timeout: 10_000, maximumAge: 60_000 }
    )
  }, [])

  return { ...state, setOn }
}
