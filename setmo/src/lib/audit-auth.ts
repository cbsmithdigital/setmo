import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export const AUDIT_COOKIE = "setmo_audit";

// Light, account-less access: the audit's secret token rides in a cookie and is
// checked against the row. Set when the prospect verifies their email.
export async function setAuditCookie(id: string, token: string) {
  (await cookies()).set(AUDIT_COOKIE, `${id}:${token}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function loadAuditByCookie(id: string) {
  const v = (await cookies()).get(AUDIT_COOKIE)?.value;
  if (!v) return null;
  const [cid, token] = v.split(":");
  if (cid !== id || !token) return null;
  const audit = await prisma.setterAudit.findUnique({ where: { id } });
  if (!audit || audit.token !== token) return null;
  return audit;
}
