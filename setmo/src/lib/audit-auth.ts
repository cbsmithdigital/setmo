import { cookies } from "next/headers";

export const AUDIT_COOKIE = "setmo_audit";

// Light, account-less access: the audit's secret token rides in a cookie and is
// checked against the row (see loadAuditAccess in lib/audit). Set when the
// prospect verifies their email.
export async function setAuditCookie(id: string, token: string) {
  (await cookies()).set(AUDIT_COOKIE, `${id}:${token}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}
