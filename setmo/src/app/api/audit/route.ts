import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { emailDomainOf, emailUsedRecently } from "@/lib/audit";
import { cookies } from "next/headers";
import { resolveReferral } from "@/lib/partners";
import { REF_COOKIE } from "@/lib/referral-cookie";
import { isEmailConfigured, sendAuditVerifyEmail } from "@/lib/email";
import { error, json } from "@/lib/api";
import { clientIp, withinLimits, tooMany, HOUR, DAY } from "@/lib/rate-limit";
import { isBot, BOT_MESSAGE } from "@/lib/bot-check";

const Body = z.object({
  contactName: z.string().min(1).max(120),
  practiceName: z.string().min(1).max(160),
  workEmail: z.string().email(),
  caseValueUsd: z.number().int().min(0).max(1_000_000).nullable().optional(),
  monthlyLeads: z.number().int().min(0).max(100_000).nullable().optional(),
  ref: z.string().max(60).nullable().optional(),
});

// POST /api/audit — start a Setter Audit. Creates a prospect office + a prospect
// "setter" user to own the calls, plus the audit row, and emails a verify link.
export async function POST(req: Request) {
  if (await isBot()) return error(BOT_MESSAGE, 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Check the form and try again.", 422);
  const { contactName, practiceName, workEmail, caseValueUsd, monthlyLeads, ref } = parsed.data;

  const email = workEmail.trim().toLowerCase();
  const domain = emailDomainOf(email);
  if (!domain) return error("Enter a valid email.", 422);

  // Each start emails a link from our domain, so it's limited per visitor, per
  // address, and overall (a flood here would get our sending domain suspended).
  const ip = clientIp(req);
  const limit = await withinLimits([
    { key: `audit:ip:${ip}`, limit: 5, windowSeconds: HOUR },
    { key: `audit:ip-day:${ip}`, limit: 20, windowSeconds: DAY },
    { key: `audit:email:${email}`, limit: 3, windowSeconds: DAY },
    { key: "audit:all", limit: 300, windowSeconds: HOUR },
  ]);
  if (!limit.ok) return tooMany(limit.retryAfter, "We've had a lot of requests from you — please wait a little and try again, or check your inbox for the link we sent.");

  // One free audit per email per 30 days.
  const cooldown = await emailUsedRecently(email);
  if (cooldown.used) {
    const when = cooldown.nextAt ? cooldown.nextAt.toLocaleDateString("en-US", { month: "long", day: "numeric" }) : "soon";
    return error(`You've already run a free audit with this email. You can run another after ${when}.`, 429);
  }

  const token = randomBytes(24).toString("base64url");
  const [firstName, ...rest] = contactName.trim().split(/\s+/);

  // First-touch partner attribution (carries from the prospect office through the
  // account conversion later): the link's code, else the cookie from an earlier
  // visit. A partner or rep running an audit on themselves is never credited.
  const referral = await resolveReferral({ code: ref, cookieCode: (await cookies()).get(REF_COOKIE)?.value, email });
  const office = await prisma.office.create({
    data: {
      name: practiceName,
      isProspect: true,
      ...(referral ? { referredByPartnerId: referral.partnerId, referralCode: referral.code, referredAt: new Date() } : {}),
    },
  });
  const prospect = await prisma.user.create({
    data: {
      id: randomUUID(),
      email: `audit-${token.slice(0, 10).toLowerCase()}@prospect.setmo`, // technical owner; real email lives on the audit
      firstName: firstName || "Setter",
      lastName: rest.join(" ") || null,
      role: "SETTER",
      status: "INVITED",
      officeId: office.id,
    },
  });

  const audit = await prisma.setterAudit.create({
    data: {
      officeId: office.id,
      prospectUserId: prospect.id,
      contactName,
      practiceName,
      email,
      emailDomain: domain,
      token,
      caseValueUsd: caseValueUsd ?? null,
      monthlyLeads: monthlyLeads ?? null,
    },
  });

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const verifyUrl = `${origin}/api/audit/${audit.id}/verify?token=${token}`;

  // In dev (no email configured) hand back the link so the flow is testable. In
  // production the link only ever travels by email — that's what proves the
  // address is theirs — so a failed send is an error, never a shortcut.
  if (!isEmailConfigured()) return json({ id: audit.id, emailed: false, verifyUrl });
  const emailed = await sendAuditVerifyEmail({ to: email, link: verifyUrl, practiceName });
  if (!emailed) return error("We couldn't send the confirmation email just now. Please try again in a minute.", 502);
  return json({ id: audit.id, emailed: true });
}
