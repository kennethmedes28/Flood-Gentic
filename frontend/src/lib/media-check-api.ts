import { API_URL } from "@/lib/chat-api"

/**
 * Checking a photo or video for flood water, through the backend's /ws/camera (backend/video/camera_router.py).
 *
 * The backend looks at one picture per check. A photo is sent as it is (made smaller first); a video is
 * reduced to one picture from its middle, so only that moment is checked. Each check costs API credit on the
 * backend, so people and depth (which cost more) are only requested when asked for.
 */

/** The backend refuses pictures over 1 MB, so pictures are scaled down to this width and saved as JPEG. */
const MAX_WIDTH = 640
const JPEG_QUALITY = 0.8
/** Longest wait for the backend's answer. A check with people and depth can take a while. */
const REPLY_TIMEOUT_MS = 60_000
const CONNECT_TIMEOUT_MS = 8000

/** The sorts of file the picker accepts. */
export const MEDIA_ACCEPT = "image/*,video/*"

export type MediaOptions = {
  /** Also count people and vehicles (three times the cost). */
  people: boolean
  /** Also estimate a rough depth from people in the water (slower). */
  depth: boolean
}

export class MediaCheckError extends Error {}

/** What the user is shown for each thing that can go wrong. */
const MESSAGES = {
  unreadable: "That file couldn't be opened. Try a different photo or video.",
  notMedia: "Please choose a photo or a video.",
  server: "I can't reach the photo check right now. You can still type your question.",
  tooSoon: "Please wait a few seconds between checks, then try again.",
  failed: "That picture couldn't be checked. Please try another one.",
}

/** True when the file is a video (a video is checked through one still picture). */
export function isVideo(file: File): boolean {
  return file.type.startsWith("video/")
}

/** Draw a picture or a video frame onto a canvas of at most MAX_WIDTH and return it as a JPEG. */
function canvasToJpeg(source: CanvasImageSource, width: number, height: number): Promise<Blob> {
  const scale = Math.min(1, MAX_WIDTH / width)
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new MediaCheckError(MESSAGES.unreadable))), "image/jpeg", JPEG_QUALITY)
  })
}

/** Load a photo and return it as a small JPEG. */
async function photoToJpeg(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return await canvasToJpeg(image, image.naturalWidth, image.naturalHeight)
  } catch (error) {
    if (error instanceof MediaCheckError) throw error
    throw new MediaCheckError(MESSAGES.unreadable)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Take one picture from the middle of a video and return it as a small JPEG. */
async function videoToJpeg(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file)
  const video = document.createElement("video")
  video.muted = true
  video.preload = "auto"
  video.src = url

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new MediaCheckError(MESSAGES.unreadable))
    })

    // Jump to the middle of the video and wait until that picture is ready.
    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve()
      video.onerror = () => reject(new MediaCheckError(MESSAGES.unreadable))
      video.currentTime = Number.isFinite(video.duration) ? video.duration / 2 : 0
    })
    return await canvasToJpeg(video, video.videoWidth, video.videoHeight)
  } catch (error) {
    if (error instanceof MediaCheckError) throw error
    throw new MediaCheckError(MESSAGES.unreadable)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Send one JPEG to the backend and wait for the text of the report. */
function askBackend(picture: Blob, options: MediaOptions): Promise<string> {
  const flags = [options.people && "people=1", options.depth && "depth=1"].filter(Boolean).join("&")
  const address = `${API_URL.replace(/^http/, "ws")}/ws/camera${flags ? `?${flags}` : ""}`

  return new Promise((resolve, reject) => {
    let finished = false
    const socket = new WebSocket(address)

    /** End the check once, with either an answer or an error, and close the connection. */
    function finish(outcome: { text: string } | { error: string }) {
      if (finished) return
      finished = true
      window.clearTimeout(connectTimer)
      window.clearTimeout(replyTimer)
      if (socket.readyState <= WebSocket.OPEN) socket.close()
      if ("text" in outcome) resolve(outcome.text)
      else reject(new MediaCheckError(outcome.error))
    }

    const connectTimer = window.setTimeout(() => finish({ error: MESSAGES.server }), CONNECT_TIMEOUT_MS)
    const replyTimer = window.setTimeout(() => finish({ error: MESSAGES.server }), REPLY_TIMEOUT_MS)

    socket.onopen = () => {
      window.clearTimeout(connectTimer)
      socket.send(picture)
    }
    socket.onerror = () => finish({ error: MESSAGES.server })
    socket.onclose = () => finish({ error: MESSAGES.server })
    socket.onmessage = (event) => {
      if (typeof event.data !== "string") return
      const message = JSON.parse(event.data) as { type: string; text?: string }
      if (message.type === "report" && message.text) finish({ text: message.text })
      else if (message.type === "skipped") finish({ error: MESSAGES.tooSoon })
      else if (message.type === "error") finish({ error: MESSAGES.failed })
      // "checking" only means the picture was accepted: keep waiting for the report.
    }
  })
}

/** Check one photo or video for flood water and return the text to show the user. */
export async function checkMedia(file: File, options: MediaOptions): Promise<string> {
  if (!file.type.startsWith("image/") && !isVideo(file)) throw new MediaCheckError(MESSAGES.notMedia)
  const picture = isVideo(file) ? await videoToJpeg(file) : await photoToJpeg(file)
  return askBackend(picture, options)
}
