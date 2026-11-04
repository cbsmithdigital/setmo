import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getPlatformAccounts } from "@/lib/platform";
import { relativeShort } from "@/lib/format";
import { prisma } from "@/lib/db";
import { NewAccount } from "@/components/platform/NewAccount";

const DAY = 86_400_000;
/** "Trial · 9d left" / "Trial ended" while an account set up with a free trial hasn't activated. */
function trialChip(endsAt: Date | null, allActive: boolean): { label: string; cls: string } | null {
  if (!endsAt || allActive) return null;
  const ms = endsAt.getTime() - Date.now();
  return ms > 0 ? { label: `Trial · ${Math.ceil(ms / DAY)}d left`, cls: "mint" } : { label: "Trial ended", cls: "amber" };
}

const usd = (v: number) => `$${Math.round(v).toLocaleString()}`;

export default async function PlatformAccountsPage() {
  await requireRole("PLATFORM_ADMIN", "SUPPORT");
  const [accounts, partners] = await Promise.all([
    getPlatformAccounts(),
    prisma.partner.findMany({ where: { status: "APPROVED" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const cols = "2fr 1.1fr 0.8fr 1fr 1fr 1fr 0.8fr 24px";
  // Demo / test accounts are listed (to manage and top up) but never counted.
  const real = accounts.filter((a) => !a.isDemo);
  const demoCount = accounts.length - real.length;

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Accounts</h1>
          <p>
            {real.length} accounts · {real.reduce((a, x) => a + x.locations, 0)} locations
            {demoCount > 0 ? ` · ${demoCount} demo` : ""}
          </p>
        </div>
      </div>

      <div className="content">
        <NewAccount partners={partners} />
        <div className="card rise" style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 860 }}>
            <div style={{ display: "grid", gridTemplateColumns: cols, gap: 14, padding: "14px 20px", borderBottom: "1px solid var(--line)", fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted)" }}>
              <div>Account</div><div>Type</div><div>Locations</div><div>MRR</div><div>Balance</div><div>Lifetime cash</div><div>Days left</div><div />
            </div>
            {accounts.length === 0 && <div className="card-pad muted" style={{ fontSize: 14 }}>No accounts yet.</div>}
            {accounts.map((a, i) => (
              <Link key={a.id} href={`/platform/accounts/${a.id}`} style={{ display: "grid", gridTemplateColumns: cols, gap: 14, alignItems: "center", padding: "14px 20px", borderTop: i ? "1px solid var(--line-soft)" : "none" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</div>
                  <div className="muted" style={{ fontSize: 12 }}>Active {relativeShort(a.lastActivity)}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span className="chip" style={{ padding: "2px 9px", fontSize: 11 }}>{a.type}</span>
                  {a.isDemo && <span className="chip purple" style={{ padding: "2px 9px", fontSize: 11 }}>Demo</span>}
                  {(() => {
                    const t = trialChip(a.trialEndsAt, a.locations > 0 && a.activeAccess === a.locations);
                    return t ? <span className={"chip " + t.cls} style={{ padding: "2px 9px", fontSize: 11 }}>{t.label}</span> : null;
                  })()}
                </div>
                <div style={{ fontSize: 14 }}>{a.activeAccess}/{a.locations}</div>
                <div className="mint-text" style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 15 }}>{a.isDemo ? <span className="muted" style={{ fontWeight: 400 }}>—</span> : usd(a.mrr)}</div>
                <div style={{ fontSize: 14, color: a.balanceMin < 0 ? "var(--amber)" : "var(--text-1)" }}>{a.balanceMin.toLocaleString()} min</div>
                <div style={{ fontSize: 14 }}>{usd(a.cashLifetime)}</div>
                <div style={{ fontSize: 14, color: a.daysToEmpty != null && a.daysToEmpty < 14 ? "var(--amber)" : "var(--muted)" }}>{a.daysToEmpty != null ? `${a.daysToEmpty}d` : "—"}</div>
                <div style={{ color: "var(--muted)" }}>›</div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
