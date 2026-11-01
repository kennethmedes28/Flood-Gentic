/**
 * A tap-to-call link for a phone number, or null when the number is not a plain one.
 *
 * Only numbers made of digits, spaces, hyphens and brackets (and a leading +) get a link, and only the
 * formatting is removed: no digit is ever added or changed. Ranges ("8882-4151 to 77"), extensions
 * ("local 100") and text instructions ("Text PNP to 2920") return null and are shown exactly as written.
 */
export function telHref(number: string): string | null {
  const text = number.trim()
  if (!/^\+?[\d\s()-]+$/.test(text)) return null
  const dialled = text.replace(/[^\d+]/g, "")
  return dialled.replace("+", "").length >= 3 ? `tel:${dialled}` : null
}
