"use client";

// Right after a checkout, Billing re-reads itself every few seconds. If one of
// those reads fails (a blip on the server, say), show a plain message and a retry
// instead of Next's bare error screen. Server errors are already logged, and
// sent to Sentry by instrumentation.ts.
export default function BillingError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Usage &amp; billing</h1>
        </div>
      </div>
      <div className="content">
        <div className="card card-pad" role="alert" style={{ maxWidth: 560 }}>
          <h3 style={{ fontSize: 18, marginBottom: 6 }}>We couldn&apos;t load Billing just now</h3>
          <p className="muted" style={{ fontSize: 13.5, marginBottom: 14 }}>
            Your access and tokens aren&apos;t affected — this page just didn&apos;t load. Try again in a moment, or email{" "}
            <a href="mailto:hello@growdental.ai?subject=SetMo%20billing" style={{ color: "var(--purple)" }}>hello@growdental.ai</a>.
          </p>
          <button className="btn btn-primary" onClick={() => unstable_retry()}>
            Try again
          </button>
        </div>
      </div>
    </>
  );
}
