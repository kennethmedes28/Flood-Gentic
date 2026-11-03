/**
 * Where people write to about privacy, data deletion and access. It is shown on the privacy and data-deletion pages, in the
 * sign-in bar and in the README, so it is kept in one place.
 */
export const CONTACT_EMAIL = "kennethmedes28@gmail.com"

/** A mailto link with a subject already filled in. */
export function mailtoLink(subject: string): string {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`
}

export const ACCESS_REQUEST_SUBJECT = "Flood-Gentic access request"
export const DELETION_REQUEST_SUBJECT = "Flood-Gentic data deletion request"
