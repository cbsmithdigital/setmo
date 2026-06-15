import Image from "next/image";
import Link from "next/link";
import { getCurrentUser, homeForRole, getActiveRole } from "@/lib/auth";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Ring } from "@/components/ui/widgets";

export const dynamic = "force-dynamic";

const DEMO_MAILTO = "mailto:hello@growdental.ai?subject=SetMo%20demo%20request";

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: "mic", title: "A real lead, on demand", body: "Setters practice against a lifelike AI patient that pushes back on price, fear, and timing — you never know who picks up." },
  { icon: "chart", title: "Objective 8-skill scoring", body: "Every call is scored on the skills that book high-ticket consults — rapport, discovery, pain-point, objections, value, closing, and more." },
  { icon: "chat", title: "An AI coach that knows the call", body: "Chat or talk it through. The coach grounds every tip in the exact moment, rewrites the weak line, and runs a live rep to lock it in." },
  { icon: "trophy", title: "Team & cross-practice leaderboards", body: "Fairness-weighted rankings keep it motivating, and managers see who's rising and who needs a nudge — at a glance." },
];

const STEPS: { n: string; title: string; body: string }[] = [
  { n: "1", title: "Run a call", body: "Pick a service and take a live, voice-to-voice call with an unpredictable AI lead." },
  { n: "2", title: "Get scored", body: "Within seconds, an objective scorecard with the transcript, recording, and exactly what to fix." },
  { n: "3", title: "Get coached", body: "Work the gap with your AI coach — by chat or voice — then run the next rep stronger." },
];

const ROLES: { icon: IconName; title: string; body: string }[] = [
  { icon: "mic", title: "Setters", body: "Practice safely, see your trend, and turn weak spots into booked appointments." },
  { icon: "team", title: "Office managers", body: "A performance coach for your team — diagnose, assign training, and draft your 1:1s." },
  { icon: "building", title: "DSO / group leaders", body: "Benchmark every practice, spot systemic gaps, and decide where to invest." },
];

