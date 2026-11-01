import { LEVEL_ORDER, levelAt, type Station } from "@/lib/flood-levels"

/**
 * SAMPLE data: replace with real station readings. The heights and the marks are made up for the design preview;
 * they are not the official alarm levels of any station.
 */
export const STATIONS: Station[] = [
  { id: "marikina", name: "Marikina River", place: "Marikina", currentM: 15.2, trendMPerHour: 0.12, watchM: 12, highM: 14, criticalM: 16 },
  { id: "san-juan", name: "San Juan River", place: "San Juan", currentM: 4.1, trendMPerHour: 0.05, watchM: 4, highM: 6, criticalM: 8 },
  { id: "manila", name: "Pasig River mouth", place: "Manila", currentM: 6.1, trendMPerHour: 0, watchM: 5, highM: 7, criticalM: 9 },
  { id: "quezon-city", name: "Tullahan River", place: "Quezon City", currentM: 8.4, trendMPerHour: 0.04, watchM: 7, highM: 9, criticalM: 11 },
  { id: "pasig", name: "Manggahan Floodway", place: "Pasig", currentM: 3.2, trendMPerHour: -0.03, watchM: 5, highM: 7, criticalM: 9 },
]

/** Number of hourly points in the history chart, from 24 hours ago to now. */
const HISTORY_POINTS = 25

/** The station with the highest level (the one that matters most), the first one if they tie. */
export function mostSevereStation(): Station {
  return STATIONS.reduce((worst, station) =>
    LEVEL_ORDER.indexOf(levelAt(station, station.currentM)) > LEVEL_ORDER.indexOf(levelAt(worst, worst.currentM))
      ? station
      : worst
  )
}

/**
 * SAMPLE history: hourly heights for the last 24 hours, ending at the current height. It follows the station's
 * pace with a small, fixed wobble so the line looks like a real gauge. Replace with real readings.
 */
export function sampleHistory(station: Station): number[] {
  const seed = station.id.length
  return Array.from({ length: HISTORY_POINTS }, (_, index) => {
    const hoursAgo = HISTORY_POINTS - 1 - index
    if (hoursAgo === 0) return station.currentM
    const wobble = 0.06 * Math.sin(index * 0.8 + seed)
    return Math.max(0.2, Number((station.currentM - station.trendMPerHour * hoursAgo + wobble).toFixed(2)))
  })
}
