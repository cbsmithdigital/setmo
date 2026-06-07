import { createHmac, timingSafeEqual } from "node:crypto";
import { categoryToSkillKey, skillTier } from "@/lib/skills";
import type { ServiceKey } from "@/generated/prisma/client";

const API_BASE = "https://api.elevenlabs.io";

// Maps a ServiceKey to the env var holding its ElevenLabs agent id.
const AGENT_ENV: Partial<Record<ServiceKey, string>> = {
  IMPLANT: "ELEVENLABS_AGENT_IMPLANT",
};

export function agentIdFor(serviceType: ServiceKey): string | null {
  const env = AGENT_ENV[serviceType];
  return (env && process.env[env]) || null;
}

export function isElevenLabsConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

/**
 * Mints a short-lived signed conversation URL for a private agent, so only an
 * authenticated setter can start a session (and our credits stay protected).
 */
export async function getSignedUrl(agentId: string): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY not configured.");

  const res = await fetch(
    `${API_BASE}/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
    { headers: { "xi-api-key": apiKey }, cache: "no-store" }
  );
  if (!res.ok) {
    throw new Error(`ElevenLabs get-signed-url failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { signed_url: string };
  return json.signed_url;
}

/**
 * Verifies the ElevenLabs post-call webhook HMAC signature.
 * Header format: `t=<unix_ts>,v0=<hex_hmac_sha256(t.body)>`.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => p.split("=").map((s) => s.trim()) as [string, string])
  );
  const t = parts["t"];
  const v0 = parts["v0"];
  if (!t || !v0) return false;

  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  try {
    const a = Buffer.from(v0, "hex");
    const b = Buffer.from(expected, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ---------- post-call payload parsing ----------

type ParsedSkill = {
  skillKey: string;
  tier: "UNIVERSAL" | "SERVICE_SPECIFIC";
  score: number;
  reasoning: string | null;
};

export interface ParsedEvaluation {
  conversationId: string | null;
  sessionId: string | null;
  durationSeconds: number | null;
  overallScore: number | null;
  narrative: string | null;
  skills: ParsedSkill[];
  wins: string[];
  misses: string[];
  phrases: { from: string; to: string }[];
  personaCoaching: string | null;
  recommendedNextScenario: string | null;
}

// Coerce a raw value (e.g. "4.6", "4/5", 4.6) into a 1–5 number.
function toScore(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return clamp(v);
  if (typeof v === "string") {
    const frac = v.match(/(\d+(?:\.\d+)?)\s*\/\s*5/);
    if (frac) return clamp(parseFloat(frac[1]));
    const n = parseFloat(v);
    if (!isNaN(n)) return clamp(n);
  }
  return null;
}
const clamp = (n: number) => Math.max(1, Math.min(5, n));

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  if (typeof v === "string") return v.split(/\n+/).map((s) => s.replace(/^[-•\d.\s]+/, "").trim()).filter(Boolean);
  return [];
}

/**
 * Parses an ElevenLabs `post_call_transcription` webhook payload into SetMo's
 * evaluation shape. Tolerant by design: scores may arrive via the agent's
 * `data_collection_results` (preferred, numeric) or `evaluation_criteria_results`.
 * The exact agent output is an open dependency (spec §6.2) — rawPayload is always
 * stored so we can re-map without data loss.
 */
