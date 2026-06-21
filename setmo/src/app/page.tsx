import Image from "next/image";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getPricingConfig } from "@/lib/config";
import { PricingSlider } from "@/components/marketing/PricingSlider";
import "./marketing.css";

export const dynamic = "force-dynamic";

// The "free audit / start free" CTAs go to the Setter Audit front door.
const AUDIT_HREF = "/audit";
const SIGNUP_HREF = "/signup";
const DEMO_MAILTO = "mailto:hello@growdental.ai?subject=SetMo%20for%20our%20group";

function Ck() {
  return (
    <span className="ck">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
    </span>
  );
}
function Arrow() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
}
function Star() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3l2 6 6 .5-4.5 4 1.5 6L12 16l-5.5 3.5 1.5-6L3.5 9.5 10 9z" /></svg>;
}

const WAVE = [22, 34, 16, 40, 28, 46, 20, 36, 24, 42, 18, 30, 38, 26, 44, 19, 33, 41, 23, 37, 17, 45, 29, 35, 21, 39, 27, 43, 15, 31, 25, 40, 20, 36];

function Wave() {
  return (
    <div className="wave">
      {WAVE.map((h, i) => (
        <i key={i} style={{ height: h, animationDelay: `${(i * 0.06).toFixed(2)}s` }} />
      ))}
    </div>
  );
}

