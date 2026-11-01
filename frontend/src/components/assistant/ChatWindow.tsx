"use client"

import { useEffect, useRef, useState } from "react"

import { GlassPanel } from "@/components/ui/GlassPanel"
import { useVoiceTranscription } from "@/hooks/useVoiceTranscription"
import { ChatError, sendChatMessageStream, sendChatVideoStream, type Coordinates } from "@/lib/chat-api"
import { useMediaAttachment } from "@/hooks/useMediaAttachment"
import { checkVideoSize, isVideo, MediaCheckError, preparePhotoForChat } from "@/lib/media-check-api"

import { InputModeButton, type InputMode } from "./InputModeButton"
import { MessageBubble, TypingIndicator, type ChatMessage } from "./MessageBubble"
import { QuickPrompts } from "./QuickPrompts"

const MAX_LENGTH = 1000
/** The counter only appears when the message is close to the limit. */
const COUNTER_FROM = 800

const WELCOME: ChatMessage = {
  id: "welcome",
  role: "assistant",
  kind: "normal",
  text:
    "Hi! I'm the AI Agent Flood Assistant. Ask me about flood risk, evacuation centers, " +
    "emergency contacts or what to prepare. You can write in English or Filipino, " +
    "or attach a photo or video to check it for flood water.",
}

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
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME])
  const [threadId, setThreadId] = useState<string | null>(null)
  const [location, setLocation] = useState<Coordinates | null>(null)
  const [locationNote, setLocationNote] = useState("")
  const [draft, setDraft] = useState("")
  const [pending, setPending] = useState(false)
  /** What the assistant is doing right now, shown next to the typing dots. */
  const [progress, setProgress] = useState("")
  const [mode, setMode] = useState<InputMode>("voice")
  const { attachment, attachError, attachFile, removeAttachment, takeAttachment } = useMediaAttachment()
  /** Also count people and vehicles / estimate depth: more detail, but more API credit per check. */
  const [moreDetail, setMoreDetail] = useState(false)
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
   * Send the message, with the attached photo or video if there is one. A photo is made small in the browser and goes
   * to the backend with the message; a video is sent whole and analysed in full, which takes longer. Either way the
   * backend checks it for flood water and answers in the same conversation. The text is then the caption: it may be empty.
   */
  async function send(text: string) {
    const message = text.trim()
    if (pending || voiceActive) return
    const item = attachment
    if (!message && !item) return

    const video = item ? isVideo(item.file) : false
    addMessage({
      role: "user",
      kind: "normal",
      text: message || (video ? "Check this video for flood water." : "Check this photo for flood water."),
      media: item ? { url: item.url, isVideo: video } : undefined,
    })
    takeAttachment() // the preview now lives in the message, so its address is not revoked here
    setDraft("")
    setPending(true)

    try {
      const onProgress = (step: { label: string }) => setProgress(step.label)
      let reply
      if (item && video) {
        checkVideoSize(item.file)
        setProgress("Uploading your video") // the upload itself has no progress lines: they start when it arrives
        reply = await sendChatVideoStream(item.file, { message, threadId, location, detailed: moreDetail }, onProgress)
      } else {
        const image = item ? await preparePhotoForChat(item.file) : undefined
        reply = await sendChatMessageStream({ message, threadId, location, image, detailed: moreDetail }, onProgress)
      }
      setThreadId(reply.threadId)
      addMessage({
        role: "assistant",
        text: reply.text,
        kind: reply.blocked ? "blocked" : reply.safeAnswer ? "safe" : "normal",
      })
    } catch (error) {
      const known = error instanceof ChatError || error instanceof MediaCheckError
      addMessage({ role: "assistant", kind: "error", text: known ? error.message : "Something went wrong. Please try again." })
    } finally {
      setPending(false)
      setProgress("")
    }
  }

  /** Ask the browser for the position, only after the user taps the button. */
  function shareLocation() {
    if (!navigator.geolocation) {
      setLocationNote("Your browser can't share a location.")
      return
    }
    setLocationNote("Finding your location…")
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({ lat: position.coords.latitude, lng: position.coords.longitude })
        setLocationNote("Using your location for answers.")
      },
      () => {
        setLocation(null)
        setLocationNote("Location not shared. Answers will be general.")
      }
    )
  }

  function clearConversation() {
    messages.forEach((message) => message.media && URL.revokeObjectURL(message.media.url))
    setMessages([WELCOME])
    setThreadId(null)
  }

  const showPrompts = messages.length === 1 && !pending

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Header */}
      <GlassPanel className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div>
          <h1 className="text-lg font-semibold">AI Agent Flood Assistant</h1>
          <p className="text-xs" style={{ color: "var(--glass-text-muted)" }}>
            Metro Manila · English and Filipino
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={shareLocation}
            aria-pressed={location !== null}
            className="min-h-11 rounded-full px-4 text-sm font-medium aria-pressed:bg-[var(--glass-accent)] aria-pressed:text-white aria-pressed:[text-shadow:none]"
          >
            {location ? "Location on" : "Use my location"}
          </button>
          <button
            type="button"
            onClick={clearConversation}
            disabled={messages.length === 1 || pending}
            className="min-h-11 rounded-full px-4 text-sm font-medium disabled:opacity-40"
          >
            New chat
          </button>
        </div>
        {locationNote && (
          <p className="w-full text-xs" role="status" style={{ color: "var(--glass-text-muted)" }}>
            {locationNote}
          </p>
        )}
      </GlassPanel>

      {/* Messages */}
      <GlassPanel className="min-h-0 flex-1 overflow-y-auto p-4">
        <ol className="flex flex-col gap-3" role="log" aria-live="polite" aria-label="Conversation">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {pending && <TypingIndicator status={progress || undefined} />}
        </ol>
        <div ref={endOfMessages} />
      </GlassPanel>

      {showPrompts && <QuickPrompts onPick={send} disabled={pending} />}

      {/* The photo or video waiting to be checked */}
      {attachment && (
        <GlassPanel className="flex flex-wrap items-center gap-3 px-4 py-2">
          {isVideo(attachment.file) ? (
            <video src={attachment.url} muted preload="metadata" className="size-12 rounded-lg object-cover" aria-hidden="true" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- a local preview of the user's own file
            <img src={attachment.url} alt="" className="size-12 rounded-lg object-cover" />
          )}
          <div className="min-w-0 flex-1 text-sm">
            <p className="truncate font-medium">{attachment.file.name}</p>
            <label className="flex min-h-11 items-center gap-2 text-xs">
              <input type="checkbox" checked={moreDetail} onChange={(event) => setMoreDetail(event.target.checked)} className="size-4" />
              {isVideo(attachment.file)
                ? "Also count people and vehicles (slower, uses twice the credit)"
                : "Also count people and vehicles and estimate a rough depth (slower, uses more credit)"}
            </label>
          </div>
          <button type="button" onClick={removeAttachment} className="min-h-11 rounded-full px-4 text-sm font-medium">
            Remove
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
            Message to the AI Agent Flood Assistant
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
            placeholder={voice.status === "listening" ? "Listening…" : "Ask about floods, evacuation or contacts…"}
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
          aria-label="Send message"
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
          {attachError}
        </p>
      ) : voice.error ? (
        <p className="text-center text-sm" role="alert">
          {voice.error}
        </p>
      ) : voiceActive ? (
        <p className="text-center text-sm" role="status">
          {voice.status === "listening"
            ? "Listening… tap the red button when you are done. You can then fix the text before sending."
            : voice.status === "processing"
              ? "Turning your speech into text…"
              : "Starting the microphone…"}
        </p>
      ) : null}

      <p className="text-center text-xs" style={{ color: "var(--glass-text-muted)" }}>
        Not an official warning. In an emergency call 911 or your local DRRMO.
      </p>
    </div>
  )
}
