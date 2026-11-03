import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/**
 * The Supabase client, used only for Google and Facebook sign-in. The address and the public (publishable) key are meant for the
 * browser; the secret key must never be put here.
 *
 * When the two NEXT_PUBLIC_SUPABASE_* variables are not set (local work without sign-in), there is no client and the
 * app runs signed-out; the backend then has to be started with REQUIRE_AUTH=false.
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
// Both names are accepted: Supabase now calls it the "publishable" key, and older projects call it the "anon" key.
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/** True when the .env.local still holds the example placeholders ("your-project...") instead of real values. */
function isPlaceholder(value: string | undefined): boolean {
  return !value || value.startsWith("your")
}

export const authConfigured = !isPlaceholder(SUPABASE_URL) && !isPlaceholder(SUPABASE_KEY)

let client: SupabaseClient | null = null

/** The shared client, or null when sign-in is not set up. */
export function getSupabase(): SupabaseClient | null {
  if (!authConfigured) return null
  if (!client) {
    client = createClient(SUPABASE_URL as string, SUPABASE_KEY as string, {
      // PKCE: the provider sends the browser back with a short code that is exchanged for the session, which keeps the
      // tokens out of the address bar. The session is kept in the browser and refreshed by the library.
      auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  }
  return client
}

/** The current access token, or null when nobody is signed in (or sign-in is not set up). */
export async function getAccessToken(): Promise<string | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

/** The `Authorization` header for a request to the backend, or nothing when signed out. */
export async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}
