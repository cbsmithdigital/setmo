import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Next 16 renamed Middleware -> Proxy. This refreshes the Supabase auth session
// on every request and gates app routes behind login.
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Boot gracefully before keys are configured: skip auth refresh entirely.
  if (!url || !anon) return NextResponse.next({ request });

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
    path === "/login" ||
    path.startsWith("/invite") ||
    path.startsWith("/auth") ||
    // Public read-only shared-recording links (token-gated).
    path.startsWith("/shared") ||
    // API routes enforce their own auth; webhooks must reach the handler.
    path.startsWith("/api");

  // Unauthenticated users hitting an app route -> login.
  if (!user && !isAuthRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  // Run on all paths except static assets, image optimizer, and the favicon.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|setmo-icon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
