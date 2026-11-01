"use client"

import "leaflet/dist/leaflet.css"

import { useEffect, useRef, useState } from "react"
import type { CircleMarker, Map as LeafletMap, TileLayer } from "leaflet"

import { GlassPanel } from "@/components/ui/GlassPanel"
import { LoadingLabel, Skeleton } from "@/components/ui/Skeleton"
import { useCurrentCity } from "@/context/CurrentCityContext"
import { BASEMAPS, type Basemap } from "@/lib/basemaps"
import { useDashboardData } from "@/context/DashboardDataContext"
import { CITIES } from "@/data/dashboard-cities"
import { describeFlow, RISK_STYLE, riskLook } from "@/lib/risk"

/** Flood map: street or satellite view with one risk marker per city. */
export function MapView({ loading = false }: { loading?: boolean }) {
  const { city: current } = useCurrentCity()
  const { cityData } = useDashboardData()
  const currentRef = useRef(current) // the map is created once, on the city that is current at that moment
  const mapElement = useRef<HTMLDivElement>(null)
  const map = useRef<LeafletMap | null>(null)
  const markers = useRef<Map<string, CircleMarker>>(new Map())
  const tileLayer = useRef<TileLayer | null>(null)
  const leaflet = useRef<typeof import("leaflet") | null>(null)
  const [basemap, setBasemap] = useState<Basemap>("street")
  const [ready, setReady] = useState(false)

  // Create the map once. Leaflet touches the DOM, so it loads in the browser only.
  useEffect(() => {
    if (loading) return
    let cancelled = false
    const circles = markers.current // the same Map object for the life of the component

    async function createMap() {
      const L = await import("leaflet")
      if (cancelled || !mapElement.current || map.current) return
      leaflet.current = L

      const created = L.map(mapElement.current, {
        center: [currentRef.current.lat, currentRef.current.lng],
        zoom: 11,
        zoomControl: true,
      })
      map.current = created

      // One circle per city. Its colour and popup are filled in below once the live risk is known.
      for (const city of CITIES) {
        const marker = L.circleMarker([city.lat, city.lng], { radius: 12, color: "#ffffff", weight: 2, fillOpacity: 0.9 })
          .bindPopup(`<strong>${city.name}</strong>`)
          .addTo(created)
        circles.set(city.name, marker)
      }
      setReady(true)
    }

    createMap()
    return () => {
      cancelled = true
      map.current?.remove()
      map.current = null
      circles.clear()
      tileLayer.current = null
      setReady(false)
    }
  }, [loading])

  // Follow the current city and the live data: colour each circle by its risk, ring the current city, and move the map to it.
  useEffect(() => {
    currentRef.current = current
    if (!ready || !map.current) return
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    for (const city of CITIES) {
      const live = cityData(city.key)
      const risk = riskLook(live?.risk)
      const isCurrent = city.name === current.name
      const marker = markers.current.get(city.name)
      marker?.setStyle({
        radius: isCurrent ? 16 : 12,
        weight: isCurrent ? 5 : 2,
        color: isCurrent ? "#1d6fe8" : "#ffffff",
        fillColor: risk.color,
      })
      marker?.setPopupContent(
        `<strong>${city.name}</strong>${isCurrent ? " · Current location" : ""}<br>${risk.symbol} ${risk.label}${live?.risk ? " risk" : ""} · river ${describeFlow(live?.riverFlowM3s)}`
      )
      if (isCurrent) marker?.bringToFront()
    }
    map.current.setView([current.lat, current.lng], map.current.getZoom(), { animate: !reducedMotion })
  }, [current, ready, cityData])

  // Swap the base layer whenever the toggle changes.
  useEffect(() => {
    const L = leaflet.current
    if (!ready || !L || !map.current) return
    tileLayer.current?.remove()
    const { url, attribution } = BASEMAPS[basemap]
    tileLayer.current = L.tileLayer(url, { attribution, maxZoom: 18 }).addTo(map.current)
  }, [basemap, ready])

  if (loading) {
    return (
      <GlassPanel className="flex min-h-56 flex-col p-5">
        <LoadingLabel>Loading map</LoadingLabel>
        <Skeleton className="mb-3 h-5 w-24" />
        <Skeleton className="min-h-44 flex-1" />
      </GlassPanel>
    )
  }

  return (
    <GlassPanel className="flex flex-1 flex-col p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-semibold">Flood map</h2>
        <div className="flex gap-1" role="group" aria-label="Map style">
          {(Object.keys(BASEMAPS) as Basemap[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setBasemap(key)}
              aria-pressed={basemap === key}
              className="min-h-11 rounded-full px-4 text-sm font-medium aria-pressed:bg-[var(--glass-accent)] aria-pressed:text-white aria-pressed:[text-shadow:none]"
            >
              {BASEMAPS[key].label}
            </button>
          ))}
        </div>
      </div>

      {/* z-0 + isolate keep Leaflet's high z-index layers below the nav button. */}
      <div className="relative isolate z-0 min-h-72 flex-1 overflow-hidden rounded-2xl">
        <div ref={mapElement} className="absolute inset-0" role="application" aria-label="Flood risk map" />
      </div>

      <ul className="mt-3 flex flex-wrap gap-3 text-xs">
        {Object.values(RISK_STYLE).map((risk) => (
          <li key={risk.label} className="flex items-center gap-1">
            <span style={{ color: risk.color }} aria-hidden="true">
              {risk.symbol}
            </span>
            {risk.label}
          </li>
        ))}
        <li style={{ color: "var(--glass-text-muted)" }}>Rule-based estimate, not official</li>
      </ul>
    </GlassPanel>
  )
}
