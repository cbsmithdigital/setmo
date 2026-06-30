import { prisma } from "@/lib/db";
import { getOfficeOverview, currentPeriod } from "@/lib/office";
import { getGroupOverview } from "@/lib/group";
import { getGroupOutcomes, getOfficeOutcomeFunnel } from "@/lib/outcomes";
import { getSetterHome } from "@/lib/queries";
import { getInsight } from "@/lib/insights";

// Weekly digest content per scope. Each builder returns the email subject, HTML,
// and the list of recipients. Recipients with placeholder demo emails are filtered
// out by the caller (the cron route).

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://setmo.growdental.ai";
const money = (v: number) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// recipients carry userId so the cron can stamp a per-person unsubscribe link.
export type DigestEmail = { subject: string; html: string; recipients: { email: string; userId: string }[] };

// __UNSUB_URL__ is replaced per-recipient by the cron before sending.
const POSTAL = process.env.SETMO_POSTAL_ADDRESS || "";

function shell(title: string, bodyHtml: string, ctaLabel: string, ctaPath: string): string {
  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px;margin:0 auto;color:#1a1a2e;padding:8px 4px">
    <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#7c3aed;font-weight:800">SetMo · Your week</div>
    <h2 style="font-size:22px;margin:6px 0 16px">${esc(title)}</h2>
    ${bodyHtml}
    <p style="margin:26px 0 8px">
      <a href="${APP_URL}${ctaPath}" style="background:#7c3aed;color:#fff;padding:12px 22px;border-radius:12px;text-decoration:none;font-weight:600;font-size:14px">${esc(ctaLabel)}</a>
    </p>
    <p style="color:#8a94a6;font-size:12px;margin-top:22px;border-top:1px solid #ececf3;padding-top:14px">
      You're receiving this weekly summary because you have a SetMo account. Numbers cover the last 7 days unless noted.<br/>
      <a href="__UNSUB_URL__" style="color:#8a94a6;text-decoration:underline">Unsubscribe from weekly summaries</a>${POSTAL ? ` · SetMo by Grow Dental, ${esc(POSTAL)}` : " · SetMo by Grow Dental"}
    </p>
  </div>`;
}

function insightBlock(headline: string, body: string): string {
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  const bodyHtml = lines.length > 1 && lines.every((l) => l.startsWith("-"))
    ? `<ul style="margin:6px 0 0;padding-left:18px;font-size:14px;color:#3a3a4a">${lines.map((l) => `<li>${esc(l.replace(/^-\s*/, ""))}</li>`).join("")}</ul>`
    : `<div style="font-size:14px;color:#3a3a4a;margin-top:4px;line-height:1.5">${esc(body)}</div>`;
  return `
    <div style="background:#f5f3ff;border:1px solid #e7e0fb;border-radius:14px;padding:14px 16px;margin:16px 0">
      <div style="font-size:11px;letter-spacing:.06em;font-weight:800;color:#7c3aed">SETTY'S NEXT MOVE</div>
      <div style="font-weight:700;font-size:15px;margin-top:5px">${esc(headline)}</div>
      ${bodyHtml}
    </div>`;
}

function statRow(items: [string, string][]): string {
  return `<table style="width:100%;border-collapse:collapse;margin:6px 0 4px"><tr>${items
    .map(([lab, val]) => `<td style="text-align:center;padding:10px 6px;background:#faf9ff;border:1px solid #eee;border-radius:10px">
      <div style="font-size:20px;font-weight:800;font-family:Georgia,serif">${esc(val)}</div>
      <div style="font-size:11px;color:#8a94a6;text-transform:uppercase;letter-spacing:.03em;margin-top:2px">${esc(lab)}</div></td>`)
    .join('<td style="width:8px"></td>')}</tr></table>`;
}

const isActiveEmail = (email: string | null | undefined) =>
  !!email && !/\.(example|test|invalid|local)$/i.test(email.split("@")[1] ?? "") && !email.endsWith("example.com");

// ---- setter ----
export async function buildSetterDigest(userId: string): Promise<DigestEmail | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, officeId: true, firstName: true, lastName: true, email: true, status: true, role: true, digestOptOut: true } });
  if (!user?.officeId || user.role !== "SETTER" || user.status !== "ACTIVE" || user.digestOptOut) return null;
  const d = await getSetterHome(user);
  if (!d.recent.length) return null;
  const insight = await getInsight("SETTER", userId);

  const deltaTxt = `${d.avgDelta >= 0 ? "+" : ""}${d.avgDelta}`;
  const body = `
    <p style="font-size:15px;margin:0 0 4px">Here's your week, ${esc(d.firstName)}.</p>
    ${statRow([
      ["Reps this week", String(d.sessionsThisWeek)],
      ["Avg score", d.avg ? d.avg.toFixed(1) : "—"],
      ["vs last month", deltaTxt],
    ])}
    <p style="font-size:14px;color:#3a3a4a;margin:12px 0 0">
      ${d.focus ? `Your focus skill is <b>${esc(d.focus.name)}</b> (${d.focus.score.toFixed(1)}/5). ` : ""}
      ${d.best ? `Strongest: <b>${esc(d.best.name)}</b>. ` : ""}
      ${d.sessionsThisWeek === 0 ? "You didn't run a rep this week — a couple of calls keeps your edge sharp." : "Keep the streak going."}
    </p>
    ${insight ? insightBlock(insight.headline, insight.body) : ""}`;
  return {
    subject: `Your SetMo week — ${d.sessionsThisWeek} rep${d.sessionsThisWeek === 1 ? "" : "s"}, ${d.avg ? d.avg.toFixed(1) : "—"}/5`,
    html: shell("Your training week", body, "Run a rep", "/practice"),
    recipients: isActiveEmail(user.email) ? [{ email: user.email, userId: user.id }] : [],
  };
}

// ---- office ----
export async function buildOfficeDigest(officeId: string): Promise<DigestEmail | null> {
  const o = await getOfficeOverview(officeId);
  if (o.activeSetters === 0) return null;
  const [funnel, insight, admins] = await Promise.all([
    getOfficeOutcomeFunnel(officeId, currentPeriod().label),
    getInsight("OFFICE", officeId),
    prisma.user.findMany({ where: { officeId, role: "OFFICE_ADMIN", status: "ACTIVE", digestOptOut: false }, select: { id: true, email: true } }),
  ]);
  const withSessions = o.team.filter((t) => t.sessions > 0);
  const riser = [...withSessions].sort((a, b) => b.delta - a.delta)[0];
  const slipped = [...withSessions].sort((a, b) => a.delta - b.delta)[0];
  const gap = o.gapSkills[0];

  const body = `
    <p style="font-size:15px;margin:0 0 4px">${esc(o.practiceName)} — how the team trained this week.</p>
    ${statRow([
      ["Team avg", o.teamAvg.toFixed(1)],
      ["Sessions / wk", String(o.sessionsThisWeek)],
      ["Set rate", `${funnel.setRatePct}%`],
      ["Show rate", `${funnel.showRatePct}%`],
    ])}
    <p style="font-size:14px;color:#3a3a4a;margin:12px 0 0">
      ${riser && riser.delta > 0 ? `📈 <b>${esc(riser.name)}</b> is up ${riser.delta.toFixed(1)} this period. ` : ""}
      ${slipped && slipped.delta < 0 ? `👀 <b>${esc(slipped.name)}</b> slipped ${Math.abs(slipped.delta).toFixed(1)} — worth a 1:1. ` : ""}
      ${gap ? `Team's biggest gap: <b>${esc(gap.name)}</b> (${gap.avg.toFixed(1)}/5).` : ""}
    </p>
    ${insight ? insightBlock(insight.headline, insight.body) : ""}`;
  return {
    subject: `${o.practiceName}: team ${o.teamAvg.toFixed(1)}/5, ${o.sessionsThisWeek} sessions this week`,
    html: shell(`${o.practiceName} — weekly team report`, body, "Open your team", "/office/team"),
    recipients: admins.filter((a) => isActiveEmail(a.email)).map((a) => ({ email: a.email, userId: a.id })),
  };
}

// ---- group ----
export async function buildGroupDigest(orgId: string): Promise<DigestEmail | null> {
  const g = await getGroupOverview(orgId);
  if (g.totalActiveSetters === 0) return null;
  const [outcomes, insight, admins] = await Promise.all([
    getGroupOutcomes(orgId, currentPeriod().label),
    getInsight("GROUP", orgId),
    prisma.user.findMany({ where: { organizationId: orgId, role: "GROUP_ADMIN", status: "ACTIVE", digestOptOut: false }, select: { id: true, email: true } }),
  ]);
  const active = g.offices.filter((o) => o.activeSetters > 0);
  const top = active[0];
  const bottom = active[active.length - 1];
  const gap = [...g.heatmap].sort((a, b) => a.avg - b.avg)[0];

  const body = `
    <p style="font-size:15px;margin:0 0 4px">${esc(g.orgName)} — portfolio at a glance.</p>
    ${statRow([
      ["Group avg", g.orgAvg.toFixed(1)],
      ["Set rate", `${outcomes.setRatePct}%`],
      ["Treatment starts", String(outcomes.totalCases)],
      ["Production", money(outcomes.totalProduction)],
    ])}
    <p style="font-size:14px;color:#3a3a4a;margin:12px 0 0">
      ${top ? `🏆 Top location: <b>${esc(top.name)}</b> (${top.teamAvg.toFixed(1)}). ` : ""}
      ${bottom && bottom.id !== top?.id ? `👀 Needs support: <b>${esc(bottom.name)}</b> (${bottom.teamAvg.toFixed(1)}). ` : ""}
      ${gap ? `Group-wide gap: <b>${esc(gap.name)}</b> (${gap.avg.toFixed(1)}/5) — a central playbook opportunity.` : ""}
    </p>
    ${insight ? insightBlock(insight.headline, insight.body) : ""}`;
  return {
    subject: `${g.orgName}: group ${g.orgAvg.toFixed(1)}/5, ${money(outcomes.totalProduction)} this month`,
    html: shell(`${g.orgName} — portfolio weekly`, body, "Open performance", "/group/performance"),
    recipients: admins.filter((a) => isActiveEmail(a.email)).map((a) => ({ email: a.email, userId: a.id })),
  };
}
