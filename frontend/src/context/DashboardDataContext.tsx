"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

import { CITIES } from "@/data/dashboard-cities"
import { fetchDashboard, type LiveCity } from "@/lib/dashboard-api"

/** The data files change about once a day; checking every 15 minutes is plenty. */
const REFRESH_MS = 15 * 60 * 1000

type DashboardDataValue = {
  /** loading: first answer not here yet; ready: numbers are shown (maybe a refresh failed, see error); error: nothing to show. */
  status: "loading" | "ready" | "error"
  /** The live numbers of one city by its backend key, or undefined while not loaded. */
  cityData: (key: string) => LiveCity | undefined
  /** The newest day in the data (for example "2026-10-30"), or null. */
  dataDate: string | null
  /** A plain sentence when the last try failed, or "". */
  error: string
  /** Try again now. */
  reload: () => void
}

const EMPTY: DashboardDataValue = {
  status: "loading",
  cityData: () => undefined,
  dataDate: null,
  error: "",
  reload: () => {},
}

const DashboardDataContext = createContext<DashboardDataValue>(EMPTY)

/**
 * Loads the recorded weather, rain, river flow and flood risk of the dashboard cities from the backend (GET /dashboard),
 * once when the page opens and then every 15 minutes. If a refresh fails the last numbers stay on screen with a note.
 */
export function DashboardDataProvider({ children }: { children: React.ReactNode }) {
  const [cities, setCities] = useState<Map<string, LiveCity>>(new Map())
  const [dataDate, setDataDate] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [attempt, setAttempt] = useState(0) // changing this loads again

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      try {
        const data = await fetchDashboard(CITIES.map((city) => city.key), controller.signal)
        setCities(new Map(data.cities.map((city) => [city.key, city])))
        setDataDate(data.dataDate)
        setError("")
      } catch (caught) {
        if (controller.signal.aborted) return
        setError(caught instanceof Error ? caught.message : "Something went wrong.")
      }
    }

    void load()
    const timer = window.setInterval(() => void load(), REFRESH_MS)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [attempt])

  const reload = useCallback(() => {
    setError("")
    setAttempt((count) => count + 1)
  }, [])

  const value = useMemo<DashboardDataValue>(() => {
    const status = cities.size > 0 ? "ready" : error ? "error" : "loading"
    return { status, cityData: (key) => cities.get(key), dataDate, error, reload }
  }, [cities, dataDate, error, reload])

  return <DashboardDataContext.Provider value={value}>{children}</DashboardDataContext.Provider>
}

export function useDashboardData(): DashboardDataValue {
  return useContext(DashboardDataContext)
}
