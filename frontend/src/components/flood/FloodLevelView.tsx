"use client"

import Link from "next/link"
import { useState } from "react"

import { GlassPanel } from "@/components/ui/GlassPanel"
import { LevelChart } from "@/components/flood/LevelChart"
import { LevelChip } from "@/components/flood/LevelChip"
import { LevelGauge } from "@/components/flood/LevelGauge"
import { LEVEL_STYLE, describeDuration, describeTrend, hoursToNextLevel, levelAt, nextLevelUp } from "@/lib/flood-levels"
import { STATIONS, mostSevereStation, sampleHistory } from "@/data/flood-stations"

const MUTED = { color: "var(--glass-text-muted)" }

/** Classes shared by the two action buttons in "What to do". */
const ACTION_BUTTON = "inline-flex min-h-11 items-center justify-center rounded-full px-5 text-base font-semibold [text-shadow:none]"

/**
 * The flood level page: pick a station, see its water height on a gauge and over the last 24 hours,
 * what may come next, and what to do. All readings are SAMPLE data (see data/flood-stations.ts).
 *
 * It opens on the station with the highest level, since that is the one that matters most.
 */
export function FloodLevelView() {
  const [stationId, setStationId] = useState(() => mostSevereStation().id)
  const station = STATIONS.find((candidate) => candidate.id === stationId) ?? STATIONS[0]

  const level = levelAt(station, station.currentM)
  const trend = describeTrend(station.trendMPerHour)
  const nextLevel = nextLevelUp(station)
  const hoursLeft = hoursToNextLevel(station)
  const history = sampleHistory(station)

  return (
    <div className="flex flex-col gap-4">
      {/* Title and station picker. The radio buttons give arrow-key movement and a screen-reader group for free. */}
      <GlassPanel className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Flood level</h1>
            <p className="text-base" style={MUTED}>
              Water height at river stations in Metro Manila.
            </p>
          </div>
          <span className="rounded-full border border-current px-3 py-1 text-sm font-medium">Sample readings, not live</span>
        </div>

        <fieldset className="mt-4">
          <legend className="sr-only">Choose a station</legend>
          <div className="flex flex-wrap gap-2">
            {STATIONS.map((candidate) => {
              const candidateLevel = LEVEL_STYLE[levelAt(candidate, candidate.currentM)]
              return (
                <label key={candidate.id} className="cursor-pointer">
                  <input
                    type="radio"
                    name="station"
                    value={candidate.id}
                    checked={candidate.id === station.id}
                    onChange={() => setStationId(candidate.id)}
                    className="peer sr-only"
                  />
                  <span className="flex min-h-11 items-center gap-2 rounded-full border border-white/50 px-4 text-base font-medium peer-checked:bg-[var(--glass-accent)] peer-checked:text-white peer-checked:[text-shadow:none] peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--glass-accent)]">
                    <span
                      className="grid size-6 place-items-center rounded-full text-xs text-white [text-shadow:none]"
                      style={{ background: candidateLevel.color }}
                      aria-hidden="true"
                    >
                      {candidateLevel.symbol}
                    </span>
                    {candidate.place}
                    <span className="tabular-nums opacity-80 max-sm:hidden">{candidate.currentM} m</span>
                    <span className="sr-only">, {candidateLevel.label} level</span>
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>
      </GlassPanel>

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:items-start">
        {/* The gauge. */}
        <GlassPanel className="p-5 lg:col-span-5">
          <h2 className="text-lg font-semibold">{station.name}</h2>
          <p className="text-base" style={MUTED}>
            {station.place}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
            <p className="text-6xl font-light tabular-nums">
              {station.currentM}
              <span className="ml-1 text-2xl">m</span>
            </p>
            <div className="flex flex-col items-start gap-1">
              <LevelChip level={level} />
              <p className="text-base">
                <span aria-hidden="true">{trend.arrow} </span>
                {trend.text}
              </p>
            </div>
          </div>

          <div className="mt-5">
            <LevelGauge station={station} />
          </div>
        </GlassPanel>

        <div className="flex flex-col gap-4 lg:col-span-7">
          {/* The last 24 hours. */}
          <GlassPanel className="p-5">
            <h2 className="text-lg font-semibold">Last 24 hours</h2>
            <p className="text-sm" style={MUTED}>
              Water height in metres, with the point where each level starts
            </p>
            <div className="mt-3">
              <LevelChart station={station} />
            </div>
            <p className="mt-1 text-base tabular-nums" style={MUTED}>
              Lowest {Math.min(...history).toFixed(1)} m · Highest {Math.max(...history).toFixed(1)} m
            </p>
          </GlassPanel>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* What may come next. */}
            <GlassPanel className="p-5">
              <h2 className="text-lg font-semibold">What may come next</h2>
              <p className="mt-2 text-base leading-relaxed">
                {nextLevel === null
                  ? "The water is already at the Critical level."
                  : hoursLeft === null
                    ? `The water is not rising toward the ${LEVEL_STYLE[nextLevel.level].label} level (${nextLevel.atM} m).`
                    : `If it keeps rising at this pace, it reaches the ${LEVEL_STYLE[nextLevel.level].label} level (${nextLevel.atM} m) in ${describeDuration(hoursLeft)}.`}
              </p>
              <p className="mt-2 text-sm" style={MUTED}>
                A straight-line guess from the recent pace, not a forecast.
              </p>
            </GlassPanel>

            {/* What to do. */}
            <GlassPanel className="p-5">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                What to do
                <LevelChip level={level} className="!px-2 !py-0.5 !text-xs" />
              </h2>
              <p className="mt-2 text-base leading-relaxed">{LEVEL_STYLE[level].advice}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <a href="tel:911" className={`${ACTION_BUTTON} bg-[var(--glass-accent)] text-white`}>
                  Call 911 if in danger
                </a>
                <Link href="/assistant" className={`${ACTION_BUTTON} border border-current`}>
                  Ask the AI Agent Flood Assistant
                </Link>
              </div>
            </GlassPanel>
          </div>
        </div>
      </div>

      <GlassPanel className="p-5 text-sm">
        <p className="font-semibold">Disclaimer</p>
        <p className="mt-1" style={MUTED}>
          Sample data for design preview only. Not an official flood warning. For official warnings, see pagasa.dost.gov.ph
          and ndrrmc.gov.ph.
        </p>
      </GlassPanel>

      {/* Tells screen-reader users what changed when they pick another station. */}
      <p className="sr-only" role="status">
        Showing {station.name}, {station.place}: {station.currentM} metres, {LEVEL_STYLE[level].label} level, {trend.text.toLowerCase()}.
      </p>
    </div>
  )
}
