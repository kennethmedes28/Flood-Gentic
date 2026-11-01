"use client"

import { Switch } from "@/components/ui/Switch"
import { useCurrentCity } from "@/context/CurrentCityContext"

/** The on/off switch for sharing the user's location on the dashboard. Off means the default city and no prompt. */
export function LocationToggle() {
  const { sharing, locating, setSharing } = useCurrentCity()
  return <Switch checked={sharing} busy={locating} onChange={setSharing} label="Share my location" busyLabel="Finding your location…" />
}
