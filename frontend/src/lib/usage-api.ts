import { API_URL } from "@/lib/chat-api"
import { authHeaders } from "@/lib/supabase"

/** The signed-in user's usage against the spending caps (GET /me/usage). */
export type Usage = {
  messagesToday: number
  messagesLimit: number
  photosToday: number
  photosLimit: number
  voiceToday: number
  voiceLimit: number
  tokensThisMonth: number
  tokensLimit: number
  /** True for a tester account (UNLIMITED_EMAILS on the backend): the per-user limits do not apply. */
  unlimited: boolean
}

/** Read the user's usage, or null when it cannot be read (not signed in, backend down): the page just shows nothing. */
export async function fetchUsage(signal?: AbortSignal): Promise<Usage | null> {
  try {
    const response = await fetch(`${API_URL}/me/usage`, { headers: await authHeaders(), signal })
    if (!response.ok) return null
    const body = await response.json()
    return {
      messagesToday: body.messages_today,
      messagesLimit: body.messages_limit,
      photosToday: body.photos_today,
      photosLimit: body.photos_limit,
      voiceToday: body.voice_today,
      voiceLimit: body.voice_limit,
      tokensThisMonth: body.tokens_this_month,
      tokensLimit: body.tokens_limit,
      unlimited: body.unlimited === true,
    }
  } catch {
    return null
  }
}
