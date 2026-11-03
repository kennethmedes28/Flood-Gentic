"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { API_URL } from "@/lib/chat-api"
import { authConfigured, getAccessToken } from "@/lib/supabase"

/** What the voice input is doing. */
export type VoiceStatus = "idle" | "connecting" | "listening" | "processing"

/** Sample rates the backend accepts (docs/voice_chat.md). */
const ACCEPTED_RATES = [16000, 24000]
const PREFERRED_RATE = 16000
/** About 80 ms of audio per frame at 16 kHz, which is what the backend expects. */
const FRAME_SAMPLES = 1280
/** The backend cuts a connection after 120 s; stop a little earlier so the last words still arrive. */
const MAX_RECORDING_MS = 110_000
/** How long to wait for the server's answer before giving up, when connecting and when finishing. */
const CONNECT_TIMEOUT_MS = 8000
const FINISH_TIMEOUT_MS = 8000
/** Audio recorded while the connection opens is kept (about 4 s at most) and sent once it is ready. */
const MAX_QUEUED_FRAMES = 50

const MESSAGES = {
  insecure: "Voice input needs a secure page (https) or localhost. You can still type your question.",
  unsupported: "This browser can't record voice. You can still type your question.",
  denied: "The microphone is blocked. Allow it in your browser's site settings, then try again.",
  noMicrophone: "No microphone was found. Check that one is connected, or type your question.",
  micBusy: "The microphone is being used by another app. Close it and try again.",
  micFailed: "The microphone couldn't start. Please try again, or type your question.",
  server: "I can't reach the voice service right now. You can still type your question.",
  signIn: "Please sign in with Google or Facebook to use voice. You can still type your question.",
  silence: "I didn't hear anything. Try again, a little closer to the microphone.",
}

/** Turn the error from getUserMedia into one friendly sentence. */
function microphoneMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : ""
  if (name === "NotAllowedError" || name === "SecurityError") return MESSAGES.denied
  if (name === "NotFoundError" || name === "OverconstrainedError") return MESSAGES.noMicrophone
  if (name === "NotReadableError" || name === "AbortError") return MESSAGES.micBusy
  return MESSAGES.micFailed
}

/** Everything one recording needs, so it can be shut down in one place. */
type Session = {
  stream: MediaStream
  context: AudioContext
  socket: WebSocket | null
  queue: ArrayBuffer[]
  ready: boolean
  heardText: boolean
  timers: number[]
}

type Options = {
  /** Called with the words so far while the user speaks. Each call replaces the previous one. */
  onPartial: (text: string) => void
  /** Called once with the finished text after the user stops. */
  onFinal: (text: string) => void
}

/**
 * Microphone to text, through the backend's /ws/voice (docs/voice_chat.md).
 *
 * `toggle()` starts a recording; calling it again stops it. While recording, the microphone is turned into
 * 16-bit audio by an AudioWorklet (public/voice-pcm-worklet.js) and sent to the backend in 80 ms frames,
 * and the words so far come back as they are recognised. After the stop, the final text arrives and the
 * connection closes. The text is only handed to the caller: nothing is sent to the chat from here.
 */
