import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { emailDomainOf, emailUsedRecently, isFreeEmailDomain, parseAmount, MIN_CASE_VALUE } from "@/lib/audit";
import { cookies } from "next/headers";
import { resolveReferral } from "@/lib/partners";
import { REF_COOKIE } from "@/lib/referral-cookie";
import { isEmailConfigured, sendAuditVerifyEmail } from "@/lib/email";
import { error, json } from "@/lib/api";
import { clientIp, withinLimits, tooMany, HOUR, DAY } from "@/lib/rate-limit";
import { isBot, BOT_MESSAGE } from "@/lib/bot-check";

// The two optional numbers come as typed ("$12,000", "12k") or as numbers.
const Amount = z.union([z.number(), z.string().max(40)]).nullable().optional();

const Body = z.object({
  contactName: z.string().min(1).max(120),
  practiceName: z.string().min(1).max(160),
  workEmail: z.string().email(),
  caseValueUsd: Amount,
  monthlyLeads: Amount,
  ref: z.string().max(60).nullable().optional(),
});

// POST /api/audit — start a Setter Audit. Creates a prospect office + a prospect
// "setter" user to own the calls, plus the audit row, and emails a verify link.
export async function POST(req: Request) {
  if (await isBot()) return error(BOT_MESSAGE, 403);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Check the form and try again.", 422);
  const { contactName, practiceName, workEmail, ref } = parsed.data;
  const caseValueUsd = parseAmount(parsed.data.caseValueUsd, 1_000_000, MIN_CASE_VALUE);
  const monthlyLeads = parseAmount(parsed.data.monthlyLeads, 100_000);

  const email = workEmail.trim().toLowerCase();
  const domain = emailDomainOf(email);
  if (!domain) return error("Enter a valid email.", 422);

  // Each start emails a link from our domain, so it's limited per visitor and
  // per address...
  const ip = clientIp(req);
  const limit = await withinLimits([
    { key: `audit:ip:${ip}`, limit: 5, windowSeconds: HOUR },
    { key: `audit:ip-day:${ip}`, limit: 20, windowSeconds: DAY },
    { key: `audit:email:${email}`, limit: 3, windowSeconds: DAY },
  ]);
  if (!limit.ok) return tooMany(limit.retryAfter, "We've had a lot of requests from you — please wait a little and try again, or check your inbox for the link we sent.");

  // One free audit per email per 30 days. One that's verified but has no report
  // yet (opened on another device, say, or waiting for a review) just gets its
  // link again.
  const cooldown = await emailUsedRecently(email);
  const resend = cooldown.unfinished;
  if (cooldown.used && !resend) {
    const when = cooldown.nextAt ? cooldown.nextAt.toLocaleDateString("en-US", { month: "long", day: "numeric" }) : "soon";
    return error(`You've already run a free audit with this email — the link in our email opens your report. You can run another after ${when}.`, 429);
  }

  // ...and overall (a flood here would get our sending domain suspended). Only
  // requests that are about to send count, so one visitor hammering the form
  // can't use it up for everyone.
  const overall = await withinLimits([{ key: "audit:all", limit: 300, windowSeconds: HOUR }]);
  if (!overall.ok) {
    console.warn("[setmo:audit] hourly cap on free-audit emails reached", { retryAfter: overall.retryAfter });
    return tooMany(overall.retryAfter, "We're getting a lot of requests right now — please try again in a few minutes.");
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  if (resend) {
    // This link opens an audit that's already under way, so it only ever goes
    // to that inbox — never back in the response, even in dev.
    if (!isEmailConfigured()) return error("Email isn't set up here, so we can't send that link again.", 503);
    const verifyUrl = `${origin}/api/audit/${resend.id}/verify?token=${resend.token}`;
    const emailed = await sendAuditVerifyEmail({ to: email, link: verifyUrl, practiceName: resend.practiceName, kind: "resent" });
    if (!emailed) return error("We couldn't send the email just now. Please try again in a minute.", 502);
    return json({ id: resend.id, emailed: true, resent: true });
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
      caseValueUsd,
      monthlyLeads,
    },
  });

  const verifyUrl = `${origin}/api/audit/${audit.id}/verify?token=${token}`;
  // A personal address is reviewed by hand once it's confirmed; the form says so.
  const review = isFreeEmailDomain(domain);

  // In dev (no email configured) hand back the link so the flow is testable. In
  // production the link only ever travels by email — that's what proves the
  // address is theirs — so a failed send is an error, never a shortcut.
  if (!isEmailConfigured()) return json({ id: audit.id, emailed: false, review, verifyUrl });
  const emailed = await sendAuditVerifyEmail({ to: email, link: verifyUrl, practiceName });
  if (!emailed) return error("We couldn't send the confirmation email just now. Please try again in a minute.", 502);
  return json({ id: audit.id, emailed: true, review });
}
