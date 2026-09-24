// Referral tracking cookie, set by src/proxy.ts when a visitor arrives on a
// partner link (?ref=CODE) and read at sign-up / audit so the account is credited
// even if they clicked around first or came back later.
//
// It holds the last few ?ref codes the browser arrived with, newest first. Plenty
// of other sites tack a generic ?ref= onto their links (ref=newsletter, ref=fb),
// so one of those must not wipe out a partner's code — at sign-up, the newest
// code that belongs to a real partner wins. Dependency-free: the proxy imports it.
export const REF_COOKIE = "setmo_ref";
export const REF_COOKIE_MAX_AGE = 90 * 24 * 60 * 60; // 90 days
const MAX_CODES = 5;

/** A referral code as stored: lowercase letters, digits and dashes only (2–60). */
export function cleanRefCode(code: string | null | undefined): string | null {
  const c = (code ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "");
  return c.length >= 2 && c.length <= 60 ? c : null;
}

/** The codes in the cookie, newest first. Also reads the old single-code value. */
export function refCodesFromCookie(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(".")
    .map((c) => cleanRefCode(c))
    .filter((c): c is string => Boolean(c));
}

/** The cookie value after arriving with `code` (moved to the front, capped). */
export function addRefCode(value: string | null | undefined, code: string): string {
  return [code, ...refCodesFromCookie(value).filter((c) => c !== code)].slice(0, MAX_CODES).join(".");
}
