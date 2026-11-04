"use client"

import { useEffect, useRef, useState } from "react"

import { GlassPanel } from "@/components/ui/GlassPanel"
import { useAuth } from "@/context/AuthContext"
import { useLanguage } from "@/context/LanguageContext"
import { useVoiceTranscription } from "@/hooks/useVoiceTranscription"
import { backendText, type MessageKey } from "@/i18n/messages"
import { ChatError, sendChatMessageStream, type Coordinates } from "@/lib/chat-api"
import { useMediaAttachment } from "@/hooks/useMediaAttachment"
import { MediaCheckError, preparePhotoForChat } from "@/lib/media-check-api"

import { AuthBar } from "./AuthBar"
import { InputModeButton, type InputMode } from "./InputModeButton"
import { MessageBubble, TypingIndicator, type ChatMessage } from "./MessageBubble"
import { QuickPrompts } from "./QuickPrompts"

const MAX_LENGTH = 1000
/** The counter only appears when the message is close to the limit. */
const COUNTER_FROM = 800
/** How long to wait for the browser's position before giving up. */
const LOCATION_TIMEOUT_MS = 10_000

/** The first message. It is a text of the interface (not fixed English), so it follows the chosen language. */
const WELCOME: ChatMessage = { id: "welcome", role: "assistant", kind: "normal", text: "", textKey: "assistant.welcome" }

let nextId = 0
function newId() {
  nextId += 1
  return `m${nextId}`
}

/** What the user typed before speaking, followed by what they said (cut to the length the backend accepts). */
function withSpeech(typedBefore: string, spoken: string): string {
  const text = typedBefore.trim() ? `${typedBefore.trimEnd()} ${spoken}` : spoken
  return text.slice(0, MAX_LENGTH)
}

/**
 * The whole chat: message list, suggested questions and the message box.
 *
 * Location is optional and only requested when the user taps the location
 * button. The backend covers Metro Manila only, so a position outside it
 * comes back as a friendly error message.
 */
