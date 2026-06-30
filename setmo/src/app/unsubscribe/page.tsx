import Image from "next/image";
import { prisma } from "@/lib/db";
import { verifyUnsubscribe } from "@/lib/unsubscribe";
import { UnsubToggle } from "@/components/UnsubToggle";

export const dynamic = "force-dynamic";

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ u?: string; t?: string }> }) {
  const { u = "", t = "" } = await searchParams;
  const valid = verifyUnsubscribe(u, t);
  const user = valid ? await prisma.user.findUnique({ where: { id: u }, select: { digestOptOut: true } }) : null;

  return (
    <>
      <div className="app-bg" />
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 32px", maxWidth: 480, margin: "0 auto", width: "100%", position: "relative", zIndex: 1 }}>
        <div className="sb-logo" style={{ padding: "0 0 30px" }}>
          <Image src="/setmo-icon.png" alt="" width={36} height={36} style={{ objectFit: "contain" }} />
          <span>Set<span style={{ color: "var(--mint)" }}>Mo</span></span>
        </div>
        <h1 style={{ fontSize: 30, marginBottom: 10 }}>Email preferences</h1>
        {!valid || !user ? (
          <p className="muted" style={{ fontSize: 15.5 }}>This unsubscribe link is invalid or has expired. If you keep getting emails you don&apos;t want, reply to one and we&apos;ll sort it out.</p>
        ) : (
          <UnsubToggle u={u} t={t} initialOptOut={user.digestOptOut} />
        )}
      </div>
    </>
  );
}
