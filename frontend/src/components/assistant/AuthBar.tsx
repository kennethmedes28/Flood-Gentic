"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import { GlassPanel } from "@/components/ui/GlassPanel"
import { useAuth } from "@/context/AuthContext"
import { ACCESS_REQUEST_SUBJECT, CONTACT_EMAIL, mailtoLink } from "@/lib/contact"
import { fetchUsage, type Usage } from "@/lib/usage-api"

/**
 * Who is signed in, and the Google and Facebook sign-in buttons when nobody is. The assistant costs money to run, so chat, photo checks
 * and voice need a Google or Facebook account; an emergency message is still answered without signing in, and this says so.
 * Shows nothing while the saved session is being checked, or when sign-in is not set up in this build.
 */
export function AuthBar({ refreshKey }: { refreshKey: number }) {
  const { status, displayName, signIn, signOut, error } = useAuth()
  const [usage, setUsage] = useState<Usage | null>(null)

  // Read what has been used when the person signs in, and again after every message (refreshKey changes then).
  useEffect(() => {
    if (status !== "signedIn") return
    const controller = new AbortController()
    void fetchUsage(controller.signal).then((found) => {
      if (!controller.signal.aborted) setUsage(found)
    })
    return () => controller.abort()
  }, [status, refreshKey])

  if (status === "loading" || status === "unconfigured") return null

  if (status === "signedIn") {
    return (
      <GlassPanel className="flex flex-wrap items-center justify-between gap-3 px-5 py-2 text-sm">
        <div className="min-w-0 text-sm" style={{ color: "var(--glass-text-muted)" }}>
          <p className="truncate">
            Signed in as <span className="font-medium">{displayName ?? "your account"}</span>
          </p>
          {usage && (
            <p className="text-xs">
              Today: {usage.messagesToday} of {usage.messagesLimit} messages · {usage.photosToday} of {usage.photosLimit} photo checks
            </p>
          )}
          <p className="text-xs">
            <Link href="/privacy" className="underline underline-offset-2">Privacy</Link> ·{" "}
            <Link href="/data-deletion" className="underline underline-offset-2">Data deletion</Link>
          </p>
        </div>
        <button type="button" onClick={() => void signOut()} className="min-h-11 rounded-full px-4 text-sm font-medium">
          Sign out
        </button>
      </GlassPanel>
    )
  }

  return (
    <GlassPanel className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">Sign in to chat, check photos or use voice.</p>
        <p className="text-xs" style={{ color: "var(--glass-text-muted)" }}>
          In an emergency you can still type it here without signing in, and you can always call 911.
        </p>
        <p className="text-xs" style={{ color: "var(--glass-text-muted)" }}>
          Can&apos;t sign in? Google and Facebook sign-in may be limited to approved accounts while the apps are under review. To request access, email{" "}
          <a href={mailtoLink(ACCESS_REQUEST_SUBJECT)} className="underline underline-offset-2">
            {CONTACT_EMAIL}
          </a>
          . <Link href="/privacy" className="underline underline-offset-2">Privacy</Link> ·{" "}
          <Link href="/data-deletion" className="underline underline-offset-2">Data deletion</Link>
        </p>
        {error && (
          <p className="text-xs font-medium" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void signIn("google")}
          className="min-h-11 rounded-full bg-[var(--glass-accent)] px-5 text-sm font-semibold text-white [text-shadow:none]"
        >
          Sign in with Google
        </button>
        <button
          type="button"
          onClick={() => void signIn("facebook")}
          className="min-h-11 rounded-full bg-[var(--glass-accent)] px-5 text-sm font-semibold text-white [text-shadow:none]"
        >
          Sign in with Facebook
        </button>
      </div>
    </GlassPanel>
  )
}
