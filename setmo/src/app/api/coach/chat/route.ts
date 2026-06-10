import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSessionResult } from "@/lib/queries";
import { mmss } from "@/lib/format";
import { error, json } from "@/lib/api";

export const maxDuration = 60;

const MODEL = process.env.SETMO_COACH_MODEL || "claude-sonnet-4-6";

const Body = z.object({
  sessionId: z.string().optional(),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .min(1)
    .max(40),
});

// POST /api/coach/chat — the "Coach me from this call" conversation. Grounds the
// coach in a specific call's transcript + scores when sessionId is given;
// otherwise coaches off the setter's recent memory/weak areas.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  if (!process.env.ANTHROPIC_API_KEY) return error("Coach isn't configured yet", 503);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);
  const { sessionId, messages } = parsed.data;

  const first = user.firstName ?? "there";
  let context = "";

  if (sessionId) {
    const r = await getSessionResult(sessionId, user.id);
    if (r) {
      const skillLines = r.skills.map((s) => `- ${s.name}: ${s.score.toFixed(1)}/5`).join("\n");
      const transcript = r.transcript
        .map((t) => `[${mmss(t.t)}] ${t.speaker === "you" ? "SETTER" : "LEAD"}: ${t.text}`)
        .join("\n");
      context = `You are coaching ${first} on a specific practice call.

CALL: ${r.service} · persona: ${r.persona} · ${mmss(r.durationSeconds)} · overall ${r.score.toFixed(1)}/5
SKILL SCORES:
${skillLines}
WHAT WENT WELL: ${r.wins.join("; ") || "n/a"}
WHERE TO GROW: ${r.misses.join("; ") || "n/a"}

FULL TRANSCRIPT:
${transcript}

Ground every piece of advice in THIS call — quote specific moments ([mm:ss]), point to exact lines, and give better wording they could have used. Start by orienting them to what mattered most in this call.`;
    }
  }

  if (!context) {
    const memory = await prisma.setterMemory.findUnique({ where: { setterId: user.id } });
    context = `You are coaching ${first}, a dental appointment setter.${
      memory?.summary ? ` Recent performance notes: ${memory.summary}` : ""
    } You don't have a specific call loaded — coach them on appointment-setting skills generally, and invite them to open a specific call for deeper feedback.`;
  }

  const system = `You are SetMo's AI coach for dental appointment setters who book high-ticket consults (implants, full-arch, dentures). You are warm, direct, and practical — a sharp sales coach, never clinical. Give specific, actionable advice and concrete phrasing they can use on the next call. Keep replies tight (a few short paragraphs or a short list), encouraging, and focused on what moves a lead to a booked appointment. Frame misses as the path forward.

${context}`;

  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    const reply = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return json({ reply });
  } catch (e) {
    return error(e instanceof Error ? e.message : "Coach failed", 502);
  }
}
