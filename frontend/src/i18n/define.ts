/** The languages the interface is written in. "fil" is Filipino (Tagalog). */
export type Language = "en" | "fil"

export const LANGUAGES: Language[] = ["en", "fil"]

/** The name of each language, written in that language (shown in the language picker). */
export const LANGUAGE_NAMES: Record<Language, string> = { en: "English", fil: "Filipino" }

/** The locale used to format dates and numbers for each language. */
export const LOCALES: Record<Language, string> = { en: "en-PH", fil: "fil-PH" }

/**
 * Defines one group of interface texts, in both languages. The two objects must have exactly the same keys, so a text that is
 * missing in Filipino (or only in English) stops the build instead of showing an empty label.
 */
export function defineMessages<const K extends string>(en: Record<K, string>, fil: Record<K, string>): { en: Record<K, string>; fil: Record<K, string> } {
  return { en, fil }
}
