import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { REF_COOKIE, REF_COOKIE_MAX_AGE, addRefCode, cleanRefCode } from "@/lib/referral-cookie";
import { IMPERSONATE_COOKIE } from "@/lib/impersonate-cookie";

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

// Presentation decks: a short public link to a self-contained page in /public.
const DECKS: Record<string, string> = {
  "/teamcare": "/setmo-teamcare-presentation.html",
};

// Next 16 renamed Middleware -> Proxy. This refreshes the Supabase auth session
// on every request and gates app routes behind login — except the embedded
// partner call, which has its own rules (embedResponse), and the decks.
export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/embed/")) return embedResponse(request);
  const deck = DECKS[request.nextUrl.pathname.toLowerCase()];
  if (deck) return deckResponse(request, deck);
  const response = await route(request);
  // SetMo's own pages are never shown inside another site's frame (clickjacking).
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("Content-Security-Policy", "frame-ancestors 'self'");
  return response;
}

// A partner's app (e.g. Team Care) shows a practice call in an iframe from a
// one-time launch link: /embed/<token>. Only the sites the partner registered
// may frame it, the page may use the microphone, and no SetMo login is involved
// (the page authenticates with a token it holds in memory — see lib/partner-launch).
async function embedResponse(request: NextRequest) {
  const token = request.nextUrl.pathname.split("/")[2] ?? "";
  let origins: string[] = [];
  try {
    const { embedFrameAncestors } = await import("@/lib/partner-launch");
    origins = await embedFrameAncestors(token);
  } catch {
    origins = [];
  }
  const response = NextResponse.next({ request });
  response.headers.set("Content-Security-Policy", `frame-ancestors ${origins.length ? origins.join(" ") : "'none'"}`);
  response.headers.set("Permissions-Policy", "microphone=(self)");
  // The URL carries the launch token; never pass it on to other sites.
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

// A deck is open to anyone: no login and no session refresh. Like every SetMo
// page it can't be framed by another site, and it stays out of search results.
function deckResponse(request: NextRequest, file: string): NextResponse {
  const response = withRef(NextResponse.rewrite(new URL(file, request.url)), refFromUrl(request));
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("Content-Security-Policy", "frame-ancestors 'self'");
  response.headers.set("X-Robots-Tag", "noindex");
  return response;
}

async function route(request: NextRequest): Promise<NextResponse> {
  // "View as" is look-only: while platform staff are viewing as someone, no
  // request can change anything. Staff tools (/api/platform/*) act as the staff
  // member themselves — including stopping view-as — so they still work.
  const p = request.nextUrl.pathname;
  if (
    request.cookies.get(IMPERSONATE_COOKIE) &&
    p.startsWith("/api/") &&
    !p.startsWith("/api/platform/") &&
    !["GET", "HEAD", "OPTIONS"].includes(request.method)
  ) {
    return NextResponse.json({ error: "View-as is look-only — stop viewing as this person to make changes." }, { status: 403 });
  }

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
    path === "/offline" || // the service worker's no-connection screen
    path === "/install" || // "Get the SetMo app" — sent to people before they've signed in
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
  // Run on all paths except static assets, image optimizer, the favicon, the
  // installable-app files (the browser fetches the manifest without cookies, and
  // the service worker must never be answered with a login redirect), and the
  // BotID challenge path (rewritten to Vercel; a login redirect would break it).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|setmo-icon.png|manifest.webmanifest|sw.js|149e9513-01fa-4fb0-aad4-566afd725d1b|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
