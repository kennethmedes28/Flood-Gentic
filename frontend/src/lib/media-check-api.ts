/**
 * Getting a photo ready to be checked for flood water.
 *
 * A photo is made smaller first and goes to the backend as text with the chat message (POST /chat/stream, see
 * chat-api.ts). A video is not touched here: it is sent whole (sendChatVideoStream) and analysed in full.
 * Each check costs API credit on the backend: 4 SAM requests for a photo (two water phrases, on the photo and on a mirrored
 * copy) and 2 for a video; counting people and vehicles adds 2 more.
 */

/** The biggest video the backend accepts, in megabytes (see MAX_VIDEO_BYTES in backend/src/services/media_upload.py). */
export const MAX_VIDEO_MB = 200

/** Pictures are scaled down to this width and saved as JPEG, which keeps them far below the backend's size limit. */
const MAX_WIDTH = 640
const JPEG_QUALITY = 0.8
/** The sorts of file the picker accepts. */
export const MEDIA_ACCEPT = "image/*,video/*"

export class MediaCheckError extends Error {}

/** What the user is shown for each thing that can go wrong. */
const MESSAGES = {
  unreadable: "That file couldn't be opened. Try a different photo or video.",
  notMedia: "Please choose a photo or a video.",
}

/** True when the file is a video. */
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

/** A picture as base64 text (without the "data:" prefix), the form the chat endpoint takes it in. */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "")
    reader.onerror = () => reject(new MediaCheckError(MESSAGES.unreadable))
    reader.readAsDataURL(blob)
  })
}

/** Turn a photo into one small JPEG, as base64 text, ready to send with a chat message. */
export async function preparePhotoForChat(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new MediaCheckError(MESSAGES.notMedia)
  return blobToBase64(await photoToJpeg(file))
}

/** Say so when a video is over the size the backend accepts, before spending the time to upload it. */
export function checkVideoSize(file: File): void {
  if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
    throw new MediaCheckError(`That video is too large. Please choose one under ${MAX_VIDEO_MB} MB.`)
  }
}
