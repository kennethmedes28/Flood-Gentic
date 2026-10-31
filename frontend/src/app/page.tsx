import { FloatingNav } from "@/components/ar/FloatingNav"
import { GlassPanel } from "@/components/ar/GlassPanel"
import { GlassSlider } from "@/components/ar/GlassSlider"
import { HudCorners } from "@/components/ar/HudCorners"
import { HudTopBar } from "@/components/ar/HudTopBar"
import { SceneBackground } from "@/components/ar/SceneBackground"
import { CityList } from "@/components/dashboard/CityList"
import { DayStrip } from "@/components/dashboard/DayStrip"
import { MapView } from "@/components/map/MapView"
import { RainChart } from "@/components/dashboard/RainChart"

/**
 * Dashboard over the video background, laid out like a weather app:
 * current conditions and forecast on top, chart and map in the middle,
 * nearby areas at the bottom. All numbers are placeholder SAMPLE data.
 *
 * Everything inside the `glass-fade` wrapper becomes fully transparent
 * (text included) when the glass slider is at its minimum.
 */
export default function Page() {
  return (
    <main className="min-h-svh p-4 pr-[68px] sm:p-6 sm:pr-[68px]">
      <SceneBackground />
      <GlassSlider />
      <FloatingNav />

      <div className="glass-fade">
        <HudCorners />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-12">
            <HudTopBar place="Quezon City" temperatureC={31} isSample />
          </div>

          {/* Current conditions: solid accent card keeps today's risk readable */}
          <section
            className="glass-accent flex flex-col justify-between rounded-[22px] p-6 shadow-lg lg:col-span-5"
            aria-label="Today's flood risk"
          >
            <div>
              <p className="text-sm opacity-90">Today · Quezon City</p>
              <p className="mt-2 text-6xl font-light tabular-nums">31°</p>
              <p className="mt-1 text-sm opacity-90">Heavy rain, feels like 36°</p>
            </div>
            <div className="mt-6">
              <p className="text-2xl font-semibold">Moderate flood risk</p>
              <p className="text-sm opacity-90">Water level rising slowly (sample)</p>
            </div>
          </section>

          <div className="lg:col-span-7">
            <DayStrip />
          </div>

          <div className="lg:col-span-7">
            <RainChart />
          </div>

          <div className="lg:col-span-5">
            <MapView />
          </div>

          <div className="lg:col-span-8">
            <CityList />
          </div>

          <GlassPanel className="p-5 text-xs lg:col-span-4">
            <p className="font-semibold">Disclaimer</p>
            <p className="mt-1" style={{ color: "var(--glass-text-muted)" }}>
              Sample data for design preview only. Not an official flood warning.
            </p>
          </GlassPanel>
        </div>
      </div>
    </main>
  )
}
