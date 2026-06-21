import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getPlatformAccounts } from "@/lib/platform";
import { relativeShort } from "@/lib/format";

const usd = (v: number) => `$${Math.round(v).toLocaleString()}`;

export default async function PlatformAccountsPage() {
  await requireRole("PLATFORM_ADMIN", "SUPPORT");
  const accounts = await getPlatformAccounts();
  const cols = "2fr 1.1fr 0.8fr 1fr 1fr 1fr 0.8fr 24px";

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Accounts</h1>
          <p>{accounts.length} accounts · {accounts.reduce((a, x) => a + x.locations, 0)} locations</p>
        </div>
      </div>

      <div className="content">
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
                <div><span className="chip" style={{ padding: "2px 9px", fontSize: 11 }}>{a.type}</span></div>
                <div style={{ fontSize: 14 }}>{a.activeAccess}/{a.locations}</div>
                <div className="mint-text" style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 15 }}>{usd(a.mrr)}</div>
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
