import { requireUser, getActiveRole, isManagerRole } from "@/lib/auth";
import { getSessionResult } from "@/lib/queries";
import { getOfficeOverview } from "@/lib/office";
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

  // Office Admin / manager → Practice Performance Coach (team-grounded).
  if (isManagerRole(getActiveRole(user)) && user.officeId) {
    const o = await getOfficeOverview(user.officeId);
    const watch = o.attention.map((t) => t.name).slice(0, 2);
    const welcome = `Hey ${first} 👋 I'm your practice performance coach. Your team is averaging ${o.teamAvg.toFixed(1)}/5 across ${o.activeSetters} active setter${o.activeSetters === 1 ? "" : "s"}${
      watch.length ? `, and ${watch.join(" & ")} could use a nudge` : ""
    }. Want me to break down where to focus this week?`;
    return (
      <>
        <div className="topbar">
          <div className="tb-greet">
            <h1>Coach</h1>
            <p>Your AI performance coach — develop the team and lift booked-consult outcomes.</p>
          </div>
          <div className="tb-right">
            <span className="chip purple">AI Coach</span>
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

  let welcome = `Hey ${first} 👋 I'm your SetMo coach. Ask me anything about your calls — or open a session and hit "Coach me from this call" for feedback tied to that exact conversation.`;
  let starters = GENERAL_STARTERS;
  let subhead = "Your AI coach — sharpen the skills your calls show you need.";
  let intro = `Hey ${first} — let's sharpen your next call.`;

  if (session) {
    const r = await getSessionResult(session, user);
    if (r) {
      const lowest = [...r.skills].sort((a, b) => a.score - b.score)[0];
      welcome = `Let's break down your ${r.persona} call (scored ${r.score.toFixed(1)}/5). Where do you want to start${
        lowest ? ` — your ${lowest.name.toLowerCase()}?` : "?"
      }`;
      starters = [
        "What was my biggest miss on this call?",
        lowest ? `How do I improve my ${lowest.name.toLowerCase()}?` : "Where did I lose momentum?",
        "Rewrite my weakest moment with better wording.",
        "Give me a stronger close I could have used.",
      ];
      subhead = `Coaching on your ${r.persona} call · ${r.service}`;
      intro = `Let's work on your ${r.persona} call (scored ${r.score.toFixed(1)}/5).`;
    }
  }

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Coach</h1>
          <p>{subhead}</p>
        </div>
        <div className="tb-right">
          <span className="chip purple">AI Coach</span>
        </div>
      </div>
      <CoachWorkspace sessionId={session} intro={intro} welcome={welcome} starters={starters} />
    </>
  );
}
