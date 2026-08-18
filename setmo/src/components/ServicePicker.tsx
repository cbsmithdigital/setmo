"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";

type ServiceOption = {
  key: string;
  name: string;
  desc: string;
  value: string;
  skills: number;
  live: boolean;
};

const DIFFICULTIES: [string, string, string][] = [
  ["ADAPTIVE", "Adaptive", "Tunes to your level"],
  ["WARM", "Warm lead", "Easier — friendly"],
  ["TOUGH", "Tough lead", "Guarded & skeptical"],
];

// A call-center AGENT picks which served office (account) they're calling for;
// the session is created for that office and metered to the call-center pool.
type Account = { officeId: string; officeName: string; services: ServiceOption[] };

export function ServicePicker({ services = [], accounts }: { services?: ServiceOption[]; accounts?: Account[] }) {
  const router = useRouter();
  const isAgent = Boolean(accounts && accounts.length);
  const [officeId, setOfficeId] = useState(accounts?.[0]?.officeId ?? "");
  const svc = isAgent ? (accounts!.find((a) => a.officeId === officeId)?.services ?? []) : services;
  const firstLive = svc.find((s) => s.live)?.key ?? svc[0]?.key ?? "IMPLANT";
  const [sel, setSel] = useState(firstLive);
  const [diff, setDiff] = useState("ADAPTIVE");
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const chosen = svc.find((s) => s.key === sel) ?? svc.find((s) => s.live);

  async function start() {
    setErr(null);
    setStarting(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ serviceType: chosen?.key ?? sel, difficulty: diff, ...(isAgent ? { officeId } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "Couldn't start a session.");
        setStarting(false);
        return;
      }
      router.push(`/session/${data.sessionId}`);
    } catch {
      setErr("Couldn't start a session. Try again.");
      setStarting(false);
    }
  }

  return (
    <div className="content">
      {err && (
        <div className="banner error" style={{ marginBottom: 18 }}>
          {err}
        </div>
      )}

      {isAgent && (
        <>
          <div className="eyebrow" style={{ marginBottom: 14 }}>1 · Choose the account you&apos;re calling for</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 30 }}>
            {accounts!.map((a) => {
              const active = a.officeId === officeId;
              return (
                <button
                  key={a.officeId}
                  onClick={() => { setOfficeId(a.officeId); const fl = a.services.find((s) => s.live)?.key; if (fl) setSel(fl); }}
                  className="card card-pad"
                  style={{ padding: "12px 16px", textAlign: "left", borderColor: active ? "var(--purple)" : "var(--line)", boxShadow: active ? "0 0 0 1px var(--purple)" : "var(--shadow-card)" }}
                >
                  <div style={{ fontWeight: 700, fontSize: 14.5, display: "flex", alignItems: "center", gap: 7 }}>
                    {active && <span style={{ width: 7, height: 7, borderRadius: 9, background: "var(--purple-2)" }} />}
                    {a.officeName}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="eyebrow" style={{ marginBottom: 14 }}>
        {isAgent ? "2 · Choose a call type" : "1 · Choose a call type"}
      </div>
      <div className="grid g-3" style={{ marginBottom: 30 }}>
        {svc.map((s) => {
          const active = sel === s.key;
          return (
            <button
              key={s.key}
              disabled={!s.live}
              onClick={() => s.live && setSel(s.key)}
              className={"card card-pad" + (active ? " card-glow" : "")}
              style={{
                textAlign: "left",
                cursor: s.live ? "pointer" : "not-allowed",
                opacity: s.live ? 1 : 0.5,
                borderColor: active ? "var(--purple)" : "var(--line)",
                boxShadow: active
                  ? "0 0 0 1px var(--purple), 0 18px 40px -24px rgba(124,58,237,.6)"
                  : "var(--shadow-card)",
                transition: "border-color .2s, box-shadow .2s, transform .2s",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                <div
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 13,
                    background: "var(--s3)",
                    display: "grid",
                    placeItems: "center",
                    color: "var(--purple-2)",
                    flex: "none",
                  }}
                >
                  <Icon name="target" size={22} />
                </div>
                {s.live ? (
                  <span className="chip mint" style={{ padding: "3px 9px" }}>
                    Live
                  </span>
                ) : (
                  <span className="chip" style={{ padding: "3px 9px" }}>
                    Soon
                  </span>
                )}
              </div>
              <div style={{ fontWeight: 700, fontSize: 16.5, marginBottom: 5 }}>{s.name}</div>
              <p className="muted" style={{ fontSize: 13.5, marginBottom: 14, minHeight: 38 }}>
                {s.desc}
              </p>
              <div style={{ display: "flex", gap: 16, fontSize: 12.5 }} className="muted">
                <span>
                  <b style={{ color: "var(--text-2)" }}>{s.skills}</b> skills
                </span>
                <span>
                  <b style={{ color: "var(--text-2)" }}>{s.value}</b> case value
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="eyebrow" style={{ marginBottom: 14 }}>
        {isAgent ? "3 · Set the challenge" : "2 · Set the challenge"}
      </div>
      <div className="card card-pad" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {DIFFICULTIES.map(([k, t, d]) => {
            const active = diff === k;
            return (
              <button
                key={k}
                onClick={() => setDiff(k)}
                style={{
                  padding: "14px 18px",
                  borderRadius: 12,
                  textAlign: "left",
                  border: "1px solid " + (active ? "var(--purple)" : "var(--line)"),
                  background: active ? "rgba(139,92,246,.12)" : "var(--s1)",
                  transition: "all .2s",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 14.5, display: "flex", alignItems: "center", gap: 7 }}>
                  {active && <span style={{ width: 7, height: 7, borderRadius: 9, background: "var(--purple-2)" }} />}
                  {t}
                </div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
                  {d}
                </div>
              </button>
            );
          })}
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
            Practicing <b style={{ color: "var(--text-2)" }}>{chosen?.name}</b>
            {isAgent ? <> for <b style={{ color: "var(--text-2)" }}>{accounts!.find((a) => a.officeId === officeId)?.officeName}</b> · draws the call-center pool</> : <> · ~8 min · draws from your pool</>}
          </div>
          <button className="btn btn-primary btn-lg" onClick={start} disabled={starting || !chosen?.live}>
            <Icon name="mic" /> {starting ? "Starting…" : "Start call"}
          </button>
        </div>
      </div>
    </div>
  );
}
