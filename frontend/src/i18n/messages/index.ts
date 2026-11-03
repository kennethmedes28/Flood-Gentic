import { analytics } from "@/i18n/messages/analytics"
import { assistant } from "@/i18n/messages/assistant"
import { dashboard } from "@/i18n/messages/dashboard"
import { data } from "@/i18n/messages/data"
import { flood } from "@/i18n/messages/flood"
import { legal } from "@/i18n/messages/legal"
import { places } from "@/i18n/messages/places"
import { shell } from "@/i18n/messages/shell"

/**
 * Every interface text in both languages. Each group lives in its own file in this folder and is added here; the English
 * keys decide the type of a key, and `defineMessages` makes sure every group has the same keys in Filipino.
 */
export const MESSAGES = {
  en: { ...shell.en, ...assistant.en, ...data.en, ...dashboard.en, ...flood.en, ...places.en, ...analytics.en, ...legal.en },
  fil: { ...shell.fil, ...assistant.fil, ...data.fil, ...dashboard.fil, ...flood.fil, ...places.fil, ...analytics.fil, ...legal.fil },
}

/** The name of one interface text, for example "nav.help". */
export type MessageKey = keyof typeof MESSAGES.en

/**
 * A text the backend sends in English (the progress lines such as "Checking your message") as the text in the chosen language, or
 * the original when it is not one we know. Looked up by the exact English text.
 */
export function backendText(language: "en" | "fil", english: string): string {
  const key = (Object.keys(MESSAGES.en) as MessageKey[]).find((candidate) => candidate.startsWith("progress.") && MESSAGES.en[candidate] === english)
  return key ? MESSAGES[language][key] : english
}
