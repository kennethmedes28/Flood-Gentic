"use client"

import { useEffect, useRef, useState } from "react"

import { GlassPanel } from "@/components/ar/GlassPanel"
import { ChatError, sendChatMessage, type Coordinates } from "@/lib/chat-api"

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
    "Hi! I'm the Flood Gentic assistant. Ask me about flood risk, evacuation centers, " +
    "emergency contacts or what to prepare. You can write in English or Filipino.",
}

let nextId = 0
function newId() {
  nextId += 1
  return `m${nextId}`
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
  const endOfMessages = useRef<HTMLDivElement>(null)

  // Keep the newest message in view.
  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    endOfMessages.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "end" })
  }, [messages, pending])

  function addMessage(message: Omit<ChatMessage, "id">) {
    setMessages((current) => [...current, { ...message, id: newId() }])
  }

  async function send(text: string) {
    const message = text.trim()
    if (!message || pending) return

    addMessage({ role: "user", kind: "normal", text: message })
    setDraft("")
    setPending(true)

    try {
      const reply = await sendChatMessage({ message, threadId, location })
      setThreadId(reply.threadId)
      addMessage({
        role: "assistant",
        text: reply.text,
        kind: reply.blocked ? "blocked" : reply.safeAnswer ? "safe" : "normal",
      })
    } catch (error) {
      const text = error instanceof ChatError ? error.message : "Something went wrong. Please try again."
      addMessage({ role: "assistant", kind: "error", text })
    } finally {
      setPending(false)
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
    setMessages([WELCOME])
    setThreadId(null)
  }

  const showPrompts = messages.length === 1 && !pending

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Header */}
      <GlassPanel className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div>
          <h1 className="text-lg font-semibold">Flood Assistant</h1>
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
          {pending && <TypingIndicator />}
        </ol>
        <div ref={endOfMessages} />
      </GlassPanel>

      {showPrompts && <QuickPrompts onPick={send} disabled={pending} />}

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
            Message to the assistant
          </label>
          <textarea
            id="chat-input"
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
            placeholder="Ask about floods, evacuation or contacts…"
            className="max-h-32 min-h-11 w-full resize-none bg-transparent py-2.5 text-sm outline-none placeholder:text-current placeholder:opacity-60"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          {draft.length >= COUNTER_FROM && (
            <p className="text-right text-xs tabular-nums" style={{ color: "var(--glass-text-muted)" }}>
              {draft.length}/{MAX_LENGTH}
            </p>
          )}
        </GlassPanel>
        <button
          type="submit"
          disabled={pending || !draft.trim()}
          aria-label="Send message"
          className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--glass-accent)] text-white shadow-lg disabled:opacity-40"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 12h14m-6-6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>

      <p className="text-center text-xs" style={{ color: "var(--glass-text-muted)" }}>
        Not an official warning. In an emergency call 911 or your local DRRMO.
      </p>
    </div>
  )
}
