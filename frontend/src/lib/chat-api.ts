/**
 * Calls the backend's POST /chat endpoint.
 *
 * The first message needs no thread id; the reply carries one, and sending it
 * back with later messages lets the assistant remember the place and the last
 * suggested evacuation center.
 */

import type { MessageKey } from "@/i18n/messages"
import { authHeaders } from "@/lib/supabase"

// A trailing slash is removed, so "https://api.example.com/" does not turn "/chat" into "//chat".
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/+$/, "")

export type Coordinates = { lat: number; lng: number }

/** One object SAM found in a checked photo: its name, confidence (0 to 1, or null) and corners in the photo's pixels. */
export type PhotoBox = { label: string; confidence: number | null; box: [number, number, number, number] }

/**
 * What to draw over a checked photo (backend video/annotations.py): the photo's size as SAM saw it, a box per object, and the flood
 * water as a grid (`cells`: base64, one bit per cell, row by row, first cell in the highest bit), or null when there is no water.
 */
export type PhotoAnnotations = {
  width: number
  height: number
  boxes: PhotoBox[]
  water: { rows: number; columns: number; cells: string } | null
}

export type ChatReply = {
  threadId: string
  /** Plain text. Show it as text, never as HTML. */
  text: string
  /** True when the reply is the fixed "I am not confident enough" text. */
  safeAnswer: boolean
  /** True when the message was stopped before any processing. */
  blocked: boolean
  /** For a checked photo: the boxes and water to draw on it. */
  annotations: PhotoAnnotations | null
}

/**
 * An error whose message is safe and friendly to show to the user. When the text is one of ours it is a message `key`, which the
 * page translates into the chosen language when it shows it; a text the backend wrote (a limit that is used up, a validation
 * problem) is passed through as it is, because the backend already writes it in both languages or in the person's language.
 */
export class ChatError extends Error {
  /** The key of the interface text, when this error is one of ours. */
  key?: MessageKey
  /** True when the backend refused because nobody is signed in, so the page can point to the sign-in button. */
  needsSignIn = false

  constructor(textOrKey: MessageKey | { text: string }) {
    super(typeof textOrKey === "string" ? textOrKey : textOrKey.text)
    if (typeof textOrKey === "string") this.key = textOrKey
  }
}

/** The text to show for an error from this module or from the photo helper, in the chosen language. */
export function errorText(error: { key?: MessageKey; message: string }, t: (key: MessageKey) => string): string {
  return error.key ? t(error.key) : error.message
}

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


/** Turn a failed answer into a friendly ChatError. Does nothing when the answer is fine. */
async function throwIfFailed(response: Response): Promise<void> {
  if (response.ok) return
  if (response.status === 401) {
    const error = new ChatError("error.signIn")
    error.needsSignIn = true
    throw error
  }
  if (response.status === 429) {
    // A spending cap says what was used up and when it starts again; the speed limit just says to wait.
    const body = await response.json().catch(() => null)
    const detail = readDetail(body?.detail)
    throw detail ? new ChatError({ text: detail }) : new ChatError("error.tooFast")
  }
  if (response.status === 413) {
    throw new ChatError("error.tooLarge")
  }
  if (response.status === 422) {
    const body = await response.json().catch(() => null)
    const detail = readDetail(body?.detail)
    throw detail ? new ChatError({ text: detail }) : new ChatError("error.generic")
  }
  throw new ChatError("error.trouble")
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
    throw new ChatError("error.network")
  }

  await throwIfFailed(response)
  return response
}

/** The reply fields of the backend's answer (snake_case) as a ChatReply. */
type ReplyData = { thread_id: string; reply: string; safe_answer?: boolean; blocked?: boolean; annotations?: PhotoAnnotations | null }

function toReply(data: ReplyData): ChatReply {
  return {
    threadId: data.thread_id,
    text: data.reply,
    safeAnswer: Boolean(data.safe_answer),
    blocked: Boolean(data.blocked),
    annotations: isPhotoAnnotations(data.annotations) ? data.annotations : null,
  }
}

/** True for annotations with the expected shape, so a malformed answer is ignored instead of breaking the page. */
function isPhotoAnnotations(value: unknown): value is PhotoAnnotations {
  if (!value || typeof value !== "object") return false
  const candidate = value as PhotoAnnotations
  return (
    candidate.width > 0 &&
    candidate.height > 0 &&
    Array.isArray(candidate.boxes) &&
    candidate.boxes.every((box) => typeof box.label === "string" && Array.isArray(box.box) && box.box.length === 4)
  )
}

/** Send a message and wait for the whole reply (POST /chat). */
export async function sendChatMessage(options: SendOptions): Promise<ChatReply> {
  const response = await postMessage("/chat", options)
  return toReply(await response.json())
}

/** One line of the stream (POST /chat/stream). */
type StreamEvent =
  | { type: "status"; label: string; topics?: string[] }
  | ({ type: "reply" } & ReplyData)
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
  if (!response.body) throw new ChatError("error.network")

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffered = ""
  let reply: ChatReply | null = null

  /** Handle one finished line: progress is passed on, a reply is kept, an error is thrown. */
  function handleLine(line: string) {
    if (!line.trim()) return
    const event = JSON.parse(line) as StreamEvent
    if (event.type === "status") onProgress({ label: event.label, topics: event.topics ?? [] })
    else if (event.type === "reply") reply = toReply(event)
    else if (event.type === "error") throw new ChatError({ text: event.message })
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
    throw new ChatError("error.network")
  }

  if (!reply) throw new ChatError("error.couldntFinish")
  return reply
}
