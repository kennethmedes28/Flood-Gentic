import { FloatingNav } from "@/components/ar/FloatingNav"
import { SatelliteView } from "@/components/weather/SatelliteView"

/** Full-screen live satellite weather, opened from the logo button's menu. */
export default function SatellitePage() {
  return (
    <>
      <SatelliteView />
      <FloatingNav />
    </>
  )
}
