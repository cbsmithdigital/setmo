import Image from "next/image";
import Link from "next/link";

// The page an emailed link opens. Pressing Continue spends the one-time token
// (a POST to /auth/confirm); just opening the page doesn't, so an email
// scanner that opens the link first can't use it up.

const COPY: Record<string, { title: string; body: string; button: string }> = {
  invite: { title: "You're invited to SetMo", body: "Continue to set up your account and join your team.", button: "Set up my account" },
  recovery: { title: "Reset your password", body: "Continue to choose a new password.", button: "Continue" },
  magiclink: { title: "Sign in to SetMo", body: "Continue to sign in.", button: "Sign in" },
};

export default async function AuthContinuePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { token_hash: tokenHash, type, next } = await searchParams;
  const copy = COPY[type ?? ""] ?? { title: "Continue to SetMo", body: "Continue to finish signing in.", button: "Continue" };

  return (
    <>
      <div className="app-bg" />
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 32px", maxWidth: 480, margin: "0 auto", width: "100%", position: "relative", zIndex: 1 }}>
        <div className="sb-logo" style={{ padding: "0 0 30px" }}>
          <Image src="/setmo-icon.png" alt="" width={36} height={36} style={{ objectFit: "contain" }} />
          <span>Set<span style={{ color: "var(--mint)" }}>Mo</span></span>
        </div>
        {tokenHash && type ? (
          <>
            <h1 style={{ fontSize: 30, marginBottom: 10 }}>{copy.title}</h1>
            <p className="muted" style={{ fontSize: 15.5, marginBottom: 24 }}>{copy.body}</p>
            <form method="post" action="/auth/confirm">
              <input type="hidden" name="token_hash" value={tokenHash} />
              <input type="hidden" name="type" value={type} />
              <input type="hidden" name="next" value={next ?? "/"} />
              <button className="btn btn-primary btn-lg btn-block" type="submit">{copy.button}</button>
            </form>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 30, marginBottom: 10 }}>This link isn&apos;t complete</h1>
            <p className="muted" style={{ fontSize: 15.5, marginBottom: 24 }}>Open the link from your email again, or ask for a new one.</p>
            <Link className="btn btn-ghost" href="/activate">Get a new setup link</Link>
          </>
        )}
      </div>
    </>
  );
}
