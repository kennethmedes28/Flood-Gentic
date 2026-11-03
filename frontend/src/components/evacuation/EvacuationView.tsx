"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { GlassPanel } from "@/components/ui/GlassPanel"
import { Switch } from "@/components/ui/Switch"
import { CentersMap } from "@/components/evacuation/CentersMap"
import { useCurrentCity } from "@/context/CurrentCityContext"
import { EVACUATION_CENTERS, NCR_CITIES, type EvacuationCenter } from "@/data/evacuation-centers"
import { useSupabaseList } from "@/hooks/useSupabaseList"
import { fetchEvacuationCenters } from "@/lib/places-api"
import { useMyPosition } from "@/hooks/useMyPosition"
import { matchCity, plainText } from "@/lib/ncr-city-match"
import { distanceKm, formatDistance } from "@/lib/geo"

const MUTED = { color: "var(--glass-text-muted)" }
const ALL_CITIES = "all"
/** How many centers are listed before "Show all". */
const FIRST_SHOWN = 12
/** The two parts of the line that is on nearly every center. It is said once on the page and left out of the cards. */
const STANDARD_NOTES = ["Coordinates approximate", "confirm before routing"]
/** A position farther than this from every center is outside Metro Manila. */
const FAR_AWAY_KM = 40

type Listed = { center: EvacuationCenter; km: number | null }

/** The notes of a center without the line that every center has. */
function extraNotes(center: EvacuationCenter): string {
  return center.notes
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part && !STANDARD_NOTES.some((standard) => part.startsWith(standard)))
    .join("; ")
}

/** A link that opens the center's position on OpenStreetMap. */
function mapLink(center: EvacuationCenter): string {
  return `https://www.openstreetmap.org/?mlat=${center.lat}&mlon=${center.lng}#map=17/${center.lat}/${center.lng}`
}

