import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSessionResult } from "@/lib/queries";
import { coachChatSystem, coachGroundingFromCall, coachGeneralGrounding } from "@/lib/coach-prompts";
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
// Prompts live in src/lib/coach-prompts.ts.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return error("Unauthorized", 401);
  if (!process.env.ANTHROPIC_API_KEY) return error("Coach isn't configured yet", 503);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return error("Invalid request", 422);
  const { sessionId, messages } = parsed.data;

  const first = user.firstName ?? "there";
  let grounding: string | null = null;

  if (sessionId) {
    const r = await getSessionResult(sessionId, user.id);
    if (r) grounding = coachGroundingFromCall(first, r);
  }
  if (!grounding) {
    const memory = await prisma.setterMemory.findUnique({ where: { setterId: user.id } });
    grounding = coachGeneralGrounding(first, memory?.summary);
  }

  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: coachChatSystem(grounding),
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