export function useVoiceTranscription({ onPartial, onFinal }: Options) {
  const [status, setStatus] = useState<VoiceStatus>("idle")
  const [error, setError] = useState<string | null>(null)

  const session = useRef<Session | null>(null)
  const statusRef = useRef<VoiceStatus>("idle")
  const callbacks = useRef({ onPartial, onFinal })
  useEffect(() => {
    callbacks.current = { onPartial, onFinal }
  })

  const changeStatus = useCallback((next: VoiceStatus) => {
    statusRef.current = next
    setStatus(next)
  }, [])

  /** Stop the microphone and the audio processing. The connection stays open so the last words can arrive. */
  const releaseMicrophone = useCallback(() => {
    const current = session.current
    if (!current) return
    current.stream.getTracks().forEach((track) => track.stop())
    if (current.context.state !== "closed") void current.context.close()
  }, [])

  /** Close everything and return to idle. Safe to call more than once. */
  const teardown = useCallback(() => {
    const current = session.current
    session.current = null
    if (current) {
      current.timers.forEach((timer) => window.clearTimeout(timer))
      current.stream.getTracks().forEach((track) => track.stop())
      if (current.context.state !== "closed") void current.context.close()
      if (current.socket && current.socket.readyState <= WebSocket.OPEN) current.socket.close()
    }
    changeStatus("idle")
  }, [changeStatus])

  /** Show a message and end the session. */
  const fail = useCallback(
    (message: string) => {
      setError(message)
      teardown()
    },
    [teardown]
  )

  /** The user is done speaking: stop the microphone and ask the server for the final text. */
  const stop = useCallback(() => {
    const current = session.current
    if (!current || statusRef.current === "processing") return

    if (!current.ready || !current.socket) {
      teardown() // still connecting: nothing was recognised yet, so just cancel
      return
    }

    releaseMicrophone()
    changeStatus("processing")
    if (current.socket.readyState === WebSocket.OPEN) current.socket.send(JSON.stringify({ type: "end" }))
    current.timers.push(
      window.setTimeout(() => {
        if (session.current === current) fail(MESSAGES.server) // no answer: give up instead of waiting forever
      }, FINISH_TIMEOUT_MS)
    )
  }, [changeStatus, fail, releaseMicrophone, teardown])

  const start = useCallback(async () => {
    if (statusRef.current !== "idle") return
    setError(null)

    if (!navigator.mediaDevices?.getUserMedia) {
      setError(window.isSecureContext ? MESSAGES.unsupported : MESSAGES.insecure)
      return
    }
    if (typeof AudioWorkletNode === "undefined" || typeof WebSocket === "undefined") {
      setError(MESSAGES.unsupported)
      return
    }

    changeStatus("connecting")

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      })
    } catch (caught) {
      fail(microphoneMessage(caught))
      return
    }

    // Ask for 16 kHz audio so the browser does the resampling; use what it gives if that is also accepted.
    const context = new AudioContext({ sampleRate: PREFERRED_RATE })
    const current: Session = { stream, context, socket: null, queue: [], ready: false, heardText: false, timers: [] }
    session.current = current

    try {
      if (!ACCEPTED_RATES.includes(context.sampleRate)) throw new Error("unsupported sample rate")
      await context.audioWorklet.addModule("/voice-pcm-worklet.js")
    } catch {
      fail(MESSAGES.unsupported)
      return
    }
    if (session.current !== current) return // cancelled while the worklet loaded

    // Microphone -> worklet -> (silent) speakers. The worklet only runs when connected to the output,
    // so a gain of 0 keeps the user from hearing themselves.
    const source = context.createMediaStreamSource(stream)
    const recorder = new AudioWorkletNode(context, "pcm-recorder", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { frameSize: FRAME_SAMPLES },
    })
    const silence = context.createGain()
    silence.gain.value = 0
    source.connect(recorder).connect(silence).connect(context.destination)

    const token = await getAccessToken() // a browser cannot set headers on a WebSocket, so the token goes in the address
    if (session.current !== current) return // cancelled while the token was fetched
    if (authConfigured && !token) {
      fail(MESSAGES.signIn)
      return
    }
    const tokenPart = token ? `&token=${encodeURIComponent(token)}` : ""
    const socket = new WebSocket(`${API_URL.replace(/^http/, "ws")}/ws/voice?mode=push_to_talk&rate=${context.sampleRate}${tokenPart}`)
    socket.binaryType = "arraybuffer"
    current.socket = socket
    current.timers.push(
      window.setTimeout(() => {
        if (session.current === current && !current.ready) fail(MESSAGES.server)
      }, CONNECT_TIMEOUT_MS)
    )

    recorder.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      if (current.ready && socket.readyState === WebSocket.OPEN) {
        socket.send(event.data)
      } else if (current.queue.length < MAX_QUEUED_FRAMES) {
        current.queue.push(event.data) // the connection is still opening
      }
    }

    socket.onmessage = (event) => {
      if (session.current !== current || typeof event.data !== "string") return
      const message = JSON.parse(event.data) as { type: string; text?: string; message?: string }

      if (message.type === "ready") {
        current.ready = true
        current.queue.forEach((frame) => socket.send(frame))
        current.queue = []
        changeStatus("listening")
        current.timers.push(window.setTimeout(stop, MAX_RECORDING_MS))
      } else if (message.type === "partial" && message.text) {
        current.heardText = true
        callbacks.current.onPartial(message.text)
      } else if (message.type === "final" && message.text) {
        current.heardText = true
        callbacks.current.onFinal(message.text)
      } else if (message.type === "error") {
        fail(MESSAGES.server)
      }
    }

    socket.onerror = () => {
      if (session.current === current) fail(MESSAGES.server)
    }

    // The server closes the connection once it has sent the final text.
    socket.onclose = () => {
      if (session.current !== current) return
      if (statusRef.current === "processing" && !current.heardText) setError(MESSAGES.silence)
      else if (statusRef.current !== "processing") setError(MESSAGES.server) // it closed while we were still talking
      teardown()
    }
  }, [changeStatus, fail, stop, teardown])

  /** Start when idle, stop when listening. Does nothing while connecting or finishing. */
  const toggle = useCallback(() => {
    if (statusRef.current === "idle") void start()
    else if (statusRef.current === "listening") stop()
  }, [start, stop])

  // Leaving the page must turn the microphone off.
  useEffect(() => teardown, [teardown])

  return { status, error, toggle }
}
