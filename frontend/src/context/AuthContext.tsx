"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

import { authConfigured, getSupabase } from "@/lib/supabase"

/** The ways to sign in. Each one has to be switched on in Supabase (Authentication, Providers). */
export type SignInProvider = "google" | "facebook"

type AuthValue = {
  /**
   * loading: still checking for a saved session; signedIn / signedOut; unconfigured: sign-in is not set up in this
   * build (local work), so the app shows no sign-in controls.
   */
  status: "loading" | "signedIn" | "signedOut" | "unconfigured"
  /**
   * Who is signed in, for showing it: their name, or their email. A Facebook account can have no email (it can be made with a
   * phone number), so this can be null even when signed in.
   */
  displayName: string | null
  /** Opens the provider's sign-in page (Google or Facebook) and comes back to this page afterwards. */
  signIn: (provider: SignInProvider) => Promise<void>
  signOut: () => Promise<void>
  /** A plain sentence when sign-in failed, or "". */
  error: string
}

const EMPTY: AuthValue = {
  status: "unconfigured",
  displayName: null,
  signIn: async () => {},
  signOut: async () => {},
  error: "",
}

const AuthContext = createContext<AuthValue>(EMPTY)

/**
 * Keeps track of who is signed in (Google or Facebook, through Supabase) and shares it with the page. The library keeps the session in
 * the browser, refreshes it before it expires, and finishes the sign-in when the provider sends the person back.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthValue["status"]>(authConfigured ? "loading" : "unconfigured")
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) return

    function apply(session: { user: { email?: string | null; user_metadata?: Record<string, unknown> } } | null) {
      setStatus(session ? "signedIn" : "signedOut")
      const name = session?.user.user_metadata?.full_name ?? session?.user.user_metadata?.name
      setDisplayName((typeof name === "string" && name) || session?.user.email || null)
    }

    // Called once with the saved session (or none), and again whenever the person signs in or out.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => apply(session))
    return () => data.subscription.unsubscribe()
  }, [])

  const signIn = useCallback(async (provider: SignInProvider) => {
    const supabase = getSupabase()
    if (!supabase) return
    setError("")
    const { error: failure } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/assistant` },
    })
    if (failure) setError("Sign-in could not start. Please try again in a moment.")
  }, [])

  const signOut = useCallback(async () => {
    await getSupabase()?.auth.signOut()
  }, [])

  const value = useMemo<AuthValue>(() => ({ status, displayName, signIn, signOut, error }), [status, displayName, signIn, signOut, error])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  return useContext(AuthContext)
}
