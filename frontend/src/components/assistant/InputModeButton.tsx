"use client"

import { useRef } from "react"

import { useT } from "@/context/LanguageContext"
import type { MessageKey } from "@/i18n/messages"

import type { VoiceStatus } from "@/hooks/useVoiceTranscription"
import { cn } from "@/lib/utils"

import { VoiceButton } from "./VoiceButton"

/** Which kind of input the round button next to the message box is set to. */
export type InputMode = "voice" | "media"

type InputModeButtonProps = {
  mode: InputMode
  onModeChange: (mode: InputMode) => void
  voiceStatus: VoiceStatus
  onVoiceClick: () => void
  /** Called with the file the user picked, in photo mode. */
  onFilePicked: (file: File) => void
  /** Turn the buttons off, for example while a reply is on its way. */
  disabled?: boolean
  /** Voice can't be switched away from while it is recording. */
  locked?: boolean
}

const OPTIONS: { mode: InputMode; label: MessageKey; hint: MessageKey }[] = [
  { mode: "voice", label: "input.voice", hint: "input.voiceHint" },
  { mode: "media", label: "input.photo", hint: "input.photoHint" },
]

/** A camera icon for the photo mode. */
function CameraIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12.5" r="3.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

/**
 * The round input button with a small menu that pops up when it is hovered or focused.
 *
 * The menu switches the button between Voice (the microphone) and Photo (opens the file picker). It shows
 * on hover and when anything inside it has keyboard focus, so it works with a mouse and a keyboard. On a touch screen
 * there is no hover, so tapping the button just uses the current mode, and the mode can be changed by tapping the
 * small switch badge that sits on the button's corner.
 */
export function InputModeButton({
  mode,
  onModeChange,
  voiceStatus,
  onVoiceClick,
  onFilePicked,
  disabled = false,
  locked = false,
}: InputModeButtonProps) {
  const t = useT()
  const fileInput = useRef<HTMLInputElement>(null)

  function pickMode(next: InputMode) {
    onModeChange(next)
    if (next === "media") fileInput.current?.click()
  }

  return (
    <div className="group/mode relative shrink-0">
      {mode === "voice" ? (
        <VoiceButton status={voiceStatus} onClick={onVoiceClick} disabled={disabled} />
      ) : (
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={disabled}
          aria-label={t("input.choosePhoto")}
          title={t("input.choosePhoto")}
          className="glass-panel relative flex size-12 shrink-0 items-center justify-center !rounded-full shadow-lg disabled:opacity-40"
        >
          <CameraIcon />
        </button>
      )}

      {/* Touch and keyboard: a badge that switches the mode without needing hover. */}
      <button
        type="button"
        onClick={() => pickMode(mode === "voice" ? "media" : "voice")}
        disabled={disabled || locked}
        aria-label={mode === "voice" ? t("input.switchToPhoto") : t("input.switchToVoice")}
        className="absolute -top-1 -right-1 flex size-6 items-center justify-center rounded-full bg-[var(--glass-accent)] text-white shadow disabled:hidden"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M7 4v14m0 0-3-3m3 3 3-3M17 20V6m0 0-3 3m3-3 3 3" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* The pop-up: visible on hover or while something inside has focus. It opens to the left of the button, clear of the hand cursor, and the gap is bridged by padding so the mouse can reach it. */}
      {!disabled && !locked && (
        <div
          className={cn(
            "invisible absolute right-full bottom-0 z-20 pr-16 opacity-0 transition-opacity duration-150 motion-reduce:transition-none",
            "group-hover/mode:visible group-hover/mode:opacity-100 group-focus-within/mode:visible group-focus-within/mode:opacity-100"
          )}
        >
          <div role="group" aria-label={t("input.group")} className="help-dialog flex w-56 flex-col gap-1 p-2">
            {OPTIONS.map((option) => (
              <button
                key={option.mode}
                type="button"
                onClick={() => pickMode(option.mode)}
                aria-pressed={mode === option.mode}
                className="min-h-11 rounded-xl px-3 py-1.5 text-left text-sm aria-pressed:bg-[var(--glass-accent)] aria-pressed:text-white aria-pressed:[text-shadow:none]"
              >
                <span className="block font-semibold">{t(option.label)}</span>
                <span className="block text-xs opacity-80">{t(option.hint)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = "" // so the same file can be picked again later
          if (file) onFilePicked(file)
        }}
      />
    </div>
  )
}