export function parsePostCall(payload: unknown): ParsedEvaluation {
  const root = (payload ?? {}) as Record<string, unknown>;
  const data = (root.data ?? root) as Record<string, unknown>;

  const conversationId = (data.conversation_id as string) ?? (data.conversationId as string) ?? null;

  const metadata = (data.metadata ?? {}) as Record<string, unknown>;
  const durationSeconds =
    (metadata.call_duration_secs as number) ??
    (metadata.call_duration_seconds as number) ??
    (data.call_duration_secs as number) ??
    null;

  const init = (data.conversation_initiation_client_data ?? {}) as Record<string, unknown>;
  const dyn = (init.dynamic_variables ?? {}) as Record<string, unknown>;
  const sessionId = (dyn.session_id as string) ?? (dyn.sessionId as string) ?? null;

  const analysis = (data.analysis ?? {}) as Record<string, unknown>;
  const dataCollection = (analysis.data_collection_results ?? {}) as Record<string, unknown>;
  const criteria = (analysis.evaluation_criteria_results ?? {}) as Record<string, unknown>;

  const skills: ParsedSkill[] = [];
  const seen = new Set<string>();

  // 1) Preferred: numeric skill scores from data collection.
  for (const [key, val] of Object.entries(dataCollection)) {
    const skillKey = categoryToSkillKey(key);
    if (!skillKey || seen.has(skillKey)) continue;
    const v = (val ?? {}) as Record<string, unknown>;
    const score = toScore(v.value ?? v.result ?? val);
    if (score == null) continue;
    seen.add(skillKey);
    skills.push({
      skillKey,
      tier: skillTier(skillKey) === "universal" ? "UNIVERSAL" : "SERVICE_SPECIFIC",
      score,
      reasoning: (v.rationale as string) ?? (v.justification as string) ?? null,
    });
  }

  // 2) Fallback: evaluation criteria (often success/failure -> 5/2).
  for (const [key, val] of Object.entries(criteria)) {
    const skillKey = categoryToSkillKey(key);
    if (!skillKey || seen.has(skillKey)) continue;
    const v = (val ?? {}) as Record<string, unknown>;
    let score = toScore(v.value);
    if (score == null && typeof v.result === "string") {
      score = v.result === "success" ? 5 : v.result === "failure" ? 2 : 3;
    }
    if (score == null) continue;
    seen.add(skillKey);
    skills.push({
      skillKey,
      tier: skillTier(skillKey) === "universal" ? "UNIVERSAL" : "SERVICE_SPECIFIC",
      score,
      reasoning: (v.rationale as string) ?? null,
    });
  }

  const overallScore =
    toScore(dataCollection.overall_score ?? (dataCollection.overall as Record<string, unknown>)?.value) ??
    (skills.length ? Number((skills.reduce((a, b) => a + b.score, 0) / skills.length).toFixed(1)) : null);

  const narrative =
    (asField(dataCollection, "narrative") ||
      asField(dataCollection, "feedback") ||
      (analysis.transcript_summary as string)) ??
    null;

  // Replacement phrases: array of {from,to} or {you_said,try_instead}.
  const phrasesRaw = fieldValue(dataCollection, "replacement_phrases") ?? fieldValue(dataCollection, "phrases");
  const phrases: { from: string; to: string }[] = Array.isArray(phrasesRaw)
    ? (phrasesRaw as Record<string, unknown>[])
        .map((p) => ({
          from: String(p.from ?? p.you_said ?? ""),
          to: String(p.to ?? p.try_instead ?? ""),
        }))
        .filter((p) => p.from && p.to)
    : [];

  return {
    conversationId,
    sessionId,
    durationSeconds: durationSeconds != null ? Math.round(Number(durationSeconds)) : null,
    overallScore,
    narrative,
    skills,
    wins: asStringArray(fieldValue(dataCollection, "wins")),
    misses: asStringArray(fieldValue(dataCollection, "misses")),
    phrases,
    personaCoaching: asField(dataCollection, "persona_coaching"),
    recommendedNextScenario: asField(dataCollection, "recommended_next_scenario") ?? asField(dataCollection, "next_scenario"),
  };
}

// Data-collection entries are typically { value, rationale }. Pull the value.
function fieldValue(dc: Record<string, unknown>, key: string): unknown {
  const entry = dc[key];
  if (entry && typeof entry === "object" && "value" in (entry as object)) {
    return (entry as Record<string, unknown>).value;
  }
  return entry;
}
function asField(dc: Record<string, unknown>, key: string): string | null {
  const v = fieldValue(dc, key);
  return typeof v === "string" ? v : null;
}
