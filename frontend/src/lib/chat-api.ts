/**
 * Calls the backend's POST /chat endpoint.
 *
 * The first message needs no thread id; the reply carries one, and sending it
 * back with later messages lets the assistant remember the place and the last
 * suggested evacuation center.
 */

import { authHeaders } from "@/lib/supabase"

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
export class ChatError extends Error {
  /** True when the backend refused because nobody is signed in, so the page can point to the sign-in button. */
  needsSignIn = false
}

const SIGN_IN_MESSAGE = "Please sign in with Google or Facebook to use the assistant. If you are in danger, call 911."

/** Turn FastAPI's validation error (a string or a list of problems) into one sentence. */
function readDetail(detail: unknown): string | null {
  if (typeof detail === "string") return detail
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { msg?: string }
    return first?.msg ?? null
  }
  return null
}

type SendOptions = {
  /** The text of the message. May be empty when a picture is attached. */
  message: string
  threadId: string | null
  location: Coordinates | null
  /** A JPEG picture as base64 text, to be checked for flood water (see media-check-api.ts). */
  image?: string
  /** With a picture: also count people and vehicles. Slower and costs more. */
  detailed?: boolean
}

/** What the assistant is doing while it works on a message, as the backend describes it. */
export type ChatProgress = {
  /** A sentence for the person waiting, for example "Checking rain, river flow and PAGASA for flood risk". */
  label: string
  /** For a message with several topics: the topics being answered. */
  topics: string[]
}

const NETWORK_MESSAGE = "I can't reach the assistant right now. Please check your connection and try again."

/** Turn a failed answer into a friendly ChatError. Does nothing when the answer is fine. */
async function throwIfFailed(response: Response): Promise<void> {
  if (response.ok) return
  if (response.status === 401) {
    const error = new ChatError(SIGN_IN_MESSAGE)
    error.needsSignIn = true
    throw error
  }
  if (response.status === 429) {
    // A spending cap says what was used up and when it starts again; the speed limit just says to wait.
    const body = await response.json().catch(() => null)
    throw new ChatError(readDetail(body?.detail) ?? "You're sending messages too fast. Please wait a moment and try again.")
  }
  if (response.status === 413) {
    throw new ChatError("That file is too large. Please choose a smaller one.")
  }
  if (response.status === 422) {
    const body = await response.json().catch(() => null)
    throw new ChatError(readDetail(body?.detail) ?? "That message couldn't be sent. Please change it and try again.")
  }
  throw new ChatError("The assistant is having trouble right now. Please try again in a moment.")
}

/** POST the message to one of the chat endpoints and turn a failed answer into a friendly ChatError. */
async function postMessage(path: string, options: SendOptions, signal?: AbortSignal): Promise<Response> {
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({
        message: options.message,
        thread_id: options.threadId,
        location: options.location,
        ...(options.image ? { image: options.image, detailed: Boolean(options.detailed) } : {}),
      }),
      signal,
    })
  } catch {
    throw new ChatError(NETWORK_MESSAGE)
  }

  await throwIfFailed(response)
  return response
}

/** The reply fields of the backend's answer (snake_case) as a ChatReply. */
function toReply(data: { thread_id: string; reply: string; safe_answer?: boolean; blocked?: boolean}): ChatReply {
  return {
    threadId: data.thread_id,
    text: data.reply,
    safeAnswer: Boolean(data.safe_answer),
    blocked: Boolean(data.blocked),
  }
}

/** Send a message and wait for the whole reply (POST /chat). */
export async function sendChatMessage(options: SendOptions): Promise<ChatReply> {
  const response = await postMessage("/chat", options)
  return toReply(await response.json())
}

/** One line of the stream (POST /chat/stream). */
type StreamEvent =
  | { type: "status"; label: string; topics?: string[] }
  | { type: "reply"; thread_id: string; reply: string; safe_answer?: boolean; blocked?: boolean }
  | { type: "error"; message: string }

/**
 * Send a message and report progress while the assistant works (POST /chat/stream).
 *
 * `onProgress` is called each time the backend says what it is doing. The returned promise gives the final reply.
 * The reply text itself arrives whole: the agents do not produce it word by word.
 */
export async function sendChatMessageStream(
  options: SendOptions,
  onProgress: (progress: ChatProgress) => void,
  signal?: AbortSignal
): Promise<ChatReply> {
  return readReplyStream(await postMessage("/chat/stream", options, signal), onProgress, signal)
}

/** Read the lines of a chat stream: progress is passed on, and the reply is returned. */
async function readReplyStream(response: Response, onProgress: (progress: ChatProgress) => void, signal?: AbortSignal): Promise<ChatReply> {
  if (!response.body) throw new ChatError(NETWORK_MESSAGE)

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffered = ""
  let reply: ChatReply | null = null

  /** Handle one finished line: progress is passed on, a reply is kept, an error is thrown. */
  function handleLine(line: string) {
    if (!line.trim()) return
    const event = JSON.parse(line) as StreamEvent
    if (event.type === "status") onProgress({ label: event.label, topics: event.topics ?? [] })
    else if (event.type === "reply") reply = toReply(event)
    else if (event.type === "error") throw new ChatError(event.message)
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffered += value
      const lines = buffered.split("\n")
      buffered = lines.pop() ?? "" // the last piece may be half a line: wait for the rest
      lines.forEach(handleLine)
    }
    handleLine(buffered)
  } catch (error) {
    if (error instanceof ChatError) throw error
    if (signal?.aborted) throw error
    throw new ChatError(NETWORK_MESSAGE)
  }

  if (!reply) throw new ChatError("The assistant couldn't finish. Please try again in a moment.")
  return reply
}
