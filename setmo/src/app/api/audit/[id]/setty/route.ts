import { loadAuditByCookie } from "@/lib/audit-auth";
import { buildAuditReport } from "@/lib/audit";
import { buildSettyPrompt } from "@/lib/setty";
import { getSignedUrl, isElevenLabsConfigured } from "@/lib/elevenlabs";
import { error, json } from "@/lib/api";

// POST /api/audit/:id/setty — start a free Setty voice session for the prospect,
// briefed with their call analysis + the platform pitch. No balance, no scoring.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const audit = await loadAuditByCookie(id);
  if (!audit) return error("Unauthorized", 401);

  const agentId = process.env.SETMO_SETTY_AGENT_ID;
  if (!isElevenLabsConfigured() || !agentId) return json({ configured: false });

  const report = await buildAuditReport(id);
  const contactFirst = audit.contactName.split(/\s+/)[0] || "there";
  const call = report?.perCall?.[0];

  const { systemPrompt, firstMessage } = buildSettyPrompt({
    practiceName: audit.practiceName,
    contactFirst,
    overall: report?.overall ?? 0,
    leaks: report?.leaks ?? [],
    recovery: report?.recovery ?? null,
    booked: call?.booked ?? false,
    showRate: call?.showRate ?? 0,
    win: call?.win ?? null,
    miss: call?.miss ?? null,
  });

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
