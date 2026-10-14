import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rubricForService } from "@/lib/packs/registry";
import { SERVICE_META } from "@/lib/service-meta";
import { TrainingsAdmin } from "@/components/platform/TrainingsAdmin";
import type { ServiceKey } from "@/generated/prisma/client";

const CALL_TYPES: ServiceKey[] = ["IMPLANT", "DENTURE", "COSMETIC", "ORTHO", "WISDOM", "GENERAL"];

export default async function PlatformTrainingsPage() {
  await requireRole("PLATFORM_ADMIN", "SUPPORT");
  const rows = await prisma.training.findMany({ orderBy: [{ category: "asc" }, { type: "asc" }, { title: "asc" }] });
  const trainings = rows.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description ?? "",
    type: t.type as "VIDEO" | "WORKBOOK",
    category: t.category as "SETTER" | "OPERATIONS",
    targetSkillKey: t.targetSkillKey ?? "",
    length: t.length,
    status: t.status as "DRAFT" | "PUBLISHED",
    assetRef: t.assetRef ?? "",
    thumbRef: t.thumbRef ?? "",
  }));
  // Every skill any call type is scored on, so a training can target it and get
  // recommended to setters weak on it: the ones every call shares first, then
  // each call type's own, labeled with the call type.
  const skills: { key: string; name: string }[] = [];
  const seen = new Set<string>();
  for (const s of rubricForService("IMPLANT").skills.filter((s) => s.tier === "universal")) {
    skills.push({ key: s.key, name: `Every call type — ${s.name}` });
    seen.add(s.key);
  }
  for (const svc of CALL_TYPES) {
    for (const s of rubricForService(svc).skills) {
      if (seen.has(s.key)) continue;
      seen.add(s.key);
      skills.push({ key: s.key, name: `${SERVICE_META[svc].name} — ${s.name}` });
    }
  }

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Trainings</h1>
          <p>Upload training videos and workbooks, target a skill, and publish to setters.</p>
        </div>
      </div>
      <div className="content">
        <TrainingsAdmin trainings={trainings} skills={skills} />
      </div>
    </>
  );
}
