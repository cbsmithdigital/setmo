import Image from "next/image";
import Link from "next/link";
import { loadAuditByCookie } from "@/lib/audit-auth";
import { auditCallCounts, buildAuditReport, AUDIT_CALLS, AUDIT_CALL_MAX_SECONDS } from "@/lib/audit";
import { AuditRunner } from "@/components/audit/AuditRunner";
import { AuditClaim } from "@/components/audit/AuditClaim";
import { AuditRequestReview } from "@/components/audit/AuditRequestReview";
import { SettyButton } from "@/components/audit/SettyButton";
import { Icon, type IconName } from "@/components/ui/Icon";
import "../../marketing.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your Setter Audit — SetMo" };

// Setty's floating launcher renders only once the voice agent is configured (Stage 3).
const settyEnabled = Boolean(process.env.SETMO_SETTY_AGENT_ID);

const PLATFORM_FEATURES: { icon: IconName; title: string; desc: string }[] = [
  { icon: "mic", title: "Unlimited AI practice", desc: "Your whole team reps real inbound calls against a lifelike AI lead — no live leads at risk." },
  { icon: "chart", title: "8-point scoring every call", desc: "Objective rubric scoring with wins, misses, and the exact words to use next time." },
  { icon: "chat", title: "Setty coaching", desc: "On-demand voice + chat coaching that knows each setter's calls and weak spots." },
  { icon: "book", title: "Trainings library", desc: "Targeted video + workbook lessons that surface from how each setter actually scored." },
  { icon: "trophy", title: "Goals & leaderboards", desc: "Team goals, streaks, and rewards that keep setters improving." },
  { icon: "building", title: "Group / DSO command center", desc: "Roll-up performance across every location — free at 2+ locations." },
];

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mkt">
      <header className="nav">
        <div className="wrap nav-inner">
          <Link className="logo" href="/">
            <Image className="lm" src="/setmo-icon.png" alt="" width={36} height={36} />
            <span>Set<span className="mo">Mo</span></span>
          </Link>
          <div className="nav-cta"><Link className="signin" href="/login">Sign in</Link></div>
        </div>
      </header>
      <div className="audit-shell">{children}</div>
    </div>
  );
}

