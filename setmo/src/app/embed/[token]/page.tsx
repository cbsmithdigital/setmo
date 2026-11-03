import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { openLaunch } from "@/lib/partner-launch";
import { SERVICE_META } from "@/lib/service-meta";
import { EmbedCall, EmbedNotice } from "@/components/embed/EmbedCall";
import type { ServiceKey } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Practice call — SetMo",
  robots: { index: false, follow: false },
};

const NOTICE = {
  used: { title: "This link was already opened", body: "Each practice-call link opens once. Go back and start the call again to get a fresh one." },
  expired: { title: "This link has expired", body: "Practice-call links last a few minutes. Go back and start the call again to get a fresh one." },
  invalid: { title: "This link isn't valid", body: "Go back and start the call again." },
} as const;

// A practice call shown inside a partner's app (Team Care). The one-time launch
// link is used here; the page then works from a token it keeps in memory. The
// sites allowed to frame it are set in proxy.ts.
export default async function EmbedPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const opened = await openLaunch(token);
  if (!opened.ok) return <EmbedNotice {...NOTICE[opened.reason]} />;
  const { launch } = opened;
  const session = await prisma.session.findUnique({ where: { id: launch.sessionId }, select: { serviceType: true } });
  if (!session) return <EmbedNotice {...NOTICE.invalid} />;
  return (
    <EmbedCall
      sessionId={launch.sessionId}
      frameToken={launch.frameToken}
      serviceLabel={SERVICE_META[session.serviceType as ServiceKey].name}
      accent={launch.accentColor}
      origins={launch.allowedOrigins}
    />
  );
}
