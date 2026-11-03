"use client"

import { useLanguage } from "@/context/LanguageContext"
import type { MessageKey } from "@/i18n/messages"

/** One interface text, for the pages that are server components and so cannot call `t` themselves. */
export function Message({ id, params }: { id: MessageKey; params?: Record<string, string | number> }) {
  const { t } = useLanguage()
  return <>{t(id, params)}</>
}

/**
 * Two versions of a longer text, one per language, for the legal pages. Server-rendered pages send the English version in
 * their HTML (so it can be read without scripts); the browser then shows the version of the chosen language.
 */
export function Localized({ en, fil }: { en: React.ReactNode; fil: React.ReactNode }) {
  const { language } = useLanguage()
  return <>{language === "fil" ? fil : en}</>
}
