import type { MessageKey } from "@/i18n/messages"

export type Basemap = "street" | "satellite"

/** Free map tiles. Attribution is required by both providers. */
export const BASEMAPS: Record<Basemap, { label: MessageKey; url: string; attribution: string }> = {
  street: {
    label: "map.street",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap contributors",
  },
  satellite: {
    label: "map.satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
  },
}
