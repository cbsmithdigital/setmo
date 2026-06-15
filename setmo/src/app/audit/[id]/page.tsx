import Image from "next/image";
import Link from "next/link";
import { loadAuditByCookie } from "@/lib/audit-auth";
import { auditCallCounts, buildAuditReport, AUDIT_CALLS, AUDIT_CALL_MAX_SECONDS } from "@/lib/audit";
import { AuditRunner } from "@/components/audit/AuditRunner";
import "../../marketing.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your Setter Audit — SetMo" };

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
          <h3 style={{ fontSize: 22, marginBottom: 10 }}>We&apos;re reviewing your request 🔍</h3>
          <p style={{ color: "var(--m-muted)", fontSize: 15.5 }}>
            Because you used a personal email or your practice already used its free audit, we&apos;re confirming this one by hand. We&apos;ll email <b style={{ color: "var(--ink-soft)" }}>{audit.email}</b> shortly. Want it sooner? Reply to that email.
          </p>
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
          <p style={{ fontSize: 15.5 }}>{r.bookedCount} of {r.totalCalls} setable consults booked across your 5 calls.</p>
        </div>

        {/* scorecard (dark panel, matches the marketing mock) */}
        <div className="darkpanel audit-rep" style={{ marginBottom: 18 }}>
          <div className="ar-top">
            <div className="ar-score" style={{ background: r.overall >= 4 ? "linear-gradient(135deg,#34d399,#10b981)" : "linear-gradient(135deg,#f7b955,#f59e0b)", WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>{r.overall.toFixed(1)}</div>
            <div>
              <div className="lab">Overall readiness · {r.totalCalls} leads scored</div>
              <div className="sub">{r.bookedCount} of {r.totalCalls} setable consults booked</div>
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
              <div className="v"><span>+{rec.recoveredPerMonth} booked consults / mo</span> · ~${rec.dollarValue.toLocaleString()}</div>
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
          <h3 style={{ fontSize: 18, marginBottom: 14 }}>Call by call</h3>
          {r.perCall.map((c) => (
            <div key={c.n} style={{ padding: "12px 0", borderTop: c.n > 1 ? "1px solid var(--m-line)" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <b style={{ fontFamily: "var(--font-lato)" }}>Call {c.n}</b>
                <span style={{ fontSize: 12.5, color: "var(--m-muted)" }}>{c.persona}</span>
                <span style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 700, color: c.booked ? "var(--mint-deep)" : "#b42318" }}>{c.booked ? "Booked ✓" : "Not booked"} · {c.score.toFixed(1)}</span>
              </div>
              {c.win && <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginBottom: 3 }}>👍 {c.win}</p>}
              {c.miss && <p style={{ fontSize: 13.5, color: "var(--m-muted)", marginBottom: 3 }}>🎯 {c.miss}</p>}
              {c.phrase && <p style={{ fontSize: 13, color: "var(--m-muted)" }}>Try: &ldquo;{c.phrase.to}&rdquo;</p>}
            </div>
          ))}
        </div>

        {/* next steps + CTA */}
        <div className="audit-card">
          <h3 style={{ fontSize: 18, marginBottom: 12 }}>Where to start</h3>
          {r.nextSteps.map((n, i) => (
            <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, fontSize: 14.5 }}>
              <span style={{ color: "var(--purple-deep)", fontWeight: 800 }}>{i + 1}</span>
              <span><b>{n.skill}:</b> {n.training}</span>
            </div>
          ))}
          <a className="btn btn-primary btn-block" href="mailto:hello@growdental.ai?subject=SetMo%20for%20our%20practice" style={{ marginTop: 18 }}>Close the gap with SetMo</a>
          <p className="audit-note" style={{ textAlign: "center" }}>This report is your baseline, saved {r.baselineAt ? new Date(r.baselineAt).toLocaleDateString() : "today"}. The report is yours to keep.</p>
        </div>
      </Shell>
    );
  }

  // ACTIVE (or CREATED fallback) → the runner
  const counts = await auditCallCounts(id);
  return (
    <Shell>
      <div className="sec-head" style={{ marginBottom: 22 }}>
        <span className="eyebrow">Free Setter Audit · {audit.practiceName}</span>
        <h2 style={{ fontSize: 32, margin: "10px 0 6px" }}>Five calls. One honest report.</h2>
        <p style={{ fontSize: 15.5 }}>Run them now, or send the link to your setter. We score each on the 8-point rubric and unlock your report at the end.</p>
      </div>
      <AuditRunner
        id={id}
        contactName={audit.contactName}
        totalCalls={AUDIT_CALLS}
        maxSeconds={AUDIT_CALL_MAX_SECONDS}
        initialScored={counts.scored}
        initialTotal={counts.total}
      />
    </Shell>
  );
}
