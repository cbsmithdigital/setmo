import { prisma } from "@/lib/db";
import { partnerRoute, apiJson } from "@/lib/partner-http";
import { SERVICE_META, SERVICE_ORDER } from "@/lib/service-meta";
import { rubricFor } from "@/lib/skills";
import { leadChoiceOptions } from "@/lib/lead-choice";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { LIVE: "live", BETA: "beta", DRAFT: "coming_soon", PLANNED: "coming_soon" };

// GET /api/v1/call-types — every call type: its key, name, whether it can be
// run, the 8 skills it's scored on, and the "pick your lead" options.
export async function GET(req: Request) {
  return partnerRoute(req, async () => {
    const agents = await prisma.agent.findMany({ select: { serviceType: true, status: true } });
    const status = new Map(agents.map((a) => [a.serviceType, a.status]));
    const data = SERVICE_ORDER.map((key) => {
      const opts = leadChoiceOptions(key);
      return {
        key,
        object: "call_type",
        name: SERVICE_META[key].name,
        description: SERVICE_META[key].desc,
        status: STATUS[status.get(key) ?? "PLANNED"] ?? "coming_soon",
        skills: rubricFor(key).map((s) => ({ key: s.key, name: s.name, type: s.tier === "universal" ? "universal" : "call_type" })),
        lead_options: {
          genders: [
            { key: "female", label: "Woman" },
            { key: "male", label: "Man" },
          ],
          ages: opts?.ages ?? null,
          callers: opts?.callers ?? null,
          concerns: opts?.concerns ?? [],
          concerns_by_age: opts?.concernsByAge ?? null,
          concerns_by_caller: opts?.concernsByCaller ?? null,
        },
      };
    });
    return apiJson({
      object: "list",
      data,
      challenges: [
        { key: "adaptive", label: "Adaptive — starts at the trainee's level and rises as they improve" },
        { key: "warm", label: "Warm lead — receptive, opens up with light prompting" },
        { key: "tough", label: "Tough lead — guarded, holds the hesitation firmly" },
      ],
    });
  });
}
