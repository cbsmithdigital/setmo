import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { REF_COOKIE, REF_COOKIE_MAX_AGE, addRefCode, cleanRefCode } from "@/lib/referral-cookie";

// Referral tracking: a partner's link (?ref=CODE) sets this cookie so the visit is
// still credited after the person clicks around the site, or comes back later and
// signs up. The code in the database is first-touch (never overwritten once an
// account is attributed); the cookie carries the last few links a browser arrived
// on, and the newest one that belongs to a real partner wins at sign-up — so a
// rep's own link wins over an older one on the same device, and an unrelated
// site's ?ref= can't erase it.

function refFromUrl(request: NextRequest): string | null {
  const code = cleanRefCode(request.nextUrl.searchParams.get("ref"));
  return code ? addRefCode(request.cookies.get(REF_COOKIE)?.value, code) : null;
}

function withRef(response: NextResponse, value: string | null): NextResponse {
  if (value) {
    response.cookies.set(REF_COOKIE, value, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: REF_COOKIE_MAX_AGE,
    });
  }
  return response;
}

// Next 16 renamed Middleware -> Proxy. This refreshes the Supabase auth session
// on every request and gates app routes behind login.
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const ref = refFromUrl(request);

  // Boot gracefully before keys are configured: skip auth refresh entirely.
  if (!url || !anon) return withRef(NextResponse.next({ request }), ref);

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // IMPORTANT: do not run code between createServerClient and getUser.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthRoute =
    path === "/" || // public marketing/landing page
    path === "/terms" || // public legal pages
    path === "/privacy" ||
    path.startsWith("/signup") || // self-serve account creation
    path.startsWith("/partners") || // public partner application (note: /partner is the gated dashboard)
    path.startsWith("/audit") || // pre-sale Setter Audit (token-cookie gated)
    path === "/login" ||
    path === "/forgot-password" ||
    path === "/activate" ||
    path === "/reset-password" ||
    path.startsWith("/invite") ||
    path.startsWith("/unsubscribe") || // token-signed email unsubscribe (no login)
    path.startsWith("/auth") ||
    // Public read-only shared-recording links (token-gated).
    path.startsWith("/shared") ||
    // API routes enforce their own auth; webhooks must reach the handler.
    path.startsWith("/api");

  // Unauthenticated users hitting an app route -> login.
  if (!user && !isAuthRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    return withRef(NextResponse.redirect(redirectUrl), ref);
  }

  // Set on the FINAL response — Supabase's setAll above replaces `response`.
  return withRef(response, ref);
}

export const config = {
  // Run on all paths except static assets, image optimizer, and the favicon.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|setmo-icon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
