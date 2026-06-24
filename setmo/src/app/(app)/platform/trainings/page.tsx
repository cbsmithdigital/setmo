import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { IMPLANT_RUBRIC } from "@/lib/skills";
import { TrainingsAdmin } from "@/components/platform/TrainingsAdmin";

export default async function PlatformTrainingsPage() {
  await requireRole("PLATFORM_ADMIN", "SUPPORT");
  const rows = await prisma.training.findMany({ orderBy: [{ type: "asc" }, { title: "asc" }] });
  const trainings = rows.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description ?? "",
    type: t.type as "VIDEO" | "WORKBOOK",
    targetSkillKey: t.targetSkillKey ?? "",
    length: t.length,
    status: t.status as "DRAFT" | "PUBLISHED",
    assetRef: t.assetRef ?? "",
  }));
  const skills = IMPLANT_RUBRIC.map((s) => ({ key: s.key, name: s.name }));

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