export default async function AuditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const audit = await loadAuditByCookie(id);

  if (!audit) {
    return (
      <Shell>
        <div className="audit-card">
          <h3 style={{ fontSize: 22, marginBottom: 10 }}>Check your email to continue</h3>
          <p style={{ color: "var(--m-muted)", fontSize: 15.5 }}>Open the confirmation link we emailed you to start your audit. Links open on this device.</p>
        </div>
      </Shell>
    );
  }

  if (audit.status === "PENDING_APPROVAL") {
    return (
      <Shell>
        <div className="audit-card">
          <h3 style={{ fontSize: 22, marginBottom: 10 }}>One quick check 🔍</h3>
          <p style={{ color: "var(--m-muted)", fontSize: 15.5, marginBottom: 10 }}>
            It looks like <b style={{ color: "var(--ink-soft)" }}>{audit.email}</b> is a personal email. SetMo is built for dental practices, so the fastest way in is to start the audit again with your <b style={{ color: "var(--ink-soft)" }}>practice email</b>.
          </p>
          <p style={{ color: "var(--m-muted)", fontSize: 15.5 }}>
            Some practices do use personal emails for staff or doctors. If that&apos;s you, request a review and we&apos;ll confirm your access by hand and email you your link.
          </p>
          <AuditRequestReview auditId={id} />
        </div>
      </Shell>
    );
  }

  if (audit.status === "SCORED") {
    const r = await buildAuditReport(id);
    if (!r) return <Shell><div className="audit-card">Report unavailable.</div></Shell>;
    const rec = r.recovery;
    return (
      <Shell>
        <div className="sec-head" style={{ marginBottom: 22 }}>
          <span className="eyebrow">Setter Audit · {r.practiceName}</span>
          <h2 style={{ fontSize: 34, margin: "10px 0 6px" }}>Your report is ready.</h2>
          <p style={{ fontSize: 15.5 }}>We scored your call on the same 8-point rubric your team would train against.</p>
        </div>

        {/* scorecard (dark panel, matches the marketing mock) */}
        <div className="darkpanel audit-rep" style={{ marginBottom: 18 }}>
          <div className="ar-top">
            <div className="ar-score" style={{ background: r.overall >= 4 ? "linear-gradient(135deg,#34d399,#10b981)" : "linear-gradient(135deg,#f7b955,#f59e0b)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>{r.overall.toFixed(1)}</div>
            <div>
              <div className="lab">Overall readiness · {r.totalCalls} call{r.totalCalls === 1 ? "" : "s"} scored</div>
              <div className="sub">{r.bookedCount} of {r.totalCalls} consult{r.totalCalls === 1 ? "" : "s"} booked</div>
            </div>
          </div>
          <div className="ar-leak">Top leaking skills</div>
          {r.leaks.map((l) => (
            <div className="skill-row" key={l.key}>
              <span className="nm">{l.name}</span>
              <span className="track"><span className="fill" style={{ width: `${(l.score / 5) * 100}%`, background: "linear-gradient(90deg,#f7b955,#f59e0b)" }} /></span>
              <span className="sc">{l.score.toFixed(1)}</span>
            </div>
          ))}
          {rec && (
            <div className="ar-recover">
              <div className="l">Estimated recovery</div>
              <div className="v"><span>+{rec.treatmentStartsPerMonth} treatment start{rec.treatmentStartsPerMonth === 1 ? "" : "s"} / mo</span> · ~${rec.dollarValue.toLocaleString()}</div>
              <div style={{ color: "var(--d-muted)", fontSize: 12, marginTop: 6 }}>
                Closing the leaks above lifts your set rate ~+{rec.setRateLiftPts} pts and show rate ~+{rec.showRateLiftPts} pts — about {rec.treatmentStartsPerMonth} more treatment start{rec.treatmentStartsPerMonth === 1 ? "" : "s"} a month at ${rec.caseValue.toLocaleString()}/case.
              </div>
            </div>
          )}
        </div>

        {/* full 8-skill breakdown */}
        <div className="audit-card" style={{ marginBottom: 18 }}>
          <h3 style={{ fontSize: 18, marginBottom: 14 }}>Full skill breakdown</h3>
          {r.skills.map((s) => (
            <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 11 }}>
              <span style={{ width: 150, flex: "none", fontSize: 13.5, color: "var(--ink-soft)" }}>{s.name}</span>
              <span style={{ flex: 1, height: 8, borderRadius: 999, background: "var(--cream-2)", overflow: "hidden" }}>
                <span style={{ display: "block", height: "100%", width: `${(s.score / 5) * 100}%`, borderRadius: 999, background: s.score >= 4.4 ? "var(--m-grad-mint)" : s.score < 3.5 ? "linear-gradient(90deg,#f7b955,#f59e0b)" : "var(--m-grad)" }} />
              </span>
              <span style={{ width: 30, textAlign: "right", fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 14 }}>{s.score.toFixed(1)}</span>
            </div>
          ))}
        </div>

        {/* per-call notes */}
        <div className="audit-card" style={{ marginBottom: 18 }}>
          <h3 style={{ fontSize: 18, marginBottom: 14 }}>Your call</h3>
          {r.perCall.map((c) => (
            <div key={c.n} style={{ padding: "12px 0", borderTop: c.n > 1 ? "1px solid var(--m-line)" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                <b style={{ fontFamily: "var(--font-lato)" }}>Call {c.n}</b>
                <span style={{ fontSize: 12.5, color: "var(--m-muted)" }}>{c.persona}</span>
                <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 700 }}>
                  <span style={{ color: c.booked ? "var(--mint-deep)" : "#b42318" }}>{c.booked ? "Booked ✓" : "Not booked"}</span>
                  <span style={{ color: "var(--m-muted)" }}>· {c.score.toFixed(1)}</span>
                  <span
                    title="Likely show rate based on how well the call built commitment (the why, pain, value, objections, close)"
                    style={{
                      padding: "2px 9px", borderRadius: 999, fontSize: 11.5, fontWeight: 800,
                      background: c.showRate >= 50 ? "var(--mint-soft)" : c.showRate >= 35 ? "var(--cream-2)" : "#fdecec",
                      color: c.showRate >= 50 ? "var(--mint-deep)" : c.showRate >= 35 ? "var(--ink-soft)" : "#b42318",
                    }}
                  >
                    ~{c.showRate}% show
                  </span>
                </span>
              </div>
              {c.win && <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginBottom: 3 }}>👍 {c.win}</p>}
              {c.miss && <p style={{ fontSize: 13.5, color: "var(--m-muted)", marginBottom: 3 }}>🎯 {c.miss}</p>}
              {c.phrase && <p style={{ fontSize: 13, color: "var(--m-muted)" }}>Try: &ldquo;{c.phrase.to}&rdquo;</p>}
            </div>
          ))}
        </div>

        {/* where to start */}
        <div className="audit-card" style={{ marginBottom: 18 }}>
          <h3 style={{ fontSize: 18, marginBottom: 12 }}>Where to start</h3>
          {r.nextSteps.map((n, i) => (
            <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, fontSize: 14.5 }}>
              <span style={{ color: "var(--purple-deep)", fontWeight: 800 }}>{i + 1}</span>
              <span><b>{n.skill}:</b> {n.training}</span>
            </div>
          ))}
        </div>

        {/* the coaching that closes the gap — real platform trainings */}
        {r.trainingExamples.length > 0 && (
          <div className="audit-card" style={{ marginBottom: 18 }}>
            <h3 style={{ fontSize: 18, marginBottom: 4 }}>The coaching that closes the gap</h3>
            <p style={{ color: "var(--m-muted)", fontSize: 14, marginBottom: 16 }}>A taste of the trainings inside SetMo — they surface automatically from how each setter scores.</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 12 }}>
              {r.trainingExamples.map((t) => (
                <div key={t.id} style={{ border: "1px solid var(--m-line)", borderRadius: 14, padding: "14px 16px", background: "var(--paper)" }}>
                  <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--purple-deep)", marginBottom: 8 }}>{t.type === "VIDEO" ? "Video" : "Workbook"} · {t.length} {t.type === "VIDEO" ? "min" : "pp"}</span>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6, lineHeight: 1.25 }}>{t.title}</div>
                  <div style={{ fontSize: 12.5, color: "var(--m-muted)" }}>Targets {t.skill}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* everything in SetMo — platform walkthrough */}
        <div className="audit-card" style={{ marginBottom: 18 }}>
          <h3 style={{ fontSize: 18, marginBottom: 4 }}>Everything you get with SetMo</h3>
          <p style={{ color: "var(--m-muted)", fontSize: 14, marginBottom: 16 }}>One flat price per location — unlimited users, every feature included.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 14 }}>
            {PLATFORM_FEATURES.map((f) => (
              <div key={f.title} style={{ display: "flex", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--purple-soft)", color: "var(--purple-deep)", display: "grid", placeItems: "center", flex: "none" }}>
                  <Icon name={f.icon} size={18} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: 3 }}>{f.title}</div>
                  <div style={{ fontSize: 13, color: "var(--m-muted)", lineHeight: 1.45 }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="audit-card">
          <h3 style={{ fontSize: 20, marginBottom: 6 }}>Turn this into your team&apos;s baseline</h3>
          <p style={{ color: "var(--m-muted)", fontSize: 14.5, marginBottom: 6 }}>
            Activate SetMo for {r.practiceName} and put every setter on the same coaching. Early adopters who start before <b style={{ color: "var(--ink-soft)" }}>Aug 1</b> lock in special pricing.
          </p>
          <AuditClaim auditId={id} />
          <p className="audit-note" style={{ textAlign: "center" }}>
            This report is your baseline, saved {r.baselineAt ? new Date(r.baselineAt).toLocaleDateString() : "today"}. Questions? Tap <b style={{ color: "var(--ink-soft)" }}>Talk to Setty</b> — or <a href="mailto:hello@growdental.ai?subject=SetMo%20for%20our%20group" style={{ color: "var(--purple-deep)", fontWeight: 600 }}>talk to us about a group</a>.
          </p>
        </div>

        {settyEnabled && <SettyButton auditId={id} practiceName={r.practiceName} />}
      </Shell>
    );
  }

  // ACTIVE (or CREATED fallback) → the runner
  const counts = await auditCallCounts(id);
  return (
    <Shell>
      <div className="sec-head" style={{ marginBottom: 22 }}>
        <span className="eyebrow">Free Setter Audit · {audit.practiceName}</span>
        <h2 style={{ fontSize: 32, margin: "10px 0 6px" }}>One call. One honest report.</h2>
        <p style={{ fontSize: 15.5 }}>Run it now, or send the link to your setter. We score it on the 8-point rubric and unlock your report.</p>
      </div>
      <AuditRunner
        id={id}
        contactName={audit.contactName}
        totalCalls={AUDIT_CALLS}
        maxSeconds={AUDIT_CALL_MAX_SECONDS}
        initialCalls={counts.calls}
      />
    </Shell>
  );
}
