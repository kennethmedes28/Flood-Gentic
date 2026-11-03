import type { MessageKey } from "@/i18n/messages"

/** An error whose message is an interface text: `key` is translated into the chosen language when the page shows it. */
export class KeyedError extends Error {
  constructor(readonly key: MessageKey) {
    super(key)
  }
}