/** One center in the list. Selecting it shows it on the map. */
function CenterCard({ item, selected, onSelect }: { item: Listed; selected: boolean; onSelect: () => void }) {
  const { center, km } = item
  const notes = extraNotes(center)

  return (
    <li
      data-center-id={center.id}
      className={`rounded-2xl p-4 ${selected ? "bg-white/35 ring-2 ring-[var(--glass-accent)]" : "bg-white/15"}`}
    >
      <button type="button" onClick={onSelect} aria-pressed={selected} className="block min-h-11 w-full text-left">
        <span className="flex items-start justify-between gap-3">
          <span className="text-base font-semibold">{center.name}</span>
          {km !== null && <span className="shrink-0 text-base font-semibold tabular-nums">{formatDistance(km)}</span>}
        </span>
        <span className="block text-sm" style={MUTED}>
          {center.barangay} · {center.city}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="rounded-full border border-current px-2 py-0.5 text-xs font-medium">{center.type}</span>
          <span>{center.status}</span>
        </span>
      </button>

      {notes && (
        <p className="mt-1 text-sm" style={MUTED}>
          {notes}
        </p>
      )}
      <p className="mt-1 text-xs" style={MUTED}>
        Source: {center.source}
      </p>
      <a
        href={mapLink(center)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex min-h-11 items-center rounded-full border border-current px-4 text-sm font-medium"
      >
        Open on OpenStreetMap
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    </li>
  )
}

/**
 * Evacuation centers: pick a city or search, see them listed with how current each entry is, and on a map.
 * "Nearest first" asks for the user's position only when it is switched on. Distances are in a straight line.
 * The data comes from Supabase (GET /places/evacuation-centers), copied from datasets/ncr_evacuation_centers.csv. If the
 * backend cannot be reached, the built-in copy of that list is shown (see scripts/export_frontend_data.py).
 */
export function EvacuationView() {
  const { city: dashboardCity } = useCurrentCity()
  // Starts on the city the dashboard is about (Manila City unless the user shares a location); the user can pick another.
  const [chosenCity, setChosenCity] = useState<string | null>(null)
  const cityFilter = chosenCity ?? matchCity(dashboardCity.name) ?? ALL_CITIES
  const [search, setSearch] = useState("")
  const [showAll, setShowAll] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const mine = useMyPosition()
  const centers = useSupabaseList(EVACUATION_CENTERS, fetchEvacuationCenters) // from Supabase, the built-in list until it arrives

  // Every center that matches the city and the search, nearest first when the position is shared.
  const matches = useMemo<Listed[]>(() => {
    const words = plainText(search).split(/\s+/).filter(Boolean)
    const found = centers.filter((center) => {
      if (cityFilter !== ALL_CITIES && center.city !== cityFilter) return false
      const text = plainText(`${center.name} ${center.barangay} ${center.type} ${center.city}`)
      return words.every((word) => text.includes(word))
    }).map((center) => ({
      center,
      km: mine.position ? distanceKm(mine.position.lat, mine.position.lng, center.lat, center.lng) : null,
    }))

    return found.sort((a, b) =>
      a.km !== null && b.km !== null
        ? a.km - b.km
        : a.center.city.localeCompare(b.center.city) || a.center.name.localeCompare(b.center.name)
    )
  }, [centers, cityFilter, search, mine.position])

  const shown = showAll ? matches : matches.slice(0, FIRST_SHOWN)
  const visibleCenters = useMemo(() => matches.map((item) => item.center), [matches])
  const selected = matches.find((item) => item.center.id === selectedId) ? selectedId : null // a filter can hide the selection
  const nearestKm = mine.position && matches.length > 0 ? Math.min(...matches.map((item) => item.km ?? Infinity)) : null

  // Bring the selected card into view (when it was picked on the map).
  useEffect(() => {
    if (!selected) return
    const card = document.querySelector(`[data-center-id="${CSS.escape(selected)}"]`)
    card?.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
  }, [selected])

  return (
    <div className="flex flex-col gap-4">
      <GlassPanel className="p-5">
        <h1 className="text-xl font-semibold">Evacuation centers</h1>
        <p className="text-base" style={MUTED}>
          Designated shelters in Metro Manila. Check that a center is open before you go.
        </p>
        <p className="mt-3 text-sm" style={MUTED}>
          The list comes from OCD/NDRRMC lists and later news reports, so it may be out of date, and each center shows what it is based on.
          Map positions are approximate and distances are in a straight line. Confirm with your barangay or city DRRMO. In danger? Call 911.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            City
            <select
              value={cityFilter}
              onChange={(event) => {
                setChosenCity(event.target.value)
                setShowAll(false)
              }}
              className="min-h-11 rounded-full border border-current bg-transparent px-4 text-base [&>option]:bg-white [&>option]:text-slate-900"
            >
              <option value={ALL_CITIES}>All cities</option>
              {NCR_CITIES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm font-medium">
            Search by name, barangay or type
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setShowAll(false)
              }}
              placeholder="For example: school, covered court"
              className="min-h-11 rounded-full border border-current bg-transparent px-4 text-base placeholder:text-current placeholder:opacity-60"
            />
          </label>

          <Switch
            checked={mine.status === "on"}
            busy={mine.status === "locating"}
            onChange={mine.setOn}
            label="Nearest first"
            busyLabel="Finding your location…"
          />
        </div>

        {(mine.message || (nearestKm !== null && nearestKm > FAR_AWAY_KM)) && (
          <p className="mt-2 text-sm" role="status" style={MUTED}>
            {mine.message ||
              `You seem far from these centers (the nearest is ${formatDistance(nearestKm ?? 0)} away). Distances are still shown.`}
          </p>
        )}
      </GlassPanel>

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:items-start">
        {/* Map first on a phone (it is short), to the right on a wide screen and kept in view while the list scrolls. */}
        <GlassPanel className="h-80 p-3 lg:sticky lg:top-0 lg:order-2 lg:col-span-7 lg:h-[34rem]">
          <CentersMap centers={visibleCenters} selectedId={selected} onSelect={setSelectedId} user={mine.position} />
        </GlassPanel>

        <GlassPanel className="p-4 lg:order-1 lg:col-span-5">
          <h2 className="text-lg font-semibold" aria-live="polite">
            {matches.length === 0
              ? "No centers found"
              : `${matches.length} center${matches.length === 1 ? "" : "s"}${cityFilter === ALL_CITIES ? "" : ` in ${cityFilter}`}`}
          </h2>

          {matches.length === 0 ? (
            <p className="mt-2 text-base">
              Nothing matches. Clear the search or choose &quot;All cities&quot;. You can also{" "}
              <Link href="/assistant" className="underline">
                ask the AI Agent Flood Assistant
              </Link>{" "}
              or call your barangay.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {shown.map((item) => (
                <CenterCard key={item.center.id} item={item} selected={selected === item.center.id} onSelect={() => setSelectedId(item.center.id)} />
              ))}
            </ul>
          )}

          {matches.length > FIRST_SHOWN && !showAll && (
            <button type="button" onClick={() => setShowAll(true)} className="mt-3 min-h-11 rounded-full border border-current px-5 text-base font-medium">
              Show all {matches.length}
            </button>
          )}

          <p className="mt-4 text-sm" style={MUTED}>
            To find the nearest center that is not flooded,{" "}
            <Link href="/assistant" className="underline">
              ask the AI Agent Flood Assistant
            </Link>
            .
          </p>
        </GlassPanel>
      </div>
    </div>
  )
}
