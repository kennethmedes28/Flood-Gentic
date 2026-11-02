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
  /** An image that comes with the reply, such as a photo with the detected objects marked on it. */
  resultImage?: string
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
            <video src={message.media.url} muted controls preload="metadata" className={`max-h-48 rounded-xl ${message.text ? "mb-2" : ""}`} aria-label="Video you attached" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- a local preview of the user's own file
            <img src={message.media.url} alt="Photo you attached" className={`max-h-48 rounded-xl ${message.text ? "mb-2" : ""}`} />
          ))}
        {message.resultImage && (
          // eslint-disable-next-line @next/next/no-img-element -- served by the backend, so the Next image loader is not needed
          <img src={message.resultImage} alt="Your photo with the detected objects marked" className="mb-2 max-h-96 rounded-xl" />
        )}
        {message.text && <p className="break-words whitespace-pre-wrap">{message.text}</p>}
      </div>
    </li>
  )
}

/**
 * Three bouncing dots and, when known, what the assistant is doing right now (for example "Checking flood risk").
 * The sentence is announced to screen readers each time it changes.
 */
export function TypingIndicator({ status }: { status?: string }) {
  return (
    <li className="flex justify-start">
      <div className="glass-panel flex items-center gap-3 px-4 py-3" role="status">
        <span className="sr-only">{status ?? "The assistant is typing"}</span>
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
