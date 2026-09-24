/**
 * One-time setup for the TeamCare referral partnership (2026-09-24).
 *
 *   1. Marks the existing demo / test accounts as demo (Meridian marketing demo,
 *      the BrightCall call-center demo, Adam's Brighter Smiles test office) so they
 *      drop out of platform metrics and the global leaderboard.
 *   2. Creates TeamCare as an approved, TRACKING-ONLY distribution partner with the
 *      tracking code "teamcare".
 *   3. Creates Colin Ambler's partner-admin login (INVITED — no email is sent; use
 *      "Resend invite" on /platform/partners/<id> when ready).
 *   4. Builds TeamCare's demo account and gives Colin access to it.
 *
 * Idempotent: re-running changes nothing that's already in place (step 4 resets
 * the demo). Run: pnpm exec tsx prisma/setup-teamcare.ts [--dry-run]
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

const DRY = process.argv.includes("--dry-run");

async function main() {
  const { prisma } = await import("../src/lib/db");
  const { ensurePartnerAdminUser } = await import("../src/lib/partner-portal");
  const { buildPartnerDemo } = await import("../src/lib/demo");
  const { recomputeGlobalLeaderboard } = await import("../src/lib/leaderboard");

  // ---- 1. existing demo / test accounts ----
  const meridianOrg = "00000000-0000-0000-0000-000000000001";
  const meridianOffices = ["a1", "a2", "a3", "a4", "a5"].map((s) => `00000000-0000-0000-0000-0000000000${s}`);
  const brightCallOrg = "00000000-0000-0000-0000-00000000cc01";
  const brightCallOffices = ["cc-office-cedar", "cc-office-harbor", "cc-office-sunrise", "cc-office-ironwood"];

  // Brighter Smiles is Adam's own test office — confirm by its users before flagging.
  const brighter = await prisma.office.findFirst({
    where: { name: "Brighter Smiles" },
    select: { id: true, users: { select: { email: true } }, stripeCustomerId: true },
  });
  const brighterIsAdams = Boolean(
    brighter && brighter.users.length > 0 && brighter.users.every((u) => ["adam_steere@hotmail.com", "adam@cbsmithdigital.com"].includes(u.email))
  );

  const officeIds = [...meridianOffices, ...brightCallOffices, ...(brighterIsAdams && brighter ? [brighter.id] : [])];
  const offices = await prisma.office.findMany({ where: { id: { in: officeIds } }, select: { id: true, name: true, isDemo: true } });
  console.log("Demo / test offices to flag:");
  for (const o of offices) console.log(`  ${o.isDemo ? "(already)" : "→"} ${o.name} [${o.id}]`);
  if (!brighterIsAdams) console.log("  ! Brighter Smiles NOT flagged — its users aren't only Adam's.");

  if (!DRY) {
    await prisma.office.updateMany({ where: { id: { in: offices.map((o) => o.id) } }, data: { isDemo: true } });
    await prisma.organization.updateMany({ where: { id: { in: [meridianOrg, brightCallOrg] } }, data: { isDemo: true } });
    // Purge demo offices from the materialized real global board now, not at the
    // next customer call.
    await recomputeGlobalLeaderboard();
  }

  // ---- 2. TeamCare partner ----
  const adam = await prisma.user.findFirst({ where: { email: "adam@growdental.ai" }, select: { id: true } });
  let partner = await prisma.partner.findFirst({ where: { email: "colin@teamcaredental.com" } });
  if (!partner) {
    console.log("\nCreating TeamCare (tracking-only distribution partner)…");
    if (!DRY) {
      partner = await prisma.partner.create({
        data: {
          name: "TeamCare",
          orgType: "Dental practice platform",
          contactName: "Colin Ambler",
          email: "colin@teamcaredental.com",
          audience: "Thousands of dental practices on the TeamCare platform, offering a range of services.",
          track: "DISTRIBUTION",
          status: "APPROVED",
          approvedAt: new Date(),
          approvedById: adam?.id ?? null,
          commissionsEnabled: false,
          payoutMethod: "CASH",
          notes: "Referral partnership, tracking only — no payouts yet (decided 2026-09-24).",
        },
      });
    }
  } else {
    console.log(`\nTeamCare already exists [${partner.id}]`);
  }
  if (!partner) return console.log("(dry run — stopping before partner-dependent steps)");

  // The tracking code, set BEFORE anything else could mint a random one.
  const code = await prisma.partnerCode.findUnique({ where: { code: "teamcare" } });
  if (code && code.partnerId !== partner.id) throw new Error("The code 'teamcare' belongs to another partner.");
  if (!code && !DRY) await prisma.partnerCode.create({ data: { code: "teamcare", partnerId: partner.id } });

  // ---- 3. Colin's login (no email) ----
  const colin = await ensurePartnerAdminUser(partner.id, { sendEmail: false });
  if (colin.userId && !DRY) {
    await prisma.user.update({ where: { id: colin.userId }, data: { firstName: "Colin", lastName: "Ambler" } });
  }
  console.log(`Colin's login: ${colin.userId ?? "(not created)"} — invite NOT emailed.`);

  // ---- 4. demo account ----
  if (!DRY) {
    const report = await buildPartnerDemo(partner.id);
    console.log(`\nDemo account built: ${report.seededSessions} seeded calls, ${report.demoUsers} partner login(s) with access.`);
    for (const o of report.offices) console.log(`  ${o.name}: ${o.balanceMin} min`);
    if (adam) {
      await prisma.adminAuditLog.create({
        data: { actorId: adam.id, actorEmail: "adam@growdental.ai", action: "partner.setup", summary: "Set up TeamCare: tracking-only partner, code 'teamcare', Colin's login, demo account", targetType: "partner", targetId: partner.id },
      });
    }
  }

  const link = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://setmo.growdental.ai"}/?ref=teamcare`;
  console.log(`\nTracking link: ${link}\nPartner page: /platform/partners/${partner.id}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
