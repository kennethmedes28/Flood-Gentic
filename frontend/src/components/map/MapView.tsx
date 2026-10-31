"use client"

import "leaflet/dist/leaflet.css"

import { useEffect, useRef, useState } from "react"
import type { Map as LeafletMap, TileLayer } from "leaflet"

import { GlassPanel } from "@/components/ar/GlassPanel"
import { LoadingLabel, Skeleton } from "@/components/common/Skeleton"
import { CITIES, DEFAULT_CENTER, RISK_STYLE } from "@/data/sample-cities"

type Basemap = "street" | "satellite"

/** Free map tiles. Attribution is required by both providers. */
const BASEMAPS: Record<Basemap, { label: string; url: string; attribution: string }> = {
  street: {
    label: "Street",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap contributors",
  },
  satellite: {
    label: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
  },
}

/** Flood map: street or satellite view with one risk marker per city. */
export function MapView({ loading = false }: { loading?: boolean }) {
  const mapElement = useRef<HTMLDivElement>(null)
  const map = useRef<LeafletMap | null>(null)
  const tileLayer = useRef<TileLayer | null>(null)
  const leaflet = useRef<typeof import("leaflet") | null>(null)
  const [basemap, setBasemap] = useState<Basemap>("street")
  const [ready, setReady] = useState(false)

  // Create the map once. Leaflet touches the DOM, so it loads in the browser only.
  useEffect(() => {
    if (loading) return
    let cancelled = false

    async function createMap() {
      const L = await import("leaflet")
      if (cancelled || !mapElement.current || map.current) return
      leaflet.current = L

      const created = L.map(mapElement.current, {
        center: [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng],
        zoom: 11,
        zoomControl: true,
      })
      map.current = created

      // One circle per city, coloured by risk. The popup repeats the risk as text.
      for (const city of CITIES) {
        const risk = RISK_STYLE[city.risk]
        L.circleMarker([city.lat, city.lng], {
          radius: 12,
          color: "#ffffff",
          weight: 2,
          fillColor: risk.color,
          fillOpacity: 0.9,
        })
          .bindPopup(`<strong>${city.name}</strong><br>${risk.symbol} ${risk.label} risk · ${city.waterLevelM} m (sample)`)
          .addTo(created)
      }
      setReady(true)
    }

    createMap()
    return () => {
      cancelled = true
      map.current?.remove()
      map.current = null
      tileLayer.current = null
      setReady(false)
    }
  }, [loading])

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
    <GlassPanel className="flex flex-col p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-semibold">Flood map</h2>
        <div className="flex gap-1" role="group" aria-label="Map style">
          {(Object.keys(BASEMAPS) as Basemap[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setBasemap(key)}
              aria-pressed={basemap === key}
              className="min-h-11 rounded-full px-4 text-sm font-medium aria-pressed:bg-[#1d6fe8] aria-pressed:text-white aria-pressed:[text-shadow:none]"
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
        <li style={{ color: "var(--glass-text-muted)" }}>Sample data</li>
      </ul>
    </GlassPanel>
  )
}
