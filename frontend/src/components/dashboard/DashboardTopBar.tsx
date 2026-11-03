"use client"

import { HudTopBar } from "@/components/shell/HudTopBar"
import { LocationToggle } from "@/components/dashboard/LocationToggle"
import { useCurrentCity } from "@/context/CurrentCityContext"
import { useDashboardData } from "@/context/DashboardDataContext"
import { useLiveWeather } from "@/context/LiveWeatherContext"
import { useLanguage } from "@/context/LanguageContext"
import { DEFAULT_CITY_NAME } from "@/data/dashboard-cities"

/** The dashboard's top bar: the current city, where it came from, and the switch for sharing the location. */
export function DashboardTopBar() {
  const { city, sharing, outside, note } = useCurrentCity()
  const { cityData } = useDashboardData()
  const { forecastFor } = useLiveWeather()
  const { t } = useLanguage()
  // The temperature right now when the live weather has it, otherwise the high of the last recorded day.
  const temperature = forecastFor(city.key)?.now?.values.temperature ?? cityData(city.key)?.highC ?? null

  const placeNote = !sharing ? t("bar.default") : outside ? t("bar.outside") : t("bar.yours")

  return (
    <HudTopBar
      place={city.name}
      placeNote={placeNote}
      message={note ? t(note, { city: DEFAULT_CITY_NAME }) : ""}
      temperatureC={temperature === null ? null : Math.round(temperature)}
      action={<LocationToggle />}
    />
  )
}
