import { randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { emailDomainOf } from "@/lib/audit";
import { partnerIdForCode } from "@/lib/partners";
import { sendAuditVerifyEmail } from "@/lib/email";
import { error, json } from "@/lib/api";

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
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Check the form and try again.", 422);
  const { contactName, practiceName, workEmail, caseValueUsd, monthlyLeads, ref } = parsed.data;

  const email = workEmail.trim().toLowerCase();
  const domain = emailDomainOf(email);
  if (!domain) return error("Enter a valid email.", 422);

  const token = randomBytes(24).toString("base64url");
  const [firstName, ...rest] = contactName.trim().split(/\s+/);

  // First-touch partner attribution (carries from the prospect office through the
  // account conversion later).
  const refPartnerId = ref ? await partnerIdForCode(ref) : null;
  const office = await prisma.office.create({
    data: { name: practiceName, isProspect: true, ...(refPartnerId ? { referredByPartnerId: refPartnerId, referralCode: ref!.trim().toLowerCase() } : {}) },
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
  const emailed = await sendAuditVerifyEmail({ to: email, link: verifyUrl, practiceName });

  // In dev (no email configured) hand back the link so the flow is testable.
  return json({ id: audit.id, emailed, verifyUrl: emailed ? undefined : verifyUrl });
}
