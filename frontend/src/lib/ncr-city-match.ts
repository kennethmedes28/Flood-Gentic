import { NCR_CITIES } from "@/data/evacuation-centers"

/** Lower-case text without accents, so "Parañaque" and "paranaque" compare equal. */
export function plainText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
}

/** The city in the data that a dashboard city name refers to: "Marikina" gives "Marikina City". */
export function matchCity(name: string): string | undefined {
  const wanted = plainText(name)
  return NCR_CITIES.find((city) => plainText(city) === wanted) ?? NCR_CITIES.find((city) => plainText(city).startsWith(wanted))
}
