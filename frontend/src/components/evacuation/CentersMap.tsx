"use client"

import "leaflet/dist/leaflet.css"

import { useEffect, useRef, useState } from "react"
import type { CircleMarker, LayerGroup, Map as LeafletMap } from "leaflet"

import type { Position } from "@/hooks/useMyPosition"
import type { EvacuationCenter } from "@/data/evacuation-centers"
import { distanceKm } from "@/lib/geo"

const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
const ATTRIBUTION = "© OpenStreetMap contributors"
/** Where the map starts, before any center is shown: central Manila. */
const START_CENTER: [number, number] = [14.5995, 120.9842]

const MARKER = { radius: 9, color: "#ffffff", weight: 2, fillColor: "#1d6fe8", fillOpacity: 0.95 }
const SELECTED_MARKER = { radius: 14, color: "#0b2545", weight: 4, fillColor: "#1d6fe8", fillOpacity: 1 }

type CentersMapProps = {
  centers: EvacuationCenter[]
  selectedId: string | null
  onSelect: (id: string) => void
  /** The user's position, when they chose to share it. */
  user: Position | null
}

/** A text node for a tooltip, so a name is never read as HTML. */
function plainTooltip(text: string): HTMLElement {
  const element = document.createElement("span")
  element.textContent = text
  return element
}

/**
 * A map of the centers that are in the list. Clicking a circle selects that center in the list, and selecting
 * a center in the list moves the map to it. The list is the accessible way to use the page; the map is an extra.
 */
export function CentersMap({ centers, selectedId, onSelect, user }: CentersMapProps) {
  const mapElement = useRef<HTMLDivElement>(null)
  const map = useRef<LeafletMap | null>(null)
  const leaflet = useRef<typeof import("leaflet") | null>(null)
  const centerLayer = useRef<LayerGroup | null>(null)
  const circles = useRef<Map<string, CircleMarker>>(new Map())
  const userMarker = useRef<CircleMarker | null>(null)
  const [ready, setReady] = useState(false)

  // The newest onSelect, without rebuilding the markers each time the page redraws.
  const onSelectRef = useRef(onSelect)
  useEffect(() => {
    onSelectRef.current = onSelect
  })

  // Create the map once. Leaflet touches the DOM, so it loads in the browser only.
  useEffect(() => {
    let cancelled = false
    const knownCircles = circles.current

    async function createMap() {
      const L = await import("leaflet")
      if (cancelled || !mapElement.current || map.current) return
      leaflet.current = L
      const created = L.map(mapElement.current, { center: START_CENTER, zoom: 11 })
      L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 18 }).addTo(created)
      centerLayer.current = L.layerGroup().addTo(created)
      map.current = created
      setReady(true)
    }

    createMap()
    return () => {
      cancelled = true
      map.current?.remove()
      map.current = null
      centerLayer.current = null
      userMarker.current = null
      knownCircles.clear()
      setReady(false)
    }
  }, [])

  // Draw one circle per center in the list, and zoom to fit them.
  useEffect(() => {
    const L = leaflet.current
    const layer = centerLayer.current
    if (!ready || !L || !layer || !map.current) return

    layer.clearLayers()
    circles.current.clear()
    for (const center of centers) {
      const circle = L.circleMarker([center.lat, center.lng], MARKER).bindTooltip(plainTooltip(center.name))
      circle.on("click", () => onSelectRef.current(center.id))
      circle.addTo(layer)
      circles.current.set(center.id, circle)
    }
    if (centers.length > 0) {
      const bounds = L.latLngBounds(centers.map((center) => [center.lat, center.lng] as [number, number]))
      map.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 15, animate: false })
    }
  }, [centers, ready])

  // Ring the selected center and bring it into view.
  useEffect(() => {
    if (!ready || !map.current) return
    for (const [id, circle] of circles.current) {
      circle.setStyle(id === selectedId ? SELECTED_MARKER : MARKER)
      if (id === selectedId) circle.bringToFront()
    }
    const selected = centers.find((center) => center.id === selectedId)
    if (selected) map.current.panTo([selected.lat, selected.lng], { animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches })
  }, [selectedId, centers, ready])

  // The user's own position, when shared. The map zooms to fit the user and the nearest center, so "You are here" is
  // easy to see; when sharing is switched off the map goes back to showing every listed center.
  useEffect(() => {
    const L = leaflet.current
    if (!ready || !L || !map.current) return
    userMarker.current?.remove()
    userMarker.current = null
    if (!user) return

    userMarker.current = L.circleMarker([user.lat, user.lng], { radius: 8, color: "#ffffff", weight: 3, fillColor: "#0b2545", fillOpacity: 1 })
      .bindTooltip(plainTooltip("You are here"))
      .addTo(map.current)

    const nearest = [...centers].sort(
      (a, b) => distanceKm(user.lat, user.lng, a.lat, a.lng) - distanceKm(user.lat, user.lng, b.lat, b.lng)
    )[0]
    const points: [number, number][] = [[user.lat, user.lng]]
    if (nearest) points.push([nearest.lat, nearest.lng])
    map.current.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16, animate: false })
  }, [user, ready, centers])

  return (
    <div className="relative isolate z-0 h-full min-h-72 overflow-hidden rounded-2xl">
      <div ref={mapElement} className="absolute inset-0" role="application" aria-label="Map of the evacuation centers in the list. The list beside it has the same centers." />
    </div>
  )
}
