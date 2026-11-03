"use client"

import { useT } from "@/context/LanguageContext"
import type { MessageKey } from "@/i18n/messages"

/** Questions people commonly ask, shown as one-tap buttons (keys of the texts in src/i18n/messages/assistant.ts). */
const PROMPTS: MessageKey[] = ["assistant.prompts.1", "assistant.prompts.2", "assistant.prompts.3", "assistant.prompts.4", "assistant.prompts.5"]

type QuickPromptsProps = {
  onPick: (prompt: string) => void
  disabled?: boolean
}

/** A wrapping row of suggestion buttons. */
export function QuickPrompts({ onPick, disabled = false }: QuickPromptsProps) {
  const t = useT()
  return (
    <ul className="flex flex-wrap gap-2" aria-label={t("assistant.prompts.label")}>
      {PROMPTS.map((prompt) => (
        <li key={prompt}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onPick(t(prompt))}
            className="glass-panel min-h-11 rounded-full px-4 text-left text-sm font-medium disabled:opacity-50"
            style={{ borderRadius: "999px" }}
          >
            {t(prompt)}
          </button>
        </li>
      ))}
    </ul>
  )
}