export default async function LandingPage() {
  const user = await getCurrentUser();
  const signedIn = Boolean(user);
  const pricing = await getPricingConfig();

  return (
    <div className="mkt">
      {/* nav */}
      <header className="nav">
        <div className="wrap nav-inner">
          <a className="logo" href="#top">
            <Image className="lm" src="/setmo-icon.png" alt="" width={36} height={36} />
            <span>Set<span className="mo">Mo</span></span>
          </a>
          <nav className="nav-links">
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#groups">For Groups &amp; DSOs</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="nav-cta">
            {signedIn ? (
              <Link className="btn btn-primary" href="/go">Open the app <Arrow /></Link>
            ) : (
              <>
                <Link className="signin" href="/login">Sign in</Link>
                <Link className="btn btn-primary" href={SIGNUP_HREF}>Get SetMo Now <Arrow /></Link>
              </>
            )}
          </div>
        </div>
      </header>

      <span id="top" />

      {/* hero */}
      <section className="hero">
        <div className="blob" style={{ width: 340, height: 340, background: "var(--purple)", left: -90, top: 40 }} />
        <div className="blob" style={{ width: 260, height: 260, background: "var(--m-mint)", right: "6%", top: 280, opacity: 0.35 }} />
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <div className="badge"><span className="pill">New</span> A Grow Dental AI product</div>
            <h1>Set more <span className="grad-text">appointments.</span></h1>
            <p className="lead">SetMo lets your front desk practice high-value lead calls against a realistic AI patient — objectively scored and personally coached. Then it gives managers and groups the data to coach the whole team. Build the skill without burning a single real lead.</p>
            <div className="hero-cta">
              <Link className="btn btn-primary" href={SIGNUP_HREF}>Get SetMo Now <Arrow /></Link>
              <a className="btn btn-ghost" href={AUDIT_HREF}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 17V9M15 17v-4M12 17v-6" /><rect x="3" y="3" width="18" height="18" rx="3" /></svg>
                Get Your Free Audit
              </a>
            </div>
            <div className="hero-note">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--mint-deep)" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>
              <span><b>Your Setter Assessment is free.</b> No real leads at risk, ever.</span>
            </div>
            <div className="founders"><span className="dotf" /> $44.95/mo per practice · unlimited users · month-to-month</div>
          </div>
          <div className="device-stage">
            <div className="streak-chip"><span className="ico">🔥</span><span>7-day streak<br /><span style={{ color: "var(--mint-deep)", fontWeight: 700 }}>+12% this week</span></span></div>
            <div className="app-card">
              <div className="ac-top">
                <div className="ac-live"><span className="live-dot" />LIVE PRACTICE</div>
                <div className="ac-timer">02:14 · 47 min left</div>
              </div>
              <div className="ac-persona">Implant / full-arch lead · adaptive difficulty</div>
              <div className="ac-title">You&apos;re calling a new lead…</div>
              <Wave />
              <div className="ac-foot">
                <div className="ac-btn mute">Mute</div>
                <div className="ac-btn end">End call &amp; get feedback</div>
              </div>
            </div>
            <div className="score-chip">
              <div className="score-num">4.6</div>
              <div className="meta"><b>Last session</b>up from 3.9 · objection handling +2</div>
            </div>
          </div>
        </div>
      </section>

      {/* trust */}
      <section className="trust">
        <div className="wrap">
          <p>BUILT FOR THE PRACTICES AND GROUPS CHASING HIGH-TICKET CASES</p>
          <div className="logos">
            {["Brightwork Dental", "Lakeside Implants", "Meridian DSO", "Coastal Smiles", "Apex Oral Care"].map((n) => (
              <div className="lg" key={n}><span className="m" />{n}</div>
            ))}
          </div>
        </div>
      </section>

      {/* roi */}
      <section className="sec" style={{ padding: "54px 0 0" }}>
        <div className="wrap">
          <div className="roi reveal">
            <h2>A booked full-arch consult is worth <span className="mint-text">$10,000–15,000</span>. A fumbled one is worth nothing.</h2>
            <p>SetMo is where your team gets sharp — before the call that pays for the year.</p>
          </div>
        </div>
      </section>

      {/* stats */}
      <section className="stats">
        <div className="wrap stats-grid">
          <div className="stat reveal"><div className="deco" style={{ background: "var(--purple)" }} /><div className="big grad-text">0</div><p>real leads burned while your team learns. Every rep is against an AI patient.</p></div>
          <div className="stat reveal"><div className="deco" style={{ background: "var(--purple)" }} /><div className="big grad-text">8</div><p>skills scored on every single call — from rapport to closing the appointment.</p></div>
          <div className="stat reveal"><div className="deco" style={{ background: "var(--m-mint)" }} /><div className="big mint-text">$44.95</div><p>per practice, per month. Unlimited users, all features — then pay-as-you-go minutes that roll over.</p></div>
        </div>
      </section>

      {/* how it works */}
      <section className="sec" id="how">
        <div className="wrap">
          <div className="sec-head center reveal">
            <span className="eyebrow">How it works</span>
            <h2>From nervous newbie to <span className="grad-text">closer</span> in three steps.</h2>
            <p>No scripts to memorize, no live calls to fumble. Just reps — measured, coached, and repeatable.</p>
          </div>
          <div className="steps">
            <div className="step reveal"><div className="n">01</div><h3>Call a realistic AI lead</h3><p>Your setter starts a voice call with an AI that role-plays a difficult dental lead — complete with a hidden reason they&apos;re really calling. No two calls are the same.</p></div>
            <div className="step reveal"><div className="n">02</div><h3>Get objectively scored</h3><p>The AI grades the call against an 8-point rubric and talks through what landed, what didn&apos;t, and the exact phrases to use next time.</p></div>
            <div className="step reveal"><div className="n">03</div><h3>Improve with real coaching</h3><p>SetMo turns every call into progress tracking, targeted training with the reason attached, and team leaderboards that make practice stick.</p></div>
          </div>
        </div>
      </section>

      {/* features */}
      <section className="sec" id="features" style={{ paddingTop: 30 }}>
        <div className="wrap">
          <div className="feat reveal">
            <div className="feat-copy">
              <span className="eyebrow">The signature moment</span>
              <h2>A safe place to practice the calls that matter.</h2>
              <p className="d">Implants, full-arch, dentures, cosmetic — the calls worth tens of thousands of dollars are the ones nobody wants a rookie practicing live. SetMo gives them an unlimited-feeling sandbox.</p>
              <ul className="feat-list">
                <li><Ck />Voice-first calls that feel real — the AI pushes back, stalls, and tests resolve.</li>
                <li><Ck />A hidden persona and &ldquo;why&rdquo; every time, so reps never get stale.</li>
                <li><Ck />Difficulty that adapts as your setter gets better.</li>
              </ul>
            </div>
            <div className="feat-art">
              <div className="darkpanel">
                <div className="ac-top" style={{ marginBottom: 16 }}>
                  <div className="ac-live"><span className="live-dot" />LIVE</div>
                  <div className="ac-timer">03:42 · 41 min left</div>
                </div>
                <div className="ac-persona">Implant / full-arch · undisclosed persona</div>
                <div className="ac-title" style={{ fontSize: 18 }}>&ldquo;I&apos;ve been quoted $40k somewhere else…&rdquo;</div>
                <Wave />
                <div className="ac-foot"><div className="ac-btn mute">Mute</div><div className="ac-btn end">End &amp; get feedback</div></div>
              </div>
            </div>
          </div>

          <div className="feat rev reveal">
            <div className="feat-copy">
              <span className="eyebrow">Objective scoring</span>
              <h2>Scores you can trust, not gut feel.</h2>
              <p className="d">Every call comes back graded across eight skills, one to five, with the reasoning attached. Wins are celebrated, misses are reframed as the next thing to work on.</p>
              <ul className="feat-list">
                <li><Ck />Universal skills (rapport, listening, objections, confidence, closing) plus service-specific ones.</li>
                <li><Ck />Specific wins, specific misses, and the replacement phrases to try.</li>
                <li><Ck />Scores recorded server-side, so leaderboards stay honest.</li>
              </ul>
            </div>
            <div className="feat-art">
              <div className="darkpanel">
                <div className="bigscore"><span className="v">4.6</span><span className="o">/ 5.0</span><span className="delta">▲ up from 3.9</span></div>
                <div className="dp-label">Skill breakdown</div>
                {[["Rapport & warmth", 92, "4.6", false], ["Listening", 88, "4.4", false], ["Objection handling", 80, "4.0", true], ["Value building", 96, "4.8", false], ["Closing", 90, "4.5", true]].map(([nm, w, sc, mint]) => (
                  <div className="skill-row" key={nm as string}><span className="nm">{nm}</span><span className="track"><span className={"fill" + (mint ? " mint" : "")} style={{ width: `${w}%` }} /></span><span className="sc">{sc}</span></div>
                ))}
              </div>
            </div>
          </div>

          <div className="feat reveal">
            <div className="feat-copy">
              <span className="eyebrow">Progress &amp; leaderboards</span>
              <h2>Make getting better a little competitive.</h2>
              <p className="d">Mint means progress. Streaks, climbing scores, and a leaderboard that ranks on improvement — not who made the most calls — keep the whole front desk in the game.</p>
              <ul className="feat-list">
                <li><Ck />Per-skill trends over time, by service type.</li>
                <li><Ck />Office and cross-practice leaderboards, fairness-weighted.</li>
                <li><Ck />Mint highlights for every win and upward move.</li>
              </ul>
            </div>
            <div className="feat-art">
              <div className="darkpanel">
                <div className="dp-label">Office leaderboard · implants</div>
                <div className="lb-row"><span className="lb-rank">1</span><span className="lb-av">JR</span><span className="lb-nm">Jordan Reyes</span><span className="lb-sc">4.8</span><span className="lb-move">▲2</span></div>
                <div className="lb-row me"><span className="lb-rank">2</span><span className="lb-av">YOU</span><span className="lb-nm">You</span><span className="lb-sc">4.6</span><span className="lb-move">▲3</span></div>
                <div className="lb-row"><span className="lb-rank">3</span><span className="lb-av">MK</span><span className="lb-nm">Maya Khan</span><span className="lb-sc">4.5</span><span className="lb-move">—</span></div>
                <div className="lb-row"><span className="lb-rank">4</span><span className="lb-av">TD</span><span className="lb-nm">Theo Davis</span><span className="lb-sc">4.2</span><span className="lb-move">▲1</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ladder */}
      <section className="sec" id="ladder" style={{ paddingTop: 30 }}>
        <div className="wrap">
          <div className="sec-head center reveal">
            <span className="eyebrow">One platform · three levels</span>
            <h2>It doesn&apos;t stop at the <span className="grad-text">setter</span>.</h2>
            <p>Every practice call produces signal. SetMo doesn&apos;t let it sit in a dashboard — it climbs. Setters get sharp, managers get a coach for their coaching, and groups get a command center. Same platform, three levels of your team.</p>
          </div>
          <div className="ladder">
            <div className="rung reveal">
              <div className="step-up">01</div>
              <div className="lvl">
                <div className="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg></div>
                <div className="tags"><span>Team</span><b>For your setters</b></div>
              </div>
              <p>Your front desk practices the calls worth tens of thousands of dollars against a realistic AI patient, gets scored across all eight skills, and climbs the leaderboard. The reps they can&apos;t get on live leads — without the cost of a single live lead.</p>
            </div>
            <div className="rung reveal">
              <div className="step-up">02</div>
              <div className="lvl">
                <div className="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0M16 6a3 3 0 0 1 0 6M15 20a6 6 0 0 1 6-6" /></svg></div>
                <div className="tags"><span>Practice</span><b>For your office manager</b></div>
              </div>
              <p>Every setter&apos;s scores land in one place — and Setty, your office coach, reads them for you. Setty flags who&apos;s slipping, builds the training that fixes it, and talks through the call nobody&apos;s sure how to handle. The data stops being a report and starts making decisions.</p>
            </div>
            <div className="rung reveal">
              <div className="step-up">03</div>
              <div className="lvl">
                <div className="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M4 21V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v16M13 9h6a1 1 0 0 1 1 1v11M4 21h17M7 8h2M7 12h2M16 13h1" /></svg></div>
                <div className="tags"><span>Group / DSO</span><b>For your group</b></div>
              </div>
              <p>Running more than one location? See every office side by side — your standouts, your stragglers, and exactly what your best setters do differently. Setty Advisor is trained on your group&apos;s data, so your ops leaders get a recommendation, not just a chart. Find what&apos;s working in one office and roll it out to all of them.</p>
            </div>
          </div>
          <div className="ladder-close reveal">Start with one setter. Grow into the whole group. <span>The platform climbs with you.</span></div>
        </div>
      </section>

      {/* groups */}
      <section className="sec" id="groups" style={{ paddingTop: 30 }}>
        <div className="wrap">
          <div className="sec-head reveal">
            <span className="eyebrow">For groups &amp; DSOs</span>
            <h2>Make every location your <span className="mint-text">best</span> location.</h2>
            <p>You already have a top performer — an office, a setter, a way of handling the $40k objection that just works. The problem is it lives in one building. SetMo finds it, proves it, and spreads it across the group.</p>
          </div>
          <div className="feat reveal" style={{ paddingTop: 10 }}>
            <div className="feat-art">
              <div className="darkpanel">
                <div className="cc-head">
                  <div className="dp-label" style={{ margin: 0 }}>Group command center · set rate</div>
                  <span style={{ fontSize: 11, color: "var(--d-muted)", background: "var(--d-3)", padding: "4px 10px", borderRadius: 999 }}>5 locations</span>
                </div>
                <div className="cc-row"><span className="cc-rank">1</span><span className="cc-nm">Lakeside Implants<small>Tucson, AZ</small></span><span className="cc-rate">68%</span></div>
                <div className="cc-row"><span className="cc-rank">2</span><span className="cc-nm">Brightwork Dental<small>Austin, TX</small></span><span className="cc-rate">64%</span></div>
                <div className="cc-row flag"><span className="cc-rank">3</span><span className="cc-nm">Coastal Smiles<small>Tampa, FL</small></span><span className="cc-flagchip">Outlier ▲14%</span><span className="cc-rate">61%</span></div>
                <div className="cc-row"><span className="cc-rank">4</span><span className="cc-nm">Apex Oral Care<small>Denver, CO</small></span><span className="cc-rate">57%</span></div>
                <div className="cc-row"><span className="cc-rank">5</span><span className="cc-nm">Summit Dental Co.<small>Boise, ID</small></span><span className="cc-rate">49%</span></div>
                <div className="advisor">
                  <div className="ai"><Star /></div>
                  <div className="tx"><b>Setty Advisor:</b> Coastal Smiles&apos; objection-handling is up 14% this month — here&apos;s the drill they ran. Roll it out to Summit and Apex next.</div>
                </div>
              </div>
            </div>
            <div className="feat-copy">
              <ul className="feat-list" style={{ gap: 22 }}>
                <li><Ck /><span><b style={{ color: "var(--ink)", fontWeight: 700, display: "block", marginBottom: 3 }}>See every location at once.</b>One view across all your offices and brands — set rates, skill scores, and trends, ranked so your outliers surface on their own.</span></li>
                <li><Ck /><span><b style={{ color: "var(--ink)", fontWeight: 700, display: "block", marginBottom: 3 }}>Find what&apos;s actually working.</b>SetMo shows you what your top setters and offices do differently — the specific skills and phrases moving the needle. &ldquo;They&apos;re just better&rdquo; becomes something you can teach.</span></li>
                <li><Ck /><span><b style={{ color: "var(--ink)", fontWeight: 700, display: "block", marginBottom: 3 }}>Roll it out everywhere.</b>Turn your best office&apos;s playbook into the training every location runs — without flying anyone anywhere.</span></li>
                <li><Ck /><span><b style={{ color: "var(--ink)", fontWeight: 700, display: "block", marginBottom: 3 }}>Give your leaders Setty Advisor.</b>An AI trained on your group&apos;s data that reads every location&apos;s numbers and recommends the next move. A decision partner, not another dashboard.</span></li>
              </ul>
              <div style={{ marginTop: 28 }}>
                <a className="btn btn-primary" href={DEMO_MAILTO}>Talk to us about your group <Arrow /></a>
                <p style={{ fontSize: 13.5, color: "var(--m-muted)", marginTop: 12 }}>Tell us what you&apos;re running and we&apos;ll map the rollout.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* audit */}
      <section className="sec" id="audit" style={{ paddingTop: 30 }}>
        <div className="wrap">
          <div className="feat rev reveal">
            <div className="feat-copy">
              <span className="eyebrow">Start with the numbers</span>
              <h2>See what your front desk is leaving on the table.</h2>
              <p className="d">Before you change anything, find out what it&apos;s costing you. We&apos;ll score your setters&apos; calls and show you exactly where booked consults are slipping away.</p>
              <ul className="feat-list">
                <li><Ck />All five sessions scored on the same 8-point rubric your team trains against.</li>
                <li><Ck />A report showing exactly where booked consults are slipping, call by call.</li>
                <li><Ck />The gap translated into expected growth — recovered consults per month, and what that&apos;s worth in cases.</li>
              </ul>
              <p style={{ fontSize: 15, color: "var(--ink-soft)", margin: "22px 0 6px" }}><b>The Setter Assessment is free</b> — for everyone, no card required.</p>
              <p style={{ fontSize: 14.5, color: "var(--m-muted)", maxWidth: "34em" }}>The report is yours to keep, whether you buy or not. But if the leak is as big as it usually is, SetMo is how you close it.</p>
              <div style={{ marginTop: 24 }}>
                <Link className="btn btn-primary" href={AUDIT_HREF}>Get Your Free Audit <Arrow /></Link>
                <p style={{ fontSize: 13, color: "var(--m-muted)", marginTop: 12 }}>No software to install. No real leads touched. Your calls, your numbers.</p>
              </div>
            </div>
            <div className="feat-art">
              <div className="darkpanel audit-rep">
                <div className="dp-label">Setter Audit · Brightwork Dental</div>
                <div className="ar-top">
                  <div className="ar-score">3.4</div>
                  <div><div className="lab">Overall · 5 leads scored</div><div className="sub">2 of 5 setable consults booked</div></div>
                </div>
                <div className="ar-leak">Top 3 leaking skills</div>
                {[["Objection handling", 48, "2.4"], ["Pain-point discovery", 56, "2.8"], ["Closing the appt", 62, "3.1"]].map(([nm, w, sc]) => (
                  <div className="skill-row" key={nm as string}><span className="nm">{nm}</span><span className="track"><span className="fill" style={{ width: `${w}%`, background: "linear-gradient(90deg,#f7b955,#f59e0b)" }} /></span><span className="sc">{sc}</span></div>
                ))}
                <div className="ar-recover">
                  <div className="l">Estimated recovery</div>
                  <div className="v"><span>+6 booked consults / mo</span> · ~$72,000</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* testimonials */}
      <section className="sec" id="testimonials" style={{ paddingTop: 20 }}>
        <div className="wrap">
          <div className="tgrid">
            <div className="tcard feat-t reveal">
              <div className="quote">&ldquo;New hires used to cost us real consults while they found their feet. Now they walk in already sharp.&rdquo;</div>
              <div className="who"><div className="av" /><div><b>Dr. Lena Okafor</b><span>Owner · Brightwork Dental</span></div></div>
            </div>
            <div className="tcard reveal">
              <div className="quote">&ldquo;I used to guess who needed help. Now SetMo tells me who&apos;s slipping and hands me the drill to fix it — before it costs us a case.&rdquo;</div>
              <div className="who"><div className="av" /><div><b>Renee Walsh</b><span>Office Manager · Coastal Smiles</span></div></div>
            </div>
            <div className="tcard reveal">
              <div className="quote">&ldquo;We could finally see which offices were actually better, and why. We took our top location&apos;s playbook group-wide in a quarter.&rdquo;</div>
              <div className="who"><div className="av" /><div><b>Marcus Webb</b><span>Director of Operations · Meridian DSO</span></div></div>
            </div>
          </div>
        </div>
      </section>

      {/* pricing */}
      <section className="sec" id="pricing" style={{ paddingTop: 30 }}>
        <div className="wrap">
          <div className="sec-head center reveal">
            <span className="eyebrow">Pricing</span>
            <h2>Everything SetMo does, for <span className="mint-text">one flat price</span>.</h2>
            <p>$44.95 per location, month-to-month — unlimited users, every feature included, plus pay-as-you-go minutes that roll over. A serious edge for a single office, and it scales to a whole group at no extra tier.</p>
          </div>

          <div className="tiers" style={{ gridTemplateColumns: "1fr", margin: 0 }}>
            <div className="tier good reveal">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "8px 16px" }}>
                <div>
                  <span className="ttag" style={{ marginBottom: 10 }}>Practice Access</span>
                  <div className="tprice" style={{ margin: 0 }}>$44.95<small> / location / mo</small></div>
                </div>
                <div className="tcad" style={{ margin: 0 }}>Month-to-month · unlimited users · cancel anytime</div>
              </div>

              <div className="price-grid" style={{ marginTop: 22 }}>
                <div>
                  <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--ink-soft)", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ width: 7, height: 7, borderRadius: 99, background: "var(--purple)" }} /> Included for every office
                  </div>
                  <ul className="tfeats">
                    <li><Ck />Setter practice + full 8-point scoring, coaching &amp; replacement phrases</li>
                    <li><Ck />Office-manager dashboard + <b style={{ fontWeight: 700 }}>Setty Office Coach</b></li>
                    <li><Ck />Goals &amp; rewards, leaderboards, progress &amp; recommendations</li>
                    <li><Ck />Unlimited setters, managers &amp; users — no per-seat fees</li>
                  </ul>
                </div>

                <div className="pcol-sep">
                  <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--ink-soft)", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ width: 7, height: 7, borderRadius: 99, background: "var(--m-mint)" }} /> Run 2+ locations? You also get — free
                  </div>
                  <ul className="tfeats">
                    <li><Ck />Multi-location command center — every office side by side</li>
                    <li><Ck /><b style={{ fontWeight: 700 }}>Setty Advisor</b> — portfolio decision support across the group</li>
                    <li><Ck />Automatic outlier &amp; top-performer detection</li>
                    <li><Ck />One-click playbook rollout across locations</li>
                  </ul>
                </div>

              </div>

              <div className="price-slider-row">
                <PricingSlider cfg={pricing} />
                <div style={{ textAlign: "center", marginTop: 20, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                  <Link className="btn btn-primary" href={SIGNUP_HREF}>Get SetMo Now</Link>
                  <Link className="btn btn-ghost" href={AUDIT_HREF}>Get Your Free Audit</Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* faq */}
      <section className="sec" id="faq" style={{ paddingTop: 30 }}>
        <div className="wrap">
          <div className="sec-head center reveal">
            <span className="eyebrow">FAQ</span>
            <h2>The questions owners and ops leaders ask.</h2>
          </div>
          <div className="faq">
            {[
              ["Is this a real phone call?", "No — it's an in-browser voice conversation with an AI patient. Your setter is logged in and practicing safely; no real leads or phone lines are involved.", true],
              ["How is a setter scored?", "The AI grades each call across eight skills on a 1–5 scale — rapport, listening, discovery, pain-point exploration, objection handling, confidence, value building, and closing — with reasoning and specific feedback for each.", false],
              ["How does the free Setter Audit work?", "Every office gets one free audit. Your setter runs a live browser session against five simulated-but-setable leads — nothing to upload. We score all five on the same 8-point rubric and send back a report showing where booked consults are leaking and what recovering them is worth. Additional audits are $50 each.", false],
              ["What does it cost?", "$44.95 per practice per month, month-to-month, with unlimited users and every feature included. On top of that you buy practice minutes as you go — they roll over and never expire, and the per-minute rate drops the more you buy. Groups get the multi-location command center and Setty Advisor free once they run 2+ locations.", false],
              ["Who is Setty?", "Setty is SetMo's AI coach. For your office manager, Setty Office Coach reads every setter's scores, points out who's slipping and why, drafts the next training, and talks through the calls and decisions you're not sure about. For groups, Setty Advisor does the same across every location for your ops leaders. The data turns into action instead of another report.", false],
              ["How does SetMo work across multiple locations?", "Each location runs on the same flat access fee and its own minute balance. Once you have 2+ locations you unlock — free — the Group command center that puts every office side by side (set rates, skill scores, trends), surfaces outliers automatically, and shows what your best offices do differently. Setty Advisor, trained on your data, recommends what to roll out where.", false],
              ["Do I have to commit?", "No. SetMo is month-to-month — cancel anytime. There's no contract and no per-seat math; you pay the flat access fee per practice and buy minutes only as you need them.", false],
              ["What counts against my minutes?", "Only actual conversation time on practice and coaching calls. Minutes come out of your purchased balance, roll over month to month, and never expire. When you're running low you'll get a warning — never a surprise overage. The free Setter Assessment is always on us and never deducts from your balance.", false],
              ["Which call types are supported?", "SetMo launches with the implant / full-arch / denture agent — the most complex, highest-value call. Cosmetic, ortho, wisdom teeth, and general are on the roadmap and slot right in.", false],
              ["Is the assessment really free?", "Yes. Anyone can run a 5-call Setter Assessment and get the full report at no charge — and for paying practices it never costs minutes. Prospects can take a fresh one every couple of months to track progress.", false],
              ["Do you store patient data?", "No. Every persona is fictional and AI-generated. SetMo is a training tool — it handles employee performance and practice data only, with no patient health information involved.", false],
            ].map(([q, a, open]) => (
              <details className="qa" key={q as string} open={open as boolean}>
                <summary>{q as string}<span className="pm"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12h14" /></svg></span></summary>
                <div className="ans">{a as string}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* final CTA */}
      <section className="sec" style={{ paddingTop: 10 }}>
        <div className="wrap">
          <div className="final reveal">
            <h2>Set more, starting today.</h2>
            <p>Give your front desk the reps they can&apos;t get on live leads — and watch your set rate climb.</p>
            <div className="hero-cta" style={{ justifyContent: "center" }}>
              <Link className="btn btn-primary" href={SIGNUP_HREF}>Get SetMo Now <Arrow /></Link>
              <Link className="btn ghost-w" href={AUDIT_HREF}>Get Your Free Audit</Link>
            </div>
          </div>
        </div>
      </section>

      {/* footer */}
      <footer className="ft">
        <div className="wrap">
          <div className="ft-grid">
            <div>
              <a className="logo" href="#top"><Image className="lm" src="/setmo-icon.png" alt="" width={32} height={32} /><span>Set<span className="mo">Mo</span></span></a>
              <p>Train your front desk to set more high-ticket appointments — against a realistic AI patient, scored and coached. A Grow Dental AI product.</p>
            </div>
            <div className="ft-col"><h5>Product</h5><a href="#how">How it works</a><a href="#features">Features</a><a href="#pricing">Pricing</a><a href="#groups">For Groups</a><Link href="/login">Open the app</Link></div>
            <div className="ft-col"><h5>Company</h5><a href="#">About Grow Dental</a><a href="#">Careers</a><a href="#">Contact</a><a href="#">Blog</a></div>
            <div className="ft-col"><h5>Legal</h5><a href="#">Privacy</a><a href="#">Terms</a><a href="#">Security</a></div>
          </div>
          <div className="ft-bot">
            <span>© 2026 Grow Dental AI. All rights reserved.</span>
            <span>Set more appointments.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
