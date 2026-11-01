/**
 * Calls the backend's POST /chat endpoint.
 *
 * The first message needs no thread id; the reply carries one, and sending it
 * back with later messages lets the assistant remember the place and the last
 * suggested evacuation center.
 */

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

export type Coordinates = { lat: number; lng: number }

export type ChatReply = {
  threadId: string
  /** Plain text. Show it as text, never as HTML. */
  text: string
  /** True when the reply is the fixed "I am not confident enough" text. */
  safeAnswer: boolean
  /** True when the message was stopped before any processing. */
  blocked: boolean
}

/** An error whose message is already safe and friendly to show to the user. */
export class ChatError extends Error {}

/** Turn FastAPI's validation error (a string or a list of problems) into one sentence. */
function readDetail(detail: unknown): string | null {
  if (typeof detail === "string") return detail
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: string }
    return first?.msg ?? null
  }
  return null
}

export async function sendChatMessage(options: {
  message: string
  threadId: string | null
  location: Coordinates | null
}): Promise<ChatReply> {
  let response: Response
  try {
    response = await fetch(`${API_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: options.message,
        thread_id: options.threadId,
        location: options.location,
      }),
    })
  } catch {
    throw new ChatError("I can't reach the assistant right now. Please check your connection and try again.")
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new ChatError("You're sending messages too fast. Please wait a moment and try again.")
    }
    if (response.status === 422) {
      const body = await response.json().catch(() => null)
      throw new ChatError(readDetail(body?.detail) ?? "That message couldn't be sent. Please change it and try again.")
    }
    throw new ChatError("The assistant is having trouble right now. Please try again in a moment.")
  }

  const data = await response.json()
  return {
    threadId: data.thread_id,
    text: data.reply,
    safeAnswer: Boolean(data.safe_answer),
    blocked: Boolean(data.blocked),
  }
}
