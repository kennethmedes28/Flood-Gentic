"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react"

import { LANGUAGES, LOCALES, type Language } from "@/i18n/define"
import { MESSAGES, type MessageKey } from "@/i18n/messages"

const STORAGE_KEY = "floodguard:language"

/** Fills the {name} placeholders of a text. */
export type TranslateParams = Record<string, string | number>

export type Translate = (key: MessageKey, params?: TranslateParams) => string

type LanguageValue = {
  language: Language
  setLanguage: (language: Language) => void
  /** The text for a key in the chosen language. */
  t: Translate
  /** The locale for formatting dates and numbers, for example "fil-PH". */
  locale: string
}

const LanguageContext = createContext<LanguageValue | null>(null)

/** Everything that wants to know when the saved choice changes in this tab (the "storage" event only fires in other tabs). */
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  window.addEventListener("storage", listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener("storage", listener)
  }
}

/** The choice kept in memory, used when browser storage is unavailable (it then lasts until the page is reloaded). */
let choiceInMemory: Language | null = null

function isLanguage(value: string | null): value is Language {
  return value !== null && (LANGUAGES as string[]).includes(value)
}

/** The language of the browser or device: Filipino for "fil" and "tl" (Tagalog), otherwise English. */
function browserLanguage(): Language {
  const tag = (typeof navigator !== "undefined" ? navigator.language : "en").toLowerCase()
  return tag.startsWith("fil") || tag.startsWith("tl") ? "fil" : "en"
}

/** The saved choice, else the choice made this session, else the browser's language. */
function readLanguage(): Language {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (isLanguage(saved)) return saved
  } catch {
    // Storage is blocked: fall through to the in-memory choice.
  }
  return choiceInMemory ?? browserLanguage()
}

/** What the server (and the first render in the browser) assumes. */
function readLanguageOnServer(): Language {
  return "en"
}

/** The text of a key in a language, with the {placeholders} filled in. Falls back to English, then to the key itself. */
export function translate(language: Language, key: MessageKey, params?: TranslateParams): string {
  const text = MESSAGES[language][key] ?? MESSAGES.en[key] ?? key
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
}

/** Remembers the language the user picked, makes the page say which language it is in, and offers `t` to translate texts. */
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const language = useSyncExternalStore(subscribe, readLanguage, readLanguageOnServer)

  // Tell the browser (and screen readers) which language the page is in.
  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const setLanguage = useCallback((next: Language) => {
    choiceInMemory = next
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Ignore: the choice just won't persist.
    }
    listeners.forEach((listener) => listener())
  }, [])

  const t = useCallback<Translate>((key, params) => translate(language, key, params), [language])
  const value = useMemo<LanguageValue>(() => ({ language, setLanguage, t, locale: LOCALES[language] }), [language, setLanguage, t])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage(): LanguageValue {
  const context = useContext(LanguageContext)
  if (!context) throw new Error("useLanguage must be used inside <LanguageProvider>")
  return context
}

/** Shorthand for components that only need to translate. */
export function useT(): Translate {
  return useLanguage().t
}
