import Image from "next/image";
import Link from "next/link";
import { AuditIntake } from "@/components/audit/AuditIntake";
import "../marketing.css";

export const metadata = { title: "Free Setter Audit — SetMo" };

export default function AuditIntakePage() {
  return (
    <div className="mkt">
      <header className="nav">
        <div className="wrap nav-inner">
          <Link className="logo" href="/">
            <Image className="lm" src="/setmo-icon.png" alt="" width={36} height={36} />
            <span>Set<span className="mo">Mo</span></span>
          </Link>
          <div className="nav-cta">
            <Link className="signin" href="/login">Sign in</Link>
          </div>
        </div>
      </header>

      <div className="audit-shell">
        <div className="sec-head" style={{ marginBottom: 24 }}>
          <span className="eyebrow">Free Setter Audit</span>
          <h2 style={{ fontSize: 34, margin: "12px 0 12px" }}>See what your front desk is leaving on the table.</h2>
          <p style={{ fontSize: 16 }}>Run 5 quick practice calls, scored on the same 8-point rubric your team would train against. We&apos;ll show you exactly where booked consults are slipping — and what recovering them is worth. <b style={{ color: "var(--ink-soft)" }}>First audit free, one per practice.</b></p>
        </div>
        <AuditIntake />
      </div>
    </div>
  );
}