export function ChatWindow() {
  const auth = useAuth()
  const { language, t } = useLanguage()
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME])
  const [threadId, setThreadId] = useState<string | null>(null)
  const [location, setLocation] = useState<Coordinates | null>(null)
  /** What to tell the person about the location, as a key in src/i18n/messages (translated when shown), or "". */
  const [locationNote, setLocationNote] = useState<MessageKey | "">("")
  const [locating, setLocating] = useState(false)
  const [draft, setDraft] = useState("")
  const [pending, setPending] = useState(false)
  /** What the assistant is doing right now, shown next to the typing dots. */
  const [progress, setProgress] = useState("")
  const [mode, setMode] = useState<InputMode>("voice")
  const { attachment, attachError, attachFile, removeAttachment, takeAttachment } = useMediaAttachment()
  /** Also count people and vehicles / estimate depth: more detail, but more API credit per check. */
  const [moreDetail, setMoreDetail] = useState(false)
  /** True while a file is being dragged over the chat, to show the drop hint. */
  const [dragging, setDragging] = useState(false)
  /** dragenter/dragleave also fire for every child element, so the enters are counted to know when the file really left. */
  const dragDepth = useRef(0)
  const endOfMessages = useRef<HTMLDivElement>(null)
  const inputBox = useRef<HTMLTextAreaElement>(null)
  /** What was in the message box when the microphone was turned on; the spoken words are added after it. */
  const typedBeforeSpeaking = useRef("")

  // Speech goes into the message box for the user to read and fix. It is never sent without their say-so.
  const voice = useVoiceTranscription({
    onPartial: (spoken) => setDraft(withSpeech(typedBeforeSpeaking.current, spoken)),
    onFinal: (spoken) => {
      setDraft(withSpeech(typedBeforeSpeaking.current, spoken))
      inputBox.current?.focus()
    },
  })
  const voiceActive = voice.status !== "idle"

  function toggleMicrophone() {
    if (voice.status === "idle") typedBeforeSpeaking.current = draft
    voice.toggle()
  }

  // Keep the newest message in view.
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    endOfMessages.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "end" })
  }, [messages, pending])

  function addMessage(message: Omit<ChatMessage, "id">) {
    setMessages((current) => [...current, { ...message, id: newId() }])
  }

  /**
   * Send the message, with the attached photo if there is one. The photo is made small in the browser and goes to the
   * backend with the message. A question about the picture is answered from the picture; a flood question also gets the automatic flood check, and a photo sent with no question gets the flood check by default. The answer comes in the same conversation. The text is then the caption: it may be empty.
   */
  async function send(text: string) {
    const message = text.trim()
    if (pending || voiceActive) return
    const item = attachment
    if (!message && !item) return

    // A photo check costs paid requests, so it needs sign-in; say so before uploading anything.
    if (item && auth.status === "signedOut") {
      addMessage({ role: "assistant", kind: "error", text: "", textKey: "error.signInPhoto" })
      return
    }

    addMessage({
      role: "user",
      kind: "normal",
      text: message, // a photo sent without a caption shows just the picture, with no default sentence
      media: item ? { url: item.url } : undefined,
    })
    takeAttachment() // the preview now lives in the message, so its address is not revoked here
    setDraft("")
    setPending(true)

    try {
      const onProgress = (step: { label: string }) => setProgress(step.label)
      const image = item ? await preparePhotoForChat(item.file) : undefined
      const reply = await sendChatMessageStream({ message, threadId, location, image, detailed: moreDetail }, onProgress)
      setThreadId(reply.threadId)
      addMessage({
        role: "assistant",
        text: reply.text,
        kind: reply.blocked ? "blocked" : reply.safeAnswer ? "safe" : "normal",
        // A checked photo comes back with what SAM found: show the same photo with the boxes and water drawn on it.
        annotated: item && reply.annotations ? { url: item.url, annotations: reply.annotations } : undefined,
      })
    } catch (error) {
      // Our own errors carry a key for the text (shown in the chosen language); a text the backend wrote is shown as it is.
      if (error instanceof MediaCheckError || (error instanceof ChatError && error.key)) {
        addMessage({ role: "assistant", kind: "error", text: "", textKey: error.key })
      } else if (error instanceof ChatError) {
        addMessage({ role: "assistant", kind: "error", text: error.message })
      } else {
        addMessage({ role: "assistant", kind: "error", text: "", textKey: "error.generic" })
      }
    } finally {
      setPending(false)
      setProgress("")
    }
  }

  /**
   * Ask the browser for the position, only after the user taps the button. Tapping it again while the position is
   * shared switches sharing off. The request has a time limit, so "Finding your location…" can never hang forever.
   */
  function shareLocation() {
    if (locating) return
    if (location) {
      setLocation(null)
      setLocationNote("assistant.location.noteOff")
      return
    }
    if (!navigator.geolocation) {
      setLocationNote("assistant.location.noteUnsupported")
      return
    }
    setLocating(true)
    setLocationNote("assistant.location.noteFinding")
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false)
        setLocation({ lat: position.coords.latitude, lng: position.coords.longitude })
        setLocationNote("assistant.location.noteUsing")
      },
      (failure) => {
        setLocating(false)
        setLocation(null)
        setLocationNote(failure.code === failure.PERMISSION_DENIED ? "assistant.location.noteDenied" : "assistant.location.noteFailed")
      },
      { timeout: LOCATION_TIMEOUT_MS, maximumAge: 60_000 }
    )
  }

  /** True when the drag carries a file (and not, say, selected text). */
  function carriesFiles(event: React.DragEvent): boolean {
    return Array.from(event.dataTransfer.types).includes("Files")
  }

  function onDragEnter(event: React.DragEvent) {
    if (!carriesFiles(event) || pending) return
    event.preventDefault()
    dragDepth.current += 1
    setDragging(true)
  }

  function onDragOver(event: React.DragEvent) {
    if (!carriesFiles(event) || pending) return
    event.preventDefault() // required, or the browser refuses the drop
    event.dataTransfer.dropEffect = "copy"
  }

  function onDragLeave(event: React.DragEvent) {
    if (!carriesFiles(event)) return
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }

  /** Dropping a photo attaches it, the same as picking it with the input button (the first file only). */
  function onDrop(event: React.DragEvent) {
    if (!carriesFiles(event)) return
    event.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    const file = event.dataTransfer.files[0]
    if (file && !pending && !voiceActive) attachFile(file)
  }

  function clearConversation() {
    messages.forEach((message) => message.media && URL.revokeObjectURL(message.media.url))
    setMessages([WELCOME])
    setThreadId(null)
  }

  const showPrompts = messages.length === 1 && !pending

  return (
    <div
      className="relative flex h-full min-h-0 flex-col gap-3"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dragging && (
        <div
          className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-3xl border-2 border-dashed border-[var(--glass-accent)] bg-black/40 text-lg font-semibold text-white"
          role="status"
        >
          {t("assistant.dropPhoto")}
        </div>
      )}

      {/* Header */}
      <GlassPanel className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div>
          <h1 className="text-lg font-semibold">{t("nav.assistant")}</h1>
          <p className="text-xs" style={{ color: "var(--glass-text-muted)" }}>
            {t("assistant.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={shareLocation}
            aria-pressed={location !== null}
            aria-busy={locating}
            className="min-h-11 rounded-full px-4 text-sm font-medium aria-pressed:bg-[var(--glass-accent)] aria-pressed:text-white aria-pressed:[text-shadow:none]"
          >
            {locating ? t("assistant.location.finding") : location ? t("assistant.location.on") : t("assistant.location.use")}
          </button>
          <button
            type="button"
            onClick={clearConversation}
            disabled={messages.length === 1 || pending}
            className="min-h-11 rounded-full px-4 text-sm font-medium disabled:opacity-40"
          >
            {t("assistant.newChat")}
          </button>
        </div>
        {locationNote && (
          <p className="w-full text-xs" role="status" style={{ color: "var(--glass-text-muted)" }}>
            {t(locationNote)}
          </p>
        )}
      </GlassPanel>

      <AuthBar refreshKey={messages.length} />

      {/* Messages */}
      <GlassPanel className="min-h-0 flex-1 overflow-y-auto p-4">
        <ol className="flex flex-col gap-3" role="log" aria-live="polite" aria-label="Conversation">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {pending && <TypingIndicator status={progress ? backendText(language, progress) : undefined} />}
        </ol>
        <div ref={endOfMessages} />
      </GlassPanel>

      {showPrompts && <QuickPrompts onPick={send} disabled={pending} />}

      {/* The photo waiting to be checked */}
      {attachment && (
        <GlassPanel className="flex flex-wrap items-center gap-3 px-4 py-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of the user's own file */}
          <img src={attachment.url} alt="" className="size-12 rounded-lg object-cover" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="truncate font-medium">{attachment.file.name}</p>
            <label className="flex min-h-11 items-center gap-2 text-xs">
              <input type="checkbox" checked={moreDetail} onChange={(event) => setMoreDetail(event.target.checked)} className="size-4" />
              {t("assistant.attach.detail")}
            </label>
          </div>
          <button type="button" onClick={removeAttachment} className="min-h-11 rounded-full px-4 text-sm font-medium">
            {t("assistant.attach.remove")}
          </button>
        </GlassPanel>
      )}

      {/* Message box: Enter sends, Shift+Enter adds a new line */}
      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          send(draft)
        }}
      >
        <GlassPanel className="flex-1 px-4 py-2">
          <label htmlFor="chat-input" className="sr-only">
            {t("assistant.inputLabel")}
          </label>
          <textarea
            id="chat-input"
            ref={inputBox}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                send(draft)
              }
            }}
            rows={1}
            maxLength={MAX_LENGTH}
            readOnly={voiceActive}
            placeholder={
              voice.status === "listening"
                ? t("assistant.placeholderListening")
                : attachment
                  ? t("assistant.placeholderPhoto")
                  : t("assistant.placeholder")
            }
            className="max-h-32 min-h-11 w-full resize-none bg-transparent py-2.5 text-sm outline-none placeholder:text-current placeholder:opacity-60"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          {draft.length >= COUNTER_FROM && (
            <p className="text-right text-xs tabular-nums" style={{ color: "var(--glass-text-muted)" }}>
              {draft.length}/{MAX_LENGTH}
            </p>
          )}
        </GlassPanel>
        <InputModeButton
          mode={mode}
          onModeChange={setMode}
          voiceStatus={voice.status}
          onVoiceClick={toggleMicrophone}
          onFilePicked={attachFile}
          disabled={pending}
          locked={voiceActive}
        />
        <button
          type="submit"
          disabled={pending || voiceActive || (!draft.trim() && !attachment)}
          aria-label={t("assistant.send")}
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--glass-accent)] text-white shadow-lg disabled:opacity-40"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 12h14m-6-6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>

      {/* What the microphone is doing, or why it stopped. Typing always works. */}
      {attachError ? (
        <p className="text-center text-sm" role="alert">
          {t(attachError)}
        </p>
      ) : voice.error ? (
        <p className="text-center text-sm" role="alert">
          {t(voice.error)}
        </p>
      ) : voiceActive ? (
        <p className="text-center text-sm" role="status">
          {voice.status === "listening"
            ? t("assistant.voice.listening")
            : voice.status === "processing"
              ? t("assistant.voice.processing")
              : t("assistant.voice.starting")}
        </p>
      ) : null}

      <p className="text-center text-xs" style={{ color: "var(--glass-text-muted)" }}>
        {t("assistant.disclaimer")}
      </p>
    </div>
  )
}
