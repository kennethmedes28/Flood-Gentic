import { useT } from "@/context/LanguageContext"
import type { MessageKey } from "@/i18n/messages"

export type ChatMessage = {
  id: string
  role: "user" | "assistant"
  text: string
  /** A text of the interface (a key in src/i18n/messages), shown in the chosen language instead of `text`. For messages the page itself writes. */
  textKey?: MessageKey
  /**
   * normal  - an ordinary reply
   * safe    - the assistant was not confident enough to answer
   * blocked - the message was stopped before processing
   * error   - something went wrong while sending
   */
  kind: "normal" | "safe" | "blocked" | "error"
  /** A photo the user attached to this message (shown as a small preview). */
  media?: { url: string }
}

/** Label and symbol for the special kinds, so they never rely on colour alone. */
const KIND_NOTE: Record<Exclude<ChatMessage["kind"], "normal">, MessageKey> = {
  safe: "assistant.kind.safe",
  blocked: "assistant.kind.blocked",
  error: "assistant.kind.error",
}

/** One chat message. Text is shown as plain text, so nothing in it can run as HTML. */
export function MessageBubble({ message }: { message: ChatMessage }) {
  const t = useT()
  const isUser = message.role === "user"

  return (
    <li className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          isUser
            ? "glass-accent max-w-[85%] rounded-[22px] rounded-br-md px-4 py-3 text-sm"
            : "glass-panel max-w-[85%] px-4 py-3 text-sm"
        }
      >
        {message.kind !== "normal" && (
          <p className="mb-1 text-xs font-semibold">{t(KIND_NOTE[message.kind])}</p>
        )}
        {message.media && (
          // eslint-disable-next-line @next/next/no-img-element -- a local preview of the user's own file
          <img src={message.media.url} alt={t("assistant.photoAlt")} className={`max-h-48 rounded-xl ${message.text ? "mb-2" : ""}`} />
        )}
        {(message.textKey || message.text) && <p className="break-words whitespace-pre-wrap">{message.textKey ? t(message.textKey) : message.text}</p>}
      </div>
    </li>
  )
}

/**
 * Three bouncing dots and, when known, what the assistant is doing right now (for example "Checking flood risk").
 * The sentence is announced to screen readers each time it changes.
 */
export function TypingIndicator({ status }: { status?: string }) {
  const t = useT()
  return (
    <li className="flex justify-start">
      <div className="glass-panel flex items-center gap-3 px-4 py-3" role="status">
        <span className="sr-only">{status ?? t("assistant.typing")}</span>
        <span className="flex items-center gap-1.5" aria-hidden="true">
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              className="size-2 animate-bounce rounded-full bg-current motion-reduce:animate-none"
              style={{ animationDelay: `${dot * 0.15}s` }}
            />
          ))}
        </span>
        {status && (
          <span className="text-sm" aria-hidden="true">
            {status}…
          </span>
        )}
      </div>
    </li>
  )
}
