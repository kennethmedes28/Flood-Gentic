"use client"

import { Switch } from "@/components/ui/Switch"
import { useCurrentCity } from "@/context/CurrentCityContext"
import { useT } from "@/context/LanguageContext"

/** The on/off switch for sharing the user's location on the dashboard. Off means the default city and no prompt. */
export function LocationToggle() {
  const { sharing, locating, setSharing } = useCurrentCity()
  const t = useT()
  return <Switch checked={sharing} busy={locating} onChange={setSharing} label={t("location.share")} busyLabel={t("location.finding")} />
}
