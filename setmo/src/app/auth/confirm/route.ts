import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// /auth/confirm — completes an email link (invite / magic link / recovery).
//
// Our emailed links carry a one-time `token_hash`. Opening one only shows a
// Continue page (/auth/continue): the token is spent when the person presses
// Continue (a POST back here). Email security scanners (Microsoft Safe Links
// and the like) open links before people do, and verifying on that first GET
// left the real person with "link expired". A Supabase PKCE `code` can't be
// spent by a scanner (it needs this browser's verifier cookie), so it still
// completes on GET.

const OTP_TYPES: EmailOtpType[] = ["invite", "recovery", "magiclink", "signup", "email", "email_change"];

/** Only paths on this site — never another origin (an open redirect). */
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  if (tokenHash && type) {
    const params = new URLSearchParams({ token_hash: tokenHash, type, next });
    return NextResponse.redirect(new URL(`/auth/continue?${params}`, url.origin));
  }

  let ok = false;
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }
  return NextResponse.redirect(new URL(ok ? next : "/login?error=link_expired", url.origin));
}

// POST /auth/confirm — the Continue button: verify the token and sign them in.
export async function POST(request: Request) {
  const url = new URL(request.url);
  const form = await request.formData().catch(() => null);
  const tokenHash = String(form?.get("token_hash") ?? "");
  const type = String(form?.get("type") ?? "") as EmailOtpType;
  const next = safeNext(String(form?.get("next") ?? "/"));

  let ok = false;
  if (tokenHash && OTP_TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
  }
  // 303 so the browser follows with a GET.
  return NextResponse.redirect(new URL(ok ? next : "/login?error=link_expired", url.origin), 303);
}
