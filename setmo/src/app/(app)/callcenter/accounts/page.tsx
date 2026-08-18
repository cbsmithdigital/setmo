import { requireRole } from "@/lib/auth";
import { getPodAccounts } from "@/lib/callcenter";
import { Icon } from "@/components/ui/Icon";

function scoreChip(v: number) {
  const cls = v >= 4.3 ? "mint" : v < 3.7 ? "amber" : "";
  return <span className={"chip " + cls} style={{ padding: "2px 9px", fontFamily: "var(--font-lato)", fontWeight: 800 }}>{v ? v.toFixed(1) : "—"}</span>;
}

function Detail({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <div className="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13.5, lineHeight: 1.45 }}>{value}</div>
    </div>
  );
}

// Read-only "Accounts" view for a floor manager: each served practice's offer +
// the services agents train on + per-account stats. The practice owns its
// catalog; this is view-only context for coaching.
export default async function PodAccountsPage() {
  const user = await requireRole("CALL_CENTER_MANAGER", "CALL_CENTER_ADMIN");

  if (!user.callCenterPodId) {
    return (
      <>
        <div className="topbar"><div className="tb-greet"><h1>Accounts</h1></div></div>
        <div className="content"><div className="card card-pad muted" style={{ fontSize: 14 }}>Served offices are listed on your Overview at the center level.</div></div>
      </>
    );
  }

  const accounts = await getPodAccounts(user.callCenterPodId);

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Accounts</h1>
          <p>The practices your pod calls for — their offer and what your agents train on.</p>
        </div>
        <div className="tb-right"><span className="chip"><Icon name="shield" size={13} /> Read-only</span></div>
      </div>

      <div className="content">
        {accounts.length === 0 ? (
          <div className="card card-pad muted" style={{ fontSize: 14 }}>No served practices assigned to your pod yet.</div>
        ) : (
          <div className="grid g-2" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))" }}>
            {accounts.map((a) => (
              <div key={a.id} className="card card-pad rise">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div>
                    <h3 style={{ fontSize: 17, marginBottom: 2 }}>{a.name}</h3>
                    <div className="muted" style={{ fontSize: 12.5 }}>{a.city ? `${a.city} · ` : ""}{a.agents} agent{a.agents === 1 ? "" : "s"} · {a.sessions} reps</div>
                  </div>
                  {scoreChip(a.avg)}
                </div>

                <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {a.services.length === 0 && <span className="muted" style={{ fontSize: 12.5 }}>No services enabled.</span>}
                  {a.services.map((s) => (
                    <span key={s.key} className={"chip " + (s.live ? "" : "amber")} style={{ fontSize: 11.5 }}>
                      {s.name}{s.live ? "" : " · soon"}
                    </span>
                  ))}
                </div>

                <Detail label="Offer / voucher framing" value={a.offerFraming} />
                <Detail label="Appointment framing" value={a.appointmentFraming} />
                <Detail label="Deposit policy" value={a.depositPolicy} />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
