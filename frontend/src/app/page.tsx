import { FloatingNav } from "@/components/shell/FloatingNav"
import { GlassPanel } from "@/components/ui/GlassPanel"
import { GlassSlider } from "@/components/shell/GlassSlider"
import { IntroGate } from "@/components/shell/IntroGate"
import { ResizableFrame } from "@/components/shell/ResizableFrame"
import { SceneBackground } from "@/components/shell/SceneBackground"
import { DashboardDataProvider } from "@/context/DashboardDataContext"
import { LiveWeatherProvider } from "@/context/LiveWeatherContext"
import { CityList } from "@/components/dashboard/CityList"
import { DashboardTopBar } from "@/components/dashboard/DashboardTopBar"
import { DayStrip } from "@/components/dashboard/DayStrip"
import { TodayCard } from "@/components/dashboard/TodayCard"
import { MapView } from "@/components/dashboard/MapView"
import { RainChart } from "@/components/dashboard/RainChart"

/**
 * Dashboard over the video background, laid out like a weather app:
 * current conditions and forecast on top, chart and map in the middle,
 * nearby areas at the bottom. The numbers are the last recorded day, from the backend's GET /dashboard
 * (see DashboardDataContext).
 *
 * The dashboard opens after the intro sequence (see IntroGate). The data provider sits OUTSIDE the gate, so the
 * numbers load while the intro and gate animations play and are usually ready when the dashboard opens.
 *
 * Everything inside the frame becomes fully transparent (text included)
 * when the glass slider is at its minimum. The four corner brackets of the
 * frame can be dragged toward the centre to shrink the dashboard (see
 * ResizableFrame).
 */
export default function Page() {
  return (
    <DashboardDataProvider>
      <LiveWeatherProvider>
        <IntroGate>
          <main className="min-h-svh">
            <SceneBackground />
            <GlassSlider />
            <FloatingNav />

            <ResizableFrame storageKey="dashboard" contentClassName="p-4 pr-[68px] sm:p-6 sm:pr-[68px]">
              {/*
                Phones: one column, in the order set by the `order-*` classes.
                Wide screens: a top bar, then two columns that always end at the
                same height. The left column holds the "now" widgets, the right
                column holds the forecast and the map, which stretches to fill.
                The `contents` wrappers vanish on phones so `order-*` still works.
              */}
              <div className="flex flex-col gap-4">
                <div className="order-first">
                  <DashboardTopBar />
                </div>

                <div className="flex flex-col gap-4 lg:grid lg:grid-cols-12 lg:items-stretch">
                  {/* Left column: current conditions, rainfall, nearby areas */}
                  <div className="contents lg:col-span-4 lg:flex lg:flex-col lg:gap-4">
                    <TodayCard />

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
                        The weather now and the forecast come from Tomorrow.io (fetched once a day). Rain, river flow and the risk level are from the last recorded day in the project dataset, which can be days behind today; the risk is a rule-based estimate from that day and does not use the forecast. PAGASA warnings are not included. Not an official flood warning: see pagasa.dost.gov.ph.
                      </p>
                    </GlassPanel>
                  </div>
                </div>
              </div>
            </ResizableFrame>
          </main>
        </IntroGate>
      </LiveWeatherProvider>
    </DashboardDataProvider>
  )
}
