import Link from "next/link";
import { requireUser, getActiveRole, isManagerRole, isCallCenterRole } from "@/lib/auth";
import { getSessionResult } from "@/lib/queries";
import { getOfficeOverview } from "@/lib/office";
import { getGroupOverview } from "@/lib/group";
import { getCallCenterOverview, getPodOverview } from "@/lib/callcenter";
import { getOrgCoachBalance } from "@/lib/usage";
import { CoachWorkspace } from "@/components/coach/CoachWorkspace";

const GENERAL_STARTERS = [
  "How do I handle “I need to think about it”?",
  "Help me sound confident quoting $40k.",
  "They were quoted cheaper elsewhere — what do I say?",
  "Give me a warmer opening line.",
];

export default async function CoachPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const user = await requireUser();
  const { session } = await searchParams;
  const first = user.firstName ?? "there";

  const activeRole = getActiveRole(user);

  // "Coach me from this call" — a specific call is being coached. This takes
  // priority over the role-based coach (it's grounded in that exact call, for
  // whoever can view it), so the transcript + scores load into Setty.
  if (session) {
    const r = await getSessionResult(session, user);
    if (r) {
      const lowest = [...r.skills].sort((a, b) => a.score - b.score)[0];
      const welcome = `Let's break down ${r.isOwner ? "your" : `${r.setterName}'s`} ${r.persona} call (scored ${r.score.toFixed(1)}/5). Where do you want to start${
        lowest ? ` — ${lowest.name.toLowerCase()}?` : "?"
      }`;
      return (
        <>
          <div className="topbar">
            <div className="tb-greet">
              <h1>Coach Setty</h1>
              <p>Coaching on {r.isOwner ? "your" : `${r.setterName}'s`} {r.persona} call · {r.service}</p>
            </div>
            <div className="tb-right">
              <span className="chip purple">Setty</span>
            </div>
          </div>
          <CoachWorkspace
            sessionId={session}
            intro={`Let's work on ${r.isOwner ? "your" : `${r.setterName}'s`} ${r.persona} call (scored ${r.score.toFixed(1)}/5).`}
            welcome={welcome}
            starters={[
              "What was the biggest miss on this call?",
              lowest ? `How do I improve ${lowest.name.toLowerCase()}?` : "Where did momentum slip?",
              "Rewrite the weakest moment with better wording.",
              "Give me a stronger close that could have been used.",
            ]}
          />
        </>
      );
    }
    // call not viewable/scored yet — fall through to the role-based coach
  }

  // Call-center manager → agent-development coach (chat, agent-centric).
  if (isCallCenterRole(activeRole) && user.organizationId) {
    const senior = activeRole === "CALL_CENTER_ADMIN";
    const data = senior ? await getCallCenterOverview(user.organizationId) : user.callCenterPodId ? await getPodOverview(user.callCenterPodId) : null;
    const attn = data?.attention.slice(0, 2) ?? [];
    const welcome = `Hey ${first} 👋 I'm Setty, your coaching copilot. ${senior ? "Across your call center" : "In your pod"}, agents are averaging ${data?.ccAvg.toFixed(1) ?? "—"}/5${
      attn.length ? `, and ${attn.join(" & ")} could use a nudge` : ""
    }. Want me to show where to coach this week?`;
    return (
      <>
        <div className="topbar">
          <div className="tb-greet">
            <h1>Setty · Coaching copilot</h1>
            <p>Develop your agents — who to coach, on which skill, and where a gap is center-wide vs. one agent.</p>
          </div>
          <div className="tb-right"><span className="chip purple">Setty</span></div>
        </div>
        <CoachWorkspace
          variant="group"
          voiceEnabled={false}
          intro={`Hey ${first} — let's look at your agents.`}
          welcome={welcome}
          starters={[
            "Which agents need coaching this week?",
            "Is our weakest skill center-wide or one agent?",
            "Any agent strong overall but weak on a specific account?",
            "Draft a 1:1 coaching note for my lowest agent.",
          ]}
        />
      </>
    );
  }

  // Group / DSO leader → Portfolio strategist (chat, multi-office grounded).
  if (activeRole === "GROUP_ADMIN" && user.organizationId) {
    const [g, wallet] = await Promise.all([getGroupOverview(user.organizationId), getOrgCoachBalance(user.organizationId)]);
    const lagging = g.attention.map((o) => o.name).slice(0, 2);
    const welcome = `Hey ${first} 👋 I'm Setty Advisor. Across ${g.officeCount} practices you're averaging ${g.orgAvg.toFixed(1)}/5${
      lagging.length ? `, with ${lagging.join(" & ")} lagging` : ""
    }. Want me to show you where to focus across the group?`;
    const lowWallet = wallet.remainingMin <= 15;
    return (
      <>
        <div className="topbar">
          <div className="tb-greet">
            <h1>Setty Advisor</h1>
            <p>Your AI portfolio strategist — benchmark practices and decide where to invest.</p>
          </div>
          <div className="tb-right">
            <span className="chip purple">Setty</span>
          </div>
        </div>
        {lowWallet && (
          <div className="content" style={{ paddingBottom: 0 }}>
            <div className="banner" style={{ background: "rgba(251,191,36,.12)", borderColor: "rgba(251,191,36,.4)", color: "#fcd34d" }}>
              Your Setty Advisor voice tokens are low (~{wallet.remainingMin} min left). <Link href="/group/billing" style={{ color: "#fcd34d", textDecoration: "underline", fontWeight: 600 }}>Add a card &amp; top up (50% off)</Link> — your free allowance refreshes next month. Chat is always free.
            </div>
          </div>
        )}
        <CoachWorkspace
          variant="group"
          intro={`Hey ${first} — let's look across the group.`}
          welcome={welcome}
          starters={[
            "Which practices need my attention?",
            "Is our weakest skill systemic or local?",
            "What does our top office do that others don't?",
            "Draft a message to my office managers for this week.",
          ]}
        />
      </>
    );
  }

  // Office Admin / manager → Practice Performance Coach (team-grounded).
  // Setty Office Coach is included for everyone now.
  if (isManagerRole(activeRole) && user.officeId) {
    const o = await getOfficeOverview(user.officeId);
    const watch = o.attention.map((t) => t.name).slice(0, 2);
    const welcome = `Hey ${first} 👋 I'm Setty, your office coach. Your team is averaging ${o.teamAvg.toFixed(1)}/5 across ${o.activeSetters} active setter${o.activeSetters === 1 ? "" : "s"}${
      watch.length ? `, and ${watch.join(" & ")} could use a nudge` : ""
    }. Want me to break down where to focus this week?`;
    return (
      <>
        <div className="topbar">
          <div className="tb-greet">
            <h1>Setty Office Coach</h1>
            <p>Develop the team and lift booked-consult outcomes.</p>
          </div>
          <div className="tb-right">
            <span className="chip purple">Setty</span>
          </div>
        </div>
        <CoachWorkspace
          variant="manager"
          intro={`Hey ${first} — let's get your team booking more.`}
          welcome={welcome}
          starters={[
            "Who needs my attention this week?",
            "Is our weakest skill an individual or a team problem?",
            "Draft 1:1 notes for my lowest performer.",
            "What should I have the team drill this week?",
          ]}
        />
      </>
    );
  }

  const welcome = `Hey ${first} 👋 I'm Setty, your coach. Ask me anything about your calls — or open a call and hit "Coach me from this call" for feedback tied to that exact conversation.`;

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Coach Setty</h1>
          <p>Setty — sharpen the skills your calls show you need.</p>
        </div>
        <div className="tb-right">
          <span className="chip purple">Setty</span>
        </div>
      </div>
      <CoachWorkspace intro={`Hey ${first} — let's sharpen your next call.`} welcome={welcome} starters={GENERAL_STARTERS} />
    </>
  );
}
