"use client"

import { useT } from "@/context/LanguageContext"
import type { VoiceStatus } from "@/hooks/useVoiceTranscription"
import type { MessageKey } from "@/i18n/messages"
import { cn } from "@/lib/utils"

/** The words that go with each state, for the tooltip and for screen readers. */
const LABELS: Record<VoiceStatus, MessageKey> = {
  idle: "voiceButton.idle",
  connecting: "voiceButton.connecting",
  listening: "voiceButton.listening",
  processing: "voiceButton.processing",
}

type VoiceButtonProps = {
  status: VoiceStatus
  onClick: () => void
  /** Turn the button off, for example while a reply is on its way. */
  disabled?: boolean
}

/**
 * The microphone button next to the message box: tap to start speaking, tap again to stop.
 *
 * While listening it turns red with a pulsing ring (a still ring if the device asks for less motion) and shows a
 * stop square; while it connects or finishes it shows a spinner. The state is also in its label and in
 * aria-pressed, so it never depends on colour alone.
 */
export function VoiceButton({ status, onClick, disabled = false }: VoiceButtonProps) {
  const t = useT()
  const listening = status === "listening"
  const busy = status === "connecting" || status === "processing"

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      aria-pressed={listening}
      aria-label={t(LABELS[status])}
      title={t(LABELS[status])}
      className={cn(
        "relative flex size-12 shrink-0 items-center justify-center rounded-full shadow-lg disabled:opacity-40",
        listening ? "bg-[#dc2626] text-white [text-shadow:none]" : "glass-panel !rounded-full"
      )}
    >
      {listening && (
        <span aria-hidden="true" className="absolute inset-0 rounded-full bg-[#dc2626] opacity-60 motion-safe:animate-ping" />
      )}

      {busy ? (
        <svg className="relative animate-spin motion-reduce:animate-none" width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      ) : listening ? (
        <svg className="relative" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <rect x="5" y="5" width="14" height="14" rx="3" />
        </svg>
      ) : (
        <svg className="relative" width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="9" y="3" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="2" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
    </button>
  )
}