export default async function LandingPage() {
  const user = await getCurrentUser();
  const appHref = user ? homeForRole(getActiveRole(user)) : null;

  return (
    <>
      <div className="app-bg" />
      <div style={{ position: "relative", zIndex: 1 }}>
        {/* nav */}
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", maxWidth: 1120, margin: "0 auto", padding: "22px 24px" }}>
          <div className="sb-logo" style={{ padding: 0, fontSize: 22 }}>
            <Image src="/setmo-icon.png" alt="" width={32} height={32} style={{ objectFit: "contain" }} />
            <span>Set<span style={{ color: "var(--mint)" }}>Mo</span></span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {appHref ? (
              <Link className="btn btn-primary" href={appHref}>Go to app <Icon name="arrow" size={16} /></Link>
            ) : (
              <>
                <Link className="btn btn-ghost" href="/login">Log in</Link>
                <a className="btn btn-primary" href={DEMO_MAILTO}>Book a demo</a>
              </>
            )}
          </div>
        </header>

        {/* hero */}
        <section style={{ maxWidth: 1120, margin: "0 auto", padding: "40px 24px 24px" }}>
          <div className="grid g-2" style={{ gridTemplateColumns: "1.1fr .9fr", alignItems: "center", gap: 40 }}>
            <div>
              <div className="chip mint" style={{ marginBottom: 20 }}>
                <span className="live-dot" /> AI training for dental appointment setters
              </div>
              <h1 style={{ fontSize: 52, lineHeight: 1.05, letterSpacing: "-0.03em", marginBottom: 18 }}>
                Turn missed calls into <span className="grad-text">booked consults.</span>
              </h1>
              <p className="muted" style={{ fontSize: 18, lineHeight: 1.5, maxWidth: "32em", marginBottom: 28 }}>
                SetMo trains your front desk on high-value lead calls against a realistic AI patient — then scores every call objectively and coaches the gap. Every rep is one your team would&apos;ve fumbled on a real $40k lead.
              </p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {appHref ? (
                  <Link className="btn btn-primary btn-lg" href={appHref}>Go to your dashboard <Icon name="arrow" /></Link>
                ) : (
                  <>
                    <a className="btn btn-primary btn-lg" href={DEMO_MAILTO}>Book a demo <Icon name="arrow" /></a>
                    <Link className="btn btn-ghost btn-lg" href="/login">Log in</Link>
                  </>
                )}
              </div>
            </div>

            {/* hero visual */}
            <div className="card card-pad card-glow rise" style={{ position: "relative" }}>
              <div className="eyebrow" style={{ marginBottom: 14 }}>Call scorecard</div>
              <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 18 }}>
                <Ring value={4.6} size={108} stroke={9} label="overall" />
                <div>
                  <div style={{ fontSize: 15, color: "var(--text-2)", lineHeight: 1.45 }}>
                    Objection handling jumped from{" "}
                    <b className="mint-text" style={{ fontFamily: "var(--font-lato)", fontWeight: 900 }}>2.9 → 4.0</b>{" "}
                    over the last 6 reps.
                  </div>
                </div>
              </div>
              {[
                ["Rapport", 4.7],
                ["Discovery", 3.9],
                ["Objection handling", 4.0],
                ["Closing", 4.4],
              ].map(([name, score]) => (
                <div key={name as string} className="skill" style={{ padding: "6px 0" }}>
                  <div className="nm" style={{ fontSize: 13 }}>{name}</div>
                  <div className="track">
                    <div className={"fill" + ((score as number) >= 4.4 ? " mint" : "")} style={{ width: ((score as number) / 5) * 100 + "%" }} />
                  </div>
                  <div className="sc">{(score as number).toFixed(1)}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* features */}
        <section style={{ maxWidth: 1120, margin: "0 auto", padding: "48px 24px" }}>
          <h2 style={{ fontSize: 30, marginBottom: 8 }}>Practice that actually moves the needle</h2>
          <p className="muted" style={{ fontSize: 16, marginBottom: 28 }}>Not a quiz. Real calls, objective feedback, and coaching that compounds.</p>
          <div className="grid g-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="card card-pad">
                <div style={{ width: 46, height: 46, borderRadius: 13, background: "var(--grad)", display: "grid", placeItems: "center", color: "#fff", marginBottom: 14, boxShadow: "var(--glow)" }}>
                  <Icon name={f.icon} size={22} />
                </div>
                <h3 style={{ fontSize: 17, marginBottom: 7 }}>{f.title}</h3>
                <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.5 }}>{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* how it works */}
        <section style={{ maxWidth: 1120, margin: "0 auto", padding: "16px 24px 48px" }}>
          <div className="card card-pad" style={{ background: "linear-gradient(160deg,#15132a,#0a0a14)" }}>
            <h2 style={{ fontSize: 28, marginBottom: 24 }}>How it works</h2>
            <div className="grid g-3">
              {STEPS.map((s) => (
                <div key={s.n}>
                  <div style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 40, color: "var(--purple-2)", lineHeight: 1, marginBottom: 10 }}>{s.n}</div>
                  <h3 style={{ fontSize: 18, marginBottom: 6 }}>{s.title}</h3>
                  <p className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* roles */}
        <section style={{ maxWidth: 1120, margin: "0 auto", padding: "16px 24px 48px" }}>
          <h2 style={{ fontSize: 30, marginBottom: 8 }}>Built for the whole organization</h2>
          <p className="muted" style={{ fontSize: 16, marginBottom: 28 }}>One platform, the right view for every role.</p>
          <div className="grid g-3">
            {ROLES.map((r) => (
              <div key={r.title} className="card card-pad">
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 11, background: "var(--s3)", display: "grid", placeItems: "center", color: "var(--purple-2)" }}>
                    <Icon name={r.icon} size={19} />
                  </div>
                  <h3 style={{ fontSize: 18 }}>{r.title}</h3>
                </div>
                <p className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>{r.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section style={{ maxWidth: 1120, margin: "0 auto", padding: "16px 24px 64px" }}>
          <div className="card card-pad card-glow" style={{ textAlign: "center", padding: "48px 24px" }}>
            <h2 style={{ fontSize: 34, marginBottom: 12, letterSpacing: "-0.02em" }}>Set more appointments.</h2>
            <p className="muted" style={{ fontSize: 17, marginBottom: 26, maxWidth: "30em", margin: "0 auto 26px" }}>
              See how SetMo turns your front desk into your best closer.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              {appHref ? (
                <Link className="btn btn-primary btn-lg" href={appHref}>Go to app <Icon name="arrow" /></Link>
              ) : (
                <>
                  <a className="btn btn-primary btn-lg" href={DEMO_MAILTO}>Book a demo <Icon name="arrow" /></a>
                  <Link className="btn btn-ghost btn-lg" href="/login">Log in</Link>
                </>
              )}
            </div>
          </div>
        </section>

        {/* footer */}
        <footer style={{ borderTop: "1px solid var(--line)", padding: "24px 0" }}>
          <div style={{ maxWidth: 1120, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div className="sb-logo" style={{ padding: 0, fontSize: 18 }}>
              <Image src="/setmo-icon.png" alt="" width={24} height={24} style={{ objectFit: "contain" }} />
              <span>Set<span style={{ color: "var(--mint)" }}>Mo</span></span>
            </div>
            <p className="muted" style={{ fontSize: 13 }}>A Grow Dental product · © {new Date().getFullYear()}</p>
          </div>
        </footer>
      </div>
    </>
  );
}
