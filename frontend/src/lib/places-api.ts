import { API_URL } from "@/lib/chat-api"
import type { Contact } from "@/data/emergency-contacts"
import type { EvacuationCenter } from "@/data/evacuation-centers"

/** Read one list from the backend. The backend answers with the same fields the built-in lists use. */
async function fetchList<T>(path: string, signal?: AbortSignal): Promise<T[]> {
  const response = await fetch(`${API_URL}${path}`, { signal })
  if (!response.ok) throw new Error(`The backend answered ${response.status}.`)
  const list = (await response.json()) as T[]
  if (!Array.isArray(list) || list.length === 0) throw new Error("The backend sent an empty list.")
  return list
}

/** All evacuation centers from Supabase (GET /places/evacuation-centers). */
export function fetchEvacuationCenters(signal?: AbortSignal): Promise<EvacuationCenter[]> {
  return fetchList<EvacuationCenter>("/places/evacuation-centers", signal)
}

/** All emergency contacts from Supabase (GET /places/contacts). */
export function fetchContacts(signal?: AbortSignal): Promise<Contact[]> {
  return fetchList<Contact>("/places/contacts", signal)
}
