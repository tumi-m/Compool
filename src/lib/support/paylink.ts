/**
 * A creator's payment link, as something safe to send a supporter to.
 *
 * It is creator-supplied and handed to window.open, so it is held to the one
 * shape a payment page has: an absolute https URL with a host and no embedded
 * credentials. Anything else — a javascript: or data: URL a browser might run,
 * plain http that sends someone's payment details in the clear, a bare
 * "ko-fi.com/…" that would resolve against this site — is refused rather than
 * repaired, so the creator sees it and fixes it.
 */
export function safePayLink(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || !u.hostname || u.username || u.password) return null;
  return u.toString();
}
