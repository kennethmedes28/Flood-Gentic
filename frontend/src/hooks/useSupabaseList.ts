"use client"

import { useEffect, useState } from "react"

/**
 * A list that starts as the built-in copy and is replaced by the backend's list (read from Supabase) once it arrives.
 * If the backend cannot be reached, the built-in copy stays, so the page always has something to show.
 *
 * `load` must not change between renders (pass a function defined outside the component).
 */
export function useSupabaseList<T>(builtIn: T[], load: (signal: AbortSignal) => Promise<T[]>): T[] {
  const [list, setList] = useState<T[]>(builtIn)

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
      .then(setList)
      .catch(() => {
        // Keep the built-in list. An aborted request (the page was closed) ends up here too.
      })
    return () => controller.abort()
  }, [load])

  return list
}
