import { prisma } from "@/lib/db";
import { getAdminClient } from "@/lib/supabase/admin";
import { isEmailConfigured, sendInviteEmail } from "@/lib/email";
import { confirmLink } from "@/lib/invites";
import { fullName } from "@/lib/format";
import type { Role } from "@/generated/prisma/client";

// Onboarding + structure management for the call-center tenant. Super-admin
// creates a call center; the senior admin builds it out (pods, managers, agents,
// served offices, agent→office assignments).

type InviteRole = "CALL_CENTER_ADMIN" | "CALL_CENTER_MANAGER" | "SETTER";

/** Mint an invite, upsert an INVITED call-center user with the right scope, and
 *  email the link. Agents (SETTER) also get their office assignments. */
async function inviteMember(opts: {
  email: string;
  firstName?: string;
  lastName?: string;
  role: InviteRole;
  orgId: string;
  podId: string | null; // required for CALL_CENTER_MANAGER + agents
  officeIds?: string[]; // agents only
  inviterId: string;
  inviterName: string;
  contextName: string;
  origin: string;
}): Promise<{ ok: boolean; previewLink?: string }> {
  const admin = getAdminClient();
  const redirectTo = `${opts.origin}/auth/confirm?next=/invite`;
  const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email: opts.email.trim().toLowerCase(), options: { redirectTo } });
  if (error || !data?.user) return { ok: false };
  const userId = data.user.id;
  const nameData = opts.firstName ? { firstName: opts.firstName, lastName: opts.lastName ?? null } : {};
  const podId = opts.role === "CALL_CENTER_ADMIN" ? null : opts.podId;

  await prisma.user.upsert({
    where: { id: userId },
    update: { ...nameData, organizationId: opts.orgId, callCenterPodId: podId, officeId: null, role: opts.role, status: "INVITED", invitedById: opts.inviterId },
    create: { id: userId, email: opts.email.trim().toLowerCase(), ...nameData, role: opts.role, status: "INVITED", organizationId: opts.orgId, callCenterPodId: podId, invitedById: opts.inviterId },
  });

  if (opts.role === "SETTER") {
    await prisma.agentOffice.deleteMany({ where: { userId } });
    for (const officeId of opts.officeIds ?? []) {
      // only assign offices that belong to the agent's pod (served by it)
      const office = await prisma.office.findFirst({ where: { id: officeId, servedByPodId: podId } });
      if (office) await prisma.agentOffice.create({ data: { userId, officeId } });
    }
  }

  const link = confirmLink(opts.origin, data.properties?.hashed_token, "invite", "/invite");
  if (!link) return { ok: true };
  const sent = isEmailConfigured() ? await sendInviteEmail({ to: opts.email, link, officeName: opts.contextName, inviterName: opts.inviterName }).catch(() => false) : false;
  return { ok: true, previewLink: sent ? undefined : link };
}

/** Super-admin: create a new call center + its first pod + invite the senior admin. */
export async function createCallCenter(opts: { name: string; adminEmail: string; adminName?: string; inviterId: string; inviterName: string; origin: string }) {
  const org = await prisma.organization.create({ data: { name: opts.name.trim(), type: "CALL_CENTER" } });
  const pod = await prisma.pod.create({ data: { organizationId: org.id, name: "Main pod" } });
  const [firstName, ...rest] = (opts.adminName ?? "").trim().split(/\s+/);
  const invite = await inviteMember({
    email: opts.adminEmail, firstName: firstName || undefined, lastName: rest.join(" ") || undefined,
    role: "CALL_CENTER_ADMIN", orgId: org.id, podId: null,
    inviterId: opts.inviterId, inviterName: opts.inviterName, contextName: org.name, origin: opts.origin,
  });
  return { orgId: org.id, podId: pod.id, previewLink: invite.previewLink };
}

/** Senior admin: invite a floor manager or an agent. */
export async function inviteCallCenterMember(opts: {
  orgId: string; email: string; name?: string; role: "CALL_CENTER_MANAGER" | "SETTER"; podId: string; officeIds?: string[];
  inviterId: string; inviterName: string; origin: string;
}) {
  const pod = await prisma.pod.findFirst({ where: { id: opts.podId, organizationId: opts.orgId }, select: { id: true } });
  if (!pod) return { ok: false as const, error: "Pod not found in this call center" };
  const org = await prisma.organization.findUnique({ where: { id: opts.orgId }, select: { name: true } });
  const [firstName, ...rest] = (opts.name ?? "").trim().split(/\s+/);
  const res = await inviteMember({
    email: opts.email, firstName: firstName || undefined, lastName: rest.join(" ") || undefined,
    role: opts.role, orgId: opts.orgId, podId: opts.podId, officeIds: opts.officeIds,
    inviterId: opts.inviterId, inviterName: opts.inviterName, contextName: org?.name ?? "your call center", origin: opts.origin,
  });
  return res.ok ? { ok: true as const, previewLink: res.previewLink } : { ok: false as const, error: "Couldn't send the invite" };
}

