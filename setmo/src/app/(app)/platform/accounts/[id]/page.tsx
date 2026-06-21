import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getPlatformAccountDetail } from "@/lib/platform";
import { StatTile } from "@/components/ui/StatTile";
import { LocationActions, UserActions } from "@/components/platform/AdminActions";
import { relativeShort } from "@/lib/format";

const usd = (v: number) => `$${Math.round(v).toLocaleString()}`;

export default async function PlatformAccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("PLATFORM_ADMIN", "SUPPORT");
  const { id } = await params;
  const a = await getPlatformAccountDetail(id);
  if (!a) notFound();

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <Link className="btn btn-ghost" href="/platform/accounts" style={{ marginBottom: 12, padding: "7px 14px", fontSize: 13.5 }}>← Accounts</Link>
          <h1>{a.name}</h1>
          <p>{a.kind === "group" ? "Group / DSO" : "Single practice"} · {a.locations.length} location{a.locations.length === 1 ? "" : "s"} · {a.users.length} users</p>
        </div>
      </div>

      <div className="content">
        <div className="grid g-4 rise" style={{ marginBottom: 18 }}>
          <StatTile lab="Access MRR" val={usd(a.mrr)} grad="var(--grad-mint)" sub="active locations × $44.95" />
          <StatTile lab="Minute balance" val={`${a.balanceMin.toLocaleString()}`} sub="minutes remaining" />
          <StatTile lab="Lifetime cash" val={usd(a.cashLifetime)} sub="minutes purchased" />
          <StatTile lab="Users" val={String(a.users.length)} sub="all free" />
        </div>

        {/* locations */}
        <div className="card card-pad rise" style={{ marginBottom: 18 }}>
          <h3 style={{ fontSize: 18, marginBottom: 10 }}>Locations</h3>
          {a.locations.map((l, i) => (
            <div key={l.id} style={{ display: "grid", gridTemplateColumns: "1.6fr 0.9fr 1fr 0.9fr 1.4fr", gap: 12, alignItems: "center", padding: "11px 4px", borderTop: i ? "1px solid var(--line-soft)" : "none" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{l.name}</div>
                <div className="muted" style={{ fontSize: 12 }}>{l.city ?? "—"} · active {relativeShort(l.lastActivity)}</div>
              </div>
              <div><span className={"chip " + (l.accessActive ? "mint" : "amber")} style={{ padding: "2px 9px", fontSize: 11 }}>{l.accessActive ? "Access on" : "Inactive"}</span></div>
              <div style={{ fontSize: 13.5, color: l.balanceMin < 0 ? "var(--amber)" : "var(--text-1)" }}>{l.balanceMin.toLocaleString()} min · {l.daysToEmpty != null ? `${l.daysToEmpty}d` : "—"}</div>
              <div className="muted" style={{ fontSize: 13 }}>{l.burnPerDay.toFixed(1)}/day</div>
              <LocationActions officeId={l.id} accessActive={l.accessActive} />
            </div>
          ))}
        </div>

        <div className="grid g-2">
          {/* users */}
          <div className="card card-pad rise">
            <h3 style={{ fontSize: 18, marginBottom: 10 }}>Users</h3>
            {a.users.length === 0 && <p className="muted" style={{ fontSize: 14 }}>No users yet.</p>}
            {a.users.slice(0, 25).map((u, i) => (
              <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 4px", borderTop: i ? "1px solid var(--line-soft)" : "none", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{u.name || u.email}{u.status === "DISABLED" && <span className="muted" style={{ fontSize: 11, fontWeight: 400 }}> · disabled</span>}</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>{u.email} · {u.location}</div>
                </div>
                <UserActions userId={u.id} status={u.status} role={u.role} />
              </div>
            ))}
          </div>

          {/* transactions */}
          <div className="card card-pad rise" style={{ animationDelay: ".05s" }}>
            <h3 style={{ fontSize: 18, marginBottom: 10 }}>Recent minute purchases</h3>
            {a.transactions.length === 0 && <p className="muted" style={{ fontSize: 14 }}>No purchases yet.</p>}
            {a.transactions.map((t, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 4px", borderTop: i ? "1px solid var(--line-soft)" : "none" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{t.minutes.toLocaleString()} minutes</div>
                  <div className="muted" style={{ fontSize: 11.5 }}>{t.location} · {new Date(t.when).toLocaleDateString()}</div>
                </div>
                <span className="mint-text" style={{ fontFamily: "var(--font-lato)", fontWeight: 800, fontSize: 14 }}>{usd(t.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
