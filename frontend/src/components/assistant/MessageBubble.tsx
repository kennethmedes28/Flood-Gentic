export type ChatMessage = {
  id: string
  role: "user" | "assistant"
  text: string
  /**
   * normal  - an ordinary reply
   * safe    - the assistant was not confident enough to answer
   * blocked - the message was stopped before processing
   * error   - something went wrong while sending
   */
  kind: "normal" | "safe" | "blocked" | "error"
  /** A photo or video the user attached to this message (shown as a small preview). */
  media?: { url: string; isVideo: boolean }
}

/** Label and symbol for the special kinds, so they never rely on colour alone. */
const KIND_NOTE: Record<Exclude<ChatMessage["kind"], "normal">, string> = {
  safe: "▲ Not sure about this one. In danger? Call 911 or your local DRRMO.",
  blocked: "■ This message wasn't sent to the assistant.",
  error: "■ Message not delivered.",
}

/** One chat message. Text is shown as plain text, so nothing in it can run as HTML. */
export function MessageBubble({ message }: { message: ChatMessage }) {
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
          <p className="mb-1 text-xs font-semibold">{KIND_NOTE[message.kind]}</p>
        )}
        {message.media &&
          (message.media.isVideo ? (
            <video src={message.media.url} muted controls preload="metadata" className="mb-2 max-h-48 rounded-xl" aria-label="Video you attached" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- a local preview of the user's own file
            <img src={message.media.url} alt="Photo you attached" className="mb-2 max-h-48 rounded-xl" />
          ))}
        <p className="break-words whitespace-pre-wrap">{message.text}</p>
      </div>
    </li>
  )
}

/** Three bouncing dots shown while the assistant is working on a reply. */
export function TypingIndicator() {
  return (
    <li className="flex justify-start">
      <div className="glass-panel flex items-center gap-1.5 px-4 py-3" role="status">
        <span className="sr-only">The assistant is typing</span>
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            aria-hidden="true"
            className="size-2 animate-bounce rounded-full bg-current motion-reduce:animate-none"
            style={{ animationDelay: `${dot * 0.15}s` }}
          />
        ))}
      </div>
    </li>
  )
}