/** Resolve which call center an API actor may manage: a call-center senior
 *  admin manages their own org; a platform super-admin may name any center
 *  (validated as a real CALL_CENTER org). Anyone else: null (403 upstream). */
export async function resolveManagedOrgId(activeRole: string, userOrgId: string | null, bodyOrgId?: string): Promise<string | null> {
  if (activeRole === "PLATFORM_ADMIN") {
    if (!bodyOrgId) return null;
    const org = await prisma.organization.findFirst({ where: { id: bodyOrgId, type: "CALL_CENTER" }, select: { id: true } });
    return org?.id ?? null;
  }
  if (activeRole === "CALL_CENTER_ADMIN") return userOrgId;
  return null;
}

export async function createPod(orgId: string, name: string) {
  return prisma.pod.create({ data: { organizationId: orgId, name: name.trim() || "Pod" } });
}

/** Senior admin: add a served practice (office) to a pod, IMPLANT enabled. */
export async function createServedOffice(opts: { orgId: string; podId: string; name: string; city?: string }) {
  const pod = await prisma.pod.findFirst({ where: { id: opts.podId, organizationId: opts.orgId }, select: { id: true } });
  if (!pod) return { ok: false as const, error: "Pod not found in this call center" };
  const office = await prisma.office.create({ data: { name: opts.name.trim(), city: opts.city?.trim() || null, isProspect: false, servedByPodId: opts.podId, offerFraming: `${opts.name.trim()}: free implant consult + 3D scan, financing available.` } });
  await prisma.officeService.create({ data: { officeId: office.id, serviceType: "IMPLANT", enabled: true } });
  return { ok: true as const, officeId: office.id };
}

/** Set an agent's assigned offices (must belong to the agent's pod / this call center). */
export async function setAgentOffices(opts: { orgId: string; agentId: string; officeIds: string[] }) {
  const agent = await prisma.user.findFirst({ where: { id: opts.agentId, organizationId: opts.orgId, role: "SETTER" }, select: { callCenterPodId: true } });
  if (!agent?.callCenterPodId) return { ok: false as const, error: "Agent not found in this call center" };
  await prisma.agentOffice.deleteMany({ where: { userId: opts.agentId } });
  for (const officeId of opts.officeIds) {
    const office = await prisma.office.findFirst({ where: { id: officeId, servedByPodId: agent.callCenterPodId }, select: { id: true } });
    if (office) await prisma.agentOffice.create({ data: { userId: opts.agentId, officeId } });
  }
  return { ok: true as const };
}

/** The management view: pods, members (managers + agents with their offices), served offices. */
export async function getCallCenterManage(orgId: string) {
  const [org, pods, users, offices] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
    prisma.pod.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
    prisma.user.findMany({ where: { organizationId: orgId, role: { in: ["CALL_CENTER_ADMIN", "CALL_CENTER_MANAGER", "SETTER"] } }, select: { id: true, firstName: true, lastName: true, email: true, role: true, status: true, callCenterPodId: true, agentOffices: { select: { officeId: true } } }, orderBy: [{ role: "asc" }, { createdAt: "asc" }] }),
    prisma.office.findMany({ where: { servedByPod: { organizationId: orgId } }, orderBy: { name: "asc" }, select: { id: true, name: true, city: true, servedByPodId: true } }),
  ]);
  const podName = new Map(pods.map((p) => [p.id, p.name]));
  const managers = users.filter((u) => u.role !== "SETTER").map((u) => ({ id: u.id, name: fullName(u.firstName, u.lastName), email: u.email, role: u.role as Role, status: u.status as string, podName: u.callCenterPodId ? podName.get(u.callCenterPodId) ?? "" : "" }));
  const agents = users.filter((u) => u.role === "SETTER").map((u) => ({ id: u.id, name: fullName(u.firstName, u.lastName), email: u.email, status: u.status as string, podId: u.callCenterPodId, podName: u.callCenterPodId ? podName.get(u.callCenterPodId) ?? "" : "", officeIds: u.agentOffices.map((a) => a.officeId) }));
  return {
    name: org?.name ?? "Call center",
    pods,
    managers,
    agents,
    offices: offices.map((o) => ({ id: o.id, name: o.name, city: o.city, podId: o.servedByPodId, podName: o.servedByPodId ? podName.get(o.servedByPodId) ?? "" : "" })),
  };
}

/** List all call centers (super-admin). */
export async function listCallCenters() {
  const orgs = await prisma.organization.findMany({ where: { type: "CALL_CENTER" }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, createdAt: true, _count: { select: { pods: true } } } });
  const rows = await Promise.all(orgs.map(async (o) => {
    const [agents, offices] = await Promise.all([
      prisma.user.count({ where: { organizationId: o.id, role: "SETTER" } }),
      prisma.office.count({ where: { servedByPod: { organizationId: o.id } } }),
    ]);
    return { id: o.id, name: o.name, createdAt: o.createdAt, pods: o._count.pods, agents, offices };
  }));
  return rows;
}
