import { FloatingNav } from "@/components/shell/FloatingNav"
import { SatelliteView } from "@/components/satellite/SatelliteView"

/** Full-screen live satellite weather, opened from the logo button's menu. */
export default function SatellitePage() {
  return (
    <>
      <SatelliteView />
      <FloatingNav />
    </>
  )
}
