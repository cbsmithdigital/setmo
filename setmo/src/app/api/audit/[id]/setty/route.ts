import { buildAuditReport, activationCost, loadAuditAccess } from "@/lib/audit";
import { buildSettyPrompt } from "@/lib/setty";
import { getSignedUrl, isElevenLabsConfigured } from "@/lib/elevenlabs";
import { getPlatformConfig } from "@/lib/config";
import { prisma } from "@/lib/db";
import { error, json } from "@/lib/api";

// POST /api/audit/:id/setty — start a free Setty voice session for the prospect,
// briefed with their call analysis + the platform pitch. No balance, no scoring.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const audit = await loadAuditAccess(id);
  if (!audit) return error("Unauthorized", 401);
  // Only for a running or finished assessment — not one still waiting on approval.
  if (audit.status !== "ACTIVE" && audit.status !== "SCORED") return error("Your assessment isn't active yet.", 403);

  const agentId = process.env.SETMO_SETTY_AGENT_ID;
  if (!isElevenLabsConfigured() || !agentId) return json({ configured: false });

  const report = await buildAuditReport(id);
  const contactFirst = audit.contactName.split(/\s+/)[0] || "there";
  const call = report?.perCall?.[0];
  const cfg = await getPlatformConfig();

  const briefing = buildSettyPrompt({
    practiceName: audit.practiceName,
    contactFirst,
    overall: report?.overall ?? 0,
    leaks: report?.leaks ?? [],
    recovery: report?.recovery ?? null,
    booked: call?.booked ?? false,
    showRate: call?.showRate ?? 0,
    win: call?.win ?? null,
    miss: call?.miss ?? null,
    pricing: {
      accessMonthly: cfg.accessMonthly,
      monthlyDiscountPct: cfg.monthlyTokenDiscountPct,
      annualDiscountPct: cfg.annualTokenDiscountPct,
    },
  });
  let { firstMessage } = briefing;

  // What it really costs to start (activation needs starter tokens unless a
  // sign-up promo is on), from the same config the checkout charges, and the
  // free-audit rule. Setty quotes these, so never a literal.
  const cost = activationCost(cfg);
  const money = (n: number) => `$${n.toFixed(2)}`;
  const startLine =
    cost.bonusTokens > 0
      ? `With the sign-up offer, getting started is ${money(cost.dayOneUsd)} today (the first month of Practice Access), and activating by ${cost.promoEndsAt} adds ${cost.bonusTokens.toLocaleString()} free tokens.`
      : `On the monthly plan, getting started is from ${money(cost.dayOneUsd)} today: the first month of Practice Access (${money(cost.accessMonthly)}) plus starter tokens (from ${cost.starterTokens.toLocaleString()} tokens for $${cost.starterUsd.toLocaleString()}). Plus tax where it applies.`;
  let systemPrompt = `${briefing.systemPrompt}

WHAT IT COSTS TO START (if they ask what they'd pay, say this plainly; don't give only the monthly price): ${startLine} After that it's ${money(cost.accessMonthly)}/month per location, and they buy more tokens when they need them. The free Setter Audit is one call per email every ${cost.cooldownDays} days.`;
  // The practice already set up SetMo from this assessment (the report says so too).
  const claimed = (await prisma.office.findUnique({ where: { id: audit.officeId }, select: { isProspect: true } }))?.isProspect === false;
  if (claimed && !audit.asSetter) {
    systemPrompt += `

THEY ALREADY HAVE AN ACCOUNT: ${audit.practiceName} already set up SetMo. Point them to sign in; don't ask them to sign up or activate again.`;
  }
  // Someone the owner sent the audit to (a setter link) can't create the account.
  if (audit.asSetter) {
    systemPrompt += `

WHO YOU'RE TALKING TO: probably someone ${contactFirst} asked to run the call (one of their setters), not ${contactFirst}. Talk through the results and how SetMo would help them; don't ask them to activate or sign up — ${contactFirst} sets up the account from the link in their own email.`;
    firstMessage = `Hey, it's Setty — I just went through ${audit.practiceName}'s call. Want me to walk you through what stood out?`;
  }

  try {
    const signedUrl = await getSignedUrl(agentId);
    return json({
      configured: true,
      signedUrl,
      systemPrompt,
      firstMessage,
      dynamicVariables: { practice_name: audit.practiceName, contact_first_name: contactFirst },
    });
  } catch (e) {
    return error(e instanceof Error ? e.message : "Couldn't start Setty", 502);
  }
}
