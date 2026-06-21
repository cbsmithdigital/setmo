import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

type Alerts = {
  lowBalance: { accountId: string; name: string; daysToEmpty: number | null; balanceMin: number }[];
  idle: { accountId: string; name: string; lastActivity: Date | string | null }[];
  topBurners: { accountId: string; name: string; burnPerDay: number }[];
  liability: { total: number; over: boolean; ceiling: number };
  count: number;
};

const usd = (v: number) => `$${Math.round(v).toLocaleString()}`;

export function AlertsCard({ alerts }: { alerts: Alerts }) {
  return (
    <div className="card card-pad rise" style={{ marginBottom: 18, background: alerts.count > 0 ? "linear-gradient(150deg,rgba(251,191,36,.12),var(--s2))" : undefined }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
        <h3 style={{ fontSize: 17, display: "flex", alignItems: "center", gap: 8 }}><Icon name="flame" size={15} /> Needs attention</h3>
        <Link className="muted" href="/platform/projections" style={{ fontSize: 13, fontWeight: 600 }}>Projections →</Link>
      </div>
      {alerts.count === 0 && <p className="muted" style={{ fontSize: 13.5, marginTop: 6 }}>All clear — no low balances, idle accounts, or liability over ceiling.</p>}

      <div className="grid g-3" style={{ gap: 16, marginTop: 10 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--amber)", marginBottom: 8 }}>Low balance ({alerts.lowBalance.length})</div>
          {alerts.lowBalance.length === 0 && <p className="muted" style={{ fontSize: 12.5 }}>None.</p>}
          {alerts.lowBalance.slice(0, 4).map((a) => (
            <Link key={a.accountId} href={`/platform/accounts/${a.accountId}`} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5, padding: "3px 0" }}>
              <span style={{ color: "var(--text-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</span>
              <b style={{ color: "var(--amber)" }}>{a.daysToEmpty}d</b>
            </Link>
          ))}
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted)", marginBottom: 8 }}>Idle ({alerts.idle.length})</div>
          {alerts.idle.length === 0 && <p className="muted" style={{ fontSize: 12.5 }}>None.</p>}
          {alerts.idle.slice(0, 4).map((a) => (
            <Link key={a.accountId} href={`/platform/accounts/${a.accountId}`} style={{ display: "block", fontSize: 12.5, padding: "3px 0", color: "var(--text-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</Link>
          ))}
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--mint)", marginBottom: 8 }}>Top burners</div>
          {alerts.topBurners.slice(0, 4).map((a) => (
            <Link key={a.accountId} href={`/platform/accounts/${a.accountId}`} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5, padding: "3px 0" }}>
              <span style={{ color: "var(--text-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</span>
              <b className="mint-text">{a.burnPerDay.toFixed(1)}/d</b>
            </Link>
          ))}
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid var(--line-soft)", fontSize: 12.5 }} className="muted">
            Liability {usd(alerts.liability.total)} {alerts.liability.over ? <span style={{ color: "var(--amber)", fontWeight: 700 }}>· over ceiling</span> : "· ok"}
          </div>
        </div>
      </div>
    </div>
  );
}
