"use client"

import { useState } from "react"

/** A photo waiting to be checked, with a temporary address for showing a preview of it. */
export type Attachment = { file: File; url: string }

/**
 * The photo the user has picked but not sent yet.
 *
 * `attachFile` keeps a file (and shows an error for anything that is not a photo), `removeAttachment` drops it
 * and frees its preview address, and `takeAttachment` hands it over to a message: the preview lives on in that message,
 * so its address is NOT freed here.
 */
export function useMediaAttachment() {
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const [attachError, setAttachError] = useState("")

  function attachFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setAttachError("Please choose a photo.")
      return
    }
    setAttachError("")
    if (attachment) URL.revokeObjectURL(attachment.url)
    setAttachment({ file, url: URL.createObjectURL(file) })
  }

  function removeAttachment() {
    if (attachment) URL.revokeObjectURL(attachment.url)
    setAttachment(null)
  }

  function takeAttachment() {
    setAttachment(null)
  }

  return { attachment, attachError, attachFile, removeAttachment, takeAttachment }
}
