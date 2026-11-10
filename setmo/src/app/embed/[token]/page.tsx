import type { Metadata, Viewport } from "next";
import { prisma } from "@/lib/db";
import { openLaunch, embedLaunchLook } from "@/lib/partner-launch";
import { embedThemeCss, embedViewport } from "@/lib/embed-theme";
import { SERVICE_META } from "@/lib/service-meta";
import { EmbedCall, EmbedNotice } from "@/components/embed/EmbedCall";
import type { ServiceKey } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Practice call — SetMo",
  robots: { index: false, follow: false },
};

// The partner's background decides the page's color scheme (light or dark) and
// the browser's theme color. Set here, in the document head, so a frame on a
// light page is never painted black while the page loads.
export async function generateViewport({ params }: { params: Promise<{ token: string }> }): Promise<Viewport> {
  const { token } = await params;
  return embedViewport(await embedLaunchLook(token));
}

const NOTICE = {
  used: { title: "This link was already opened", body: "Each practice-call link opens once. Go back and start the call again to get a fresh one." },
  expired: { title: "This link has expired", body: "Practice-call links last a few minutes. Go back and start the call again to get a fresh one." },
  invalid: { title: "This link isn't valid", body: "Go back and start the call again." },
} as const;

// A practice call shown inside a partner's app (Team Care). The one-time launch
// link is used here; the page then works from a token it keeps in memory. The
// sites allowed to frame it are set in proxy.ts; its colors in lib/embed-theme.
export default async function EmbedPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // The look first (it doesn't use the link), so every state below matches.
  const css = embedThemeCss(await embedLaunchLook(token));
  const theme = css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null;

  const opened = await openLaunch(token);
  if (!opened.ok) {
    return (
      <>
        {theme}
        <EmbedNotice {...NOTICE[opened.reason]} />
      </>
    );
  }
  const { launch } = opened;
  const session = await prisma.session.findUnique({ where: { id: launch.sessionId }, select: { serviceType: true } });
  if (!session) {
    return (
      <>
        {theme}
        <EmbedNotice {...NOTICE.invalid} />
      </>
    );
  }
  return (
    <>
      {theme}
      <EmbedCall
        sessionId={launch.sessionId}
        frameToken={launch.frameToken}
        serviceLabel={SERVICE_META[session.serviceType as ServiceKey].name}
        origins={launch.allowedOrigins}
      />
    </>
  );
}
