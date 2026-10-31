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

        {/*
          Phones: one column, in the order set by the `order-*` classes.
          Wide screens: a top bar, then two columns that always end at the
          same height. The left column holds the "now" widgets, the right
          column holds the forecast and the map, which stretches to fill.
          The `contents` wrappers vanish on phones so `order-*` still works.
        */}
        <div className="flex flex-col gap-4">
          <div className="order-first">
            <HudTopBar place="Quezon City" temperatureC={31} isSample />
          </div>

          <div className="flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:items-stretch">
            {/* Left column: current conditions, rainfall, nearby areas */}
            <div className="contents lg:col-span-4 lg:flex lg:flex-col lg:gap-4">
              <section
                className="glass-accent order-1 flex flex-col justify-between rounded-[22px] p-6 shadow-lg"
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

              <div className="order-4">
                <RainChart />
              </div>

              <div className="order-5 flex flex-col lg:flex-1">
                <CityList />
              </div>
            </div>

            {/* Right column: forecast, map (fills the space), disclaimer */}
            <div className="contents lg:col-span-8 lg:flex lg:flex-col lg:gap-4">
              <div className="order-2">
                <DayStrip />
              </div>

              <div className="order-3 flex flex-col lg:flex-1">
                <MapView />
              </div>

              <GlassPanel className="order-6 p-5 text-xs">
                <p className="font-semibold">Disclaimer</p>
                <p className="mt-1" style={{ color: "var(--glass-text-muted)" }}>
                  Sample data for design preview only. Not an official flood warning.
                </p>
              </GlassPanel>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
