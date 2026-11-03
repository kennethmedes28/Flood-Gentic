"use client"

import { GlassPanel } from "@/components/ui/GlassPanel"
import { useAuth } from "@/context/AuthContext"

/**
 * Who is signed in, and the Google sign-in button when nobody is. The assistant costs money to run, so chat, photo checks
 * and voice need a Google account; an emergency message is still answered without signing in, and this says so.
 * Shows nothing while the saved session is being checked, or when sign-in is not set up in this build.
 */
export function AuthBar() {
  const { status, email, signInWithGoogle, signOut, error } = useAuth()

  if (status === "loading" || status === "unconfigured") return null

  if (status === "signedIn") {
    return (
      <GlassPanel className="flex flex-wrap items-center justify-between gap-3 px-5 py-2 text-sm">
        <p className="min-w-0 truncate" style={{ color: "var(--glass-text-muted)" }}>
          Signed in as <span className="font-medium">{email ?? "your Google account"}</span>
        </p>
        <button type="button" onClick={() => void signOut()} className="min-h-11 rounded-full px-4 text-sm font-medium">
          Sign out
        </button>
      </GlassPanel>
    )
  }

  return (
    <GlassPanel className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">Sign in with Google to chat, check photos or use voice.</p>
        <p className="text-xs" style={{ color: "var(--glass-text-muted)" }}>
          In an emergency you can still type it here without signing in, and you can always call 911.
        </p>
        {error && (
          <p className="text-xs font-medium" role="alert">
            {error}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => void signInWithGoogle()}
        className="min-h-11 rounded-full bg-[var(--glass-accent)] px-5 text-sm font-semibold text-white [text-shadow:none]"
      >
        Sign in with Google
      </button>
    </GlassPanel>
  )
}
