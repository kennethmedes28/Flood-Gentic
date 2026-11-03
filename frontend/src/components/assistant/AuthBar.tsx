"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import { GlassPanel } from "@/components/ui/GlassPanel"
import { useAuth } from "@/context/AuthContext"
import { useT } from "@/context/LanguageContext"
import { ACCESS_REQUEST_SUBJECT, CONTACT_EMAIL, mailtoLink } from "@/lib/contact"
import { fetchUsage, type Usage } from "@/lib/usage-api"

/**
 * Who is signed in, and the Google and Facebook sign-in buttons when nobody is. The assistant costs money to run, so chat, photo checks
 * and voice need a Google or Facebook account; an emergency message is still answered without signing in, and this says so.
 * Shows nothing while the saved session is being checked, or when sign-in is not set up in this build.
 */
export function AuthBar({ refreshKey }: { refreshKey: number }) {
  const { status, displayName, signIn, signOut, error } = useAuth()
  const t = useT()
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
            {t("auth.signedInAs")} <span className="font-medium">{displayName ?? t("auth.yourAccount")}</span>
          </p>
          {usage && (
            <p className="text-xs">
              {t("auth.usage", { messages: usage.messagesToday, messagesLimit: usage.messagesLimit, photos: usage.photosToday, photosLimit: usage.photosLimit })}
            </p>
          )}
          <p className="text-xs">
            <Link href="/privacy" className="underline underline-offset-2">{t("auth.privacy")}</Link> ·{" "}
            <Link href="/data-deletion" className="underline underline-offset-2">{t("auth.dataDeletion")}</Link>
          </p>
        </div>
        <button type="button" onClick={() => void signOut()} className="min-h-11 rounded-full px-4 text-sm font-medium">
          {t("auth.signOut")}
        </button>
      </GlassPanel>
    )
  }

  return (
    <GlassPanel className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">{t("auth.prompt")}</p>
        <p className="text-xs" style={{ color: "var(--glass-text-muted)" }}>
          {t("auth.emergencyNote")}
        </p>
        <p className="text-xs" style={{ color: "var(--glass-text-muted)" }}>
          {t("auth.accessBefore")}
          <a href={mailtoLink(ACCESS_REQUEST_SUBJECT)} className="underline underline-offset-2">
            {CONTACT_EMAIL}
          </a>
          {t("auth.accessAfter")} <Link href="/privacy" className="underline underline-offset-2">{t("auth.privacy")}</Link> ·{" "}
          <Link href="/data-deletion" className="underline underline-offset-2">{t("auth.dataDeletion")}</Link>
        </p>
        {error && (
          <p className="text-xs font-medium" role="alert">
            {t(error)}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void signIn("google")}
          className="min-h-11 rounded-full bg-[var(--glass-accent)] px-5 text-sm font-semibold text-white [text-shadow:none]"
        >
          {t("auth.signInGoogle")}
        </button>
        <button
          type="button"
          onClick={() => void signIn("facebook")}
          className="min-h-11 rounded-full bg-[var(--glass-accent)] px-5 text-sm font-semibold text-white [text-shadow:none]"
        >
          {t("auth.signInFacebook")}
        </button>
      </div>
    </GlassPanel>
  )
}
