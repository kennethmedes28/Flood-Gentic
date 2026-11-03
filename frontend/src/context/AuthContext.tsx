"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

import { authConfigured, getSupabase } from "@/lib/supabase"

type AuthValue = {
  /**
   * loading: still checking for a saved session; signedIn / signedOut; unconfigured: sign-in is not set up in this
   * build (local work), so the app shows no sign-in controls.
   */
  status: "loading" | "signedIn" | "signedOut" | "unconfigured"
  /** The signed-in person's email, for showing who is signed in. */
  email: string | null
  /** Opens Google's sign-in page and comes back to this page afterwards. */
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  /** A plain sentence when sign-in failed, or "". */
  error: string
}

const EMPTY: AuthValue = {
  status: "unconfigured",
  email: null,
  signInWithGoogle: async () => {},
  signOut: async () => {},
  error: "",
}

const AuthContext = createContext<AuthValue>(EMPTY)

/**
 * Keeps track of who is signed in (Google, through Supabase) and shares it with the page. The library keeps the session in
 * the browser, refreshes it before it expires, and finishes the sign-in when Google sends the person back.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthValue["status"]>(authConfigured ? "loading" : "unconfigured")
  const [email, setEmail] = useState<string | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) return

    function apply(session: { user: { email?: string | null } } | null) {
      setStatus(session ? "signedIn" : "signedOut")
      setEmail(session?.user.email ?? null)
    }

    // Called once with the saved session (or none), and again whenever the person signs in or out.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => apply(session))
    return () => data.subscription.unsubscribe()
  }, [])

  const signInWithGoogle = useCallback(async () => {
    const supabase = getSupabase()
    if (!supabase) return
    setError("")
    const { error: failure } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/assistant` },
    })
    if (failure) setError("Sign-in could not start. Please try again in a moment.")
  }, [])

  const signOut = useCallback(async () => {
    await getSupabase()?.auth.signOut()
  }, [])

  const value = useMemo<AuthValue>(() => ({ status, email, signInWithGoogle, signOut, error }), [status, email, signInWithGoogle, signOut, error])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  return useContext(AuthContext)
}
