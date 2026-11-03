"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// The Partner API console on a partner's platform page (Super-Admin): the token
// wallet, API keys, where results are sent, which sites may show the call, and
// the webhook event log — for test and live separately.

type Mode = "LIVE" | "TEST";

export type ConsoleMode = {
  mode: Mode;
  wallet: { addedTokens: number; usedTokens: number; balanceTokens: number };
  entries: { id: string; minutes: number; amountCents: number | null; note: string | null; createdAt: string }[];
  keys: { id: string; label: string | null; prefix: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null }[];
  integration: { webhookUrl: string | null; allowedOrigins: string[]; accentColor: string | null; hasSecret: boolean } | null;
  locations: { id: string; externalId: string; name: string; city: string | null; doctorName: string | null; trainees: number; calls: number; tokens: number; lastCall: string | null }[];
  totals: { locations: number; trainees: number; calls: number; calls30: number };
  deliveries: { id: string; type: string; sessionId: string | null; status: string; attempts: number; lastStatus: number | null; lastError: string | null; createdAt: string; deliveredAt: string | null; nextAttemptAt: string | null }[];
};

async function act(partnerId: string, body: object) {
  const res = await fetch(`/api/platform/partners/${partnerId}/integration`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  return { ok: res.ok, ...j } as { ok: boolean; error?: string; key?: string; secret?: string; delivered?: boolean; status?: number | null };
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—");
const DELIVERY_CLS: Record<string, string> = { DELIVERED: "mint", PENDING: "amber", FAILED: "rose", SKIPPED: "" };

export function PartnerApiConsole({ partnerId, partnerName, live, test, canAct }: { partnerId: string; partnerName: string; live: ConsoleMode; test: ConsoleMode; canAct: boolean }) {
  const [mode, setMode] = useState<Mode>(live.keys.length || live.entries.length ? "LIVE" : "TEST");
  const m = mode === "LIVE" ? live : test;
  return (
    <div className="card card-pad">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <h3 style={{ fontSize: 17 }}>Partner API</h3>
        <div style={{ display: "flex", gap: 6 }}>
          {(["TEST", "LIVE"] as Mode[]).map((x) => (
            <button key={x} className={"chip" + (mode === x ? " purple" : "")} onClick={() => setMode(x)}>
              {x === "LIVE" ? "Live" : "Test"}
            </button>
          ))}
        </div>
      </div>
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
        {partnerName}&apos;s app starts SetMo practice calls through the API and shows them in a frame. {mode === "TEST"
          ? "Test mode: test keys, demo locations and free test tokens — nothing here counts as revenue."
          : `Live mode: every call draws ${partnerName}'s token wallet, which SetMo bills ${partnerName} for.`}
      </p>

      <div className="grid g-2" style={{ gap: 16 }}>
        <Wallet partnerId={partnerId} m={m} canAct={canAct} />
        <Keys partnerId={partnerId} m={m} canAct={canAct} />
      </div>
      <div style={{ marginTop: 16 }}>
        <Settings key={mode} partnerId={partnerId} m={m} canAct={canAct} />
      </div>
      <div style={{ marginTop: 16 }}>
        <Locations m={m} />
      </div>
      <div style={{ marginTop: 16 }}>
        <Events partnerId={partnerId} m={m} canAct={canAct} />
      </div>
    </div>
  );
}

function Section({ title, children, sub }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid var(--line-soft)", borderRadius: 14, padding: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 14.5, marginBottom: sub ? 2 : 10 }}>{title}</div>
      {sub && <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>{sub}</p>}
      {children}
    </div>
  );
}

function Wallet({ partnerId, m, canAct }: { partnerId: string; m: ConsoleMode; canAct: boolean }) {
  const router = useRouter();
  const [tokens, setTokens] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const low = m.wallet.balanceTokens < 1000;

  async function add() {
    const t = Math.round(Number(tokens.replace(/,/g, "")));
    if (!t) return setMsg("Enter how many tokens to add (use a minus sign to take some away).");
    const usd = amount.trim() ? Number(amount.replace(/[$,]/g, "")) : null;
    if (usd != null && (!Number.isFinite(usd) || usd < 0)) return setMsg("The amount paid should be a dollar amount.");
    if (!window.confirm(`${t > 0 ? "Add" : "Remove"} ${Math.abs(t).toLocaleString()} ${m.mode === "LIVE" ? "live" : "test"} tokens${usd ? ` ($${usd.toLocaleString()} paid)` : ""}?`)) return;
    setBusy(true);
    setMsg(null);
    const r = await act(partnerId, { action: "wallet.add", mode: m.mode, tokens: t, amountUsd: usd, note: note.trim() || null });
    setBusy(false);
    if (!r.ok) return setMsg(r.error ?? "Couldn't add tokens.");
    setTokens("");
    setAmount("");
    setNote("");
    router.refresh();
  }

  return (
    <Section title="Token wallet" sub="1 token = 6 seconds of practice call (a typical call is ~65 tokens).">
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
        <span style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 28, color: low ? "var(--amber)" : undefined }}>{m.wallet.balanceTokens.toLocaleString()}</span>
        <span className="muted" style={{ fontSize: 13 }}>tokens left</span>
      </div>
      <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
        {m.wallet.addedTokens.toLocaleString()} added · {m.wallet.usedTokens.toLocaleString()} used · {m.totals.calls30} scored calls in 30 days
      </p>
      {canAct && (
        <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input className="input" style={{ flex: "1 1 120px" }} placeholder="Tokens, e.g. 10000" value={tokens} onChange={(e) => setTokens(e.target.value)} inputMode="numeric" />
            {m.mode === "LIVE" && <input className="input" style={{ flex: "1 1 110px" }} placeholder="$ paid (optional)" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input className="input" style={{ flex: "1 1 180px" }} placeholder="Note, e.g. Invoice 1042" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
            <button className="btn btn-primary" onClick={add} disabled={busy} style={{ padding: "8px 14px", fontSize: 13 }}>
              {busy ? "Adding…" : "Add tokens"}
            </button>
          </div>
          {msg && <p style={{ fontSize: 12.5, color: "var(--amber)" }}>{msg}</p>}
        </div>
      )}
      {m.entries.length > 0 && (
        <div style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 8 }}>
          {m.entries.map((e) => (
            <div key={e.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5, padding: "3px 0" }}>
              <span className="muted">
                {when(e.createdAt)}
                {e.note ? ` · ${e.note}` : ""}
              </span>
              <span>
                {e.minutes > 0 ? "+" : ""}
                {(e.minutes * 10).toLocaleString()}
                {e.amountCents ? <span className="muted"> · ${(e.amountCents / 100).toLocaleString()}</span> : null}
              </span>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function Keys({ partnerId, m, canAct }: { partnerId: string; m: ConsoleMode; canAct: boolean }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setMsg(null);
    const r = await act(partnerId, { action: "key.create", mode: m.mode, label: label.trim() || null });
    setBusy(false);
    if (!r.ok || !r.key) return setMsg(r.error ?? "Couldn't create a key.");
    setCreated(r.key);
    setLabel("");
    router.refresh();
  }
  async function revoke(id: string, prefix: string) {
    if (!window.confirm(`Revoke ${prefix}…? Anything still using it stops working right away.`)) return;
    const r = await act(partnerId, { action: "key.revoke", keyId: id });
    if (!r.ok) window.alert(r.error ?? "Couldn't revoke the key.");
    router.refresh();
  }

  const active = m.keys.filter((k) => !k.revokedAt);
  return (
    <Section title="API keys" sub="For the partner's server only — never in a browser or an app.">
      {created && (
        <div style={{ background: "rgba(52,211,153,.08)", border: "1px solid rgba(52,211,153,.3)", borderRadius: 10, padding: 10, marginBottom: 10 }}>
          <p style={{ fontSize: 12.5, marginBottom: 6 }}>Copy this key now — it won&apos;t be shown again. Send it to the partner&apos;s developer privately.</p>
          <code style={{ fontSize: 12, wordBreak: "break-all", display: "block", marginBottom: 6 }}>{created}</code>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => navigator.clipboard?.writeText(created)}>
              Copy
            </button>
            <button className="btn btn-ghost" style={{ padding: "5px 10px", fontSize: 12 }} onClick={() => setCreated(null)}>
              Done
            </button>
          </div>
        </div>
      )}
      {active.length === 0 && <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>No {m.mode === "LIVE" ? "live" : "test"} keys yet.</p>}
      {m.keys.map((k) => (
        <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: "1px solid var(--line-soft)", opacity: k.revokedAt ? 0.5 : 1 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <code style={{ fontSize: 12.5 }}>{k.prefix}…</code>
            {k.label && <span className="muted" style={{ fontSize: 12 }}> · {k.label}</span>}
            <div className="muted" style={{ fontSize: 11.5 }}>
              made {when(k.createdAt)} · {k.revokedAt ? `revoked ${when(k.revokedAt)}` : k.lastUsedAt ? `last used ${when(k.lastUsedAt)}` : "not used yet"}
            </div>
          </div>
          {canAct && !k.revokedAt && (
            <button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => revoke(k.id, k.prefix)}>
              Revoke
            </button>
          )}
        </div>
      ))}
      {canAct && (
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <input className="input" style={{ flex: "1 1 140px" }} placeholder="Label (optional)" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} />
          <button className="btn btn-primary" onClick={create} disabled={busy} style={{ padding: "8px 14px", fontSize: 13 }}>
            {busy ? "Creating…" : `New ${m.mode === "LIVE" ? "live" : "test"} key`}
          </button>
        </div>
      )}
      {msg && <p style={{ fontSize: 12.5, color: "var(--amber)", marginTop: 8 }}>{msg}</p>}
    </Section>
  );
}

function Settings({ partnerId, m, canAct }: { partnerId: string; m: ConsoleMode; canAct: boolean }) {
  const router = useRouter();
  const [url, setUrl] = useState(m.integration?.webhookUrl ?? "");
  const [origins, setOrigins] = useState((m.integration?.allowedOrigins ?? []).join("\n"));
  const [accent, setAccent] = useState(m.integration?.accentColor ?? "");
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    const r = await act(partnerId, {
      action: "settings.update",
      mode: m.mode,
      webhookUrl: url.trim() || null,
      allowedOrigins: origins.split(/[\s,]+/).map((o) => o.trim()).filter(Boolean),
      accentColor: accent.trim() || null,
    });
    setBusy(false);
    setMsg(r.ok ? "Saved." : r.error ?? "Couldn't save.");
    if (r.ok) router.refresh();
  }
  async function secretAction(action: "secret.reveal" | "secret.rotate") {
    if (action === "secret.rotate" && !window.confirm("Make a new webhook secret? Webhooks signed with the old one will stop checking out on the partner's side until they switch.")) return;
    const r = await act(partnerId, { action, mode: m.mode });
    if (!r.ok || !r.secret) return setMsg(r.error ?? "Couldn't get the secret.");
    setSecret(r.secret);
  }

  return (
    <Section title="Results and framing" sub="Where SetMo sends call results, and which of the partner's sites may show the call.">
      <div className="grid g-2" style={{ gap: 12 }}>
        <label style={{ display: "grid", gap: 4, fontSize: 12.5 }}>
          <span className="muted">Webhook URL (https)</span>
          <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.partner.com/setmo/webhooks" disabled={!canAct} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12.5 }}>
          <span className="muted">Accent color for the call screen</span>
          <div style={{ display: "flex", gap: 8 }}>
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(accent) ? accent : "#8b5cf6"} onChange={(e) => setAccent(e.target.value)} disabled={!canAct} style={{ width: 44, height: 38, border: "none", background: "none" }} />
            <input className="input" value={accent} onChange={(e) => setAccent(e.target.value)} placeholder="#2E7D6B (blank = SetMo purple)" disabled={!canAct} />
          </div>
        </label>
      </div>
      <label style={{ display: "grid", gap: 4, fontSize: 12.5, marginTop: 12 }}>
        <span className="muted">Sites allowed to show the call in a frame — one per line{m.mode === "TEST" ? " (test mode also allows http://localhost:3000 and the like)" : ""}</span>
        <textarea className="input" rows={3} value={origins} onChange={(e) => setOrigins(e.target.value)} placeholder="https://app.partner.com" disabled={!canAct} style={{ resize: "vertical" }} />
      </label>
      {canAct && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
          <button className="btn btn-primary" onClick={save} disabled={busy} style={{ padding: "8px 14px", fontSize: 13 }}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button className="btn btn-ghost" onClick={() => secretAction("secret.reveal")} style={{ padding: "8px 14px", fontSize: 13 }}>
            Show webhook secret
          </button>
          <button className="btn btn-ghost" onClick={() => secretAction("secret.rotate")} style={{ padding: "8px 14px", fontSize: 13 }}>
            New secret
          </button>
          {msg && <span style={{ fontSize: 12.5, color: msg === "Saved." ? "var(--mint)" : "var(--amber)" }}>{msg}</span>}
        </div>
      )}
      {secret && (
        <div style={{ marginTop: 10, fontSize: 12.5 }}>
          <span className="muted">Webhook signing secret: </span>
          <code style={{ wordBreak: "break-all" }}>{secret}</code>{" "}
          <button className="btn btn-ghost" style={{ padding: "3px 8px", fontSize: 11.5 }} onClick={() => setSecret(null)}>
            Hide
          </button>
        </div>
      )}
    </Section>
  );
}

function Locations({ m }: { m: ConsoleMode }) {
  return (
    <Section title={`Locations (${m.totals.locations})`} sub={`${m.totals.trainees} trainees · ${m.totals.calls} scored calls. Created by the partner's app; they don't pay SetMo directly.`}>
      {m.locations.length === 0 && <p className="muted" style={{ fontSize: 13 }}>None yet — they appear when the partner&apos;s app sends its first location.</p>}
      {m.locations.map((l, i) => (
        <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 2px", borderTop: i ? "1px solid var(--line-soft)" : "none", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <a href={`/platform/accounts/${l.id}`} style={{ fontWeight: 600, fontSize: 13.5 }}>{l.name}</a>
            <div className="muted" style={{ fontSize: 11.5 }}>
              id {l.externalId}
              {l.city ? ` · ${l.city}` : ""}
              {l.doctorName ? ` · ${l.doctorName}` : ""}
            </div>
          </div>
          <span className="muted" style={{ fontSize: 12.5 }}>{l.trainees} trainees</span>
          <span className="muted" style={{ fontSize: 12.5 }}>{l.calls} calls</span>
          <span className="muted" style={{ fontSize: 12.5 }}>{l.tokens.toLocaleString()} tokens</span>
          <span className="muted" style={{ fontSize: 12, width: 110, textAlign: "right" }}>{l.lastCall ? `last ${when(l.lastCall)}` : "no calls yet"}</span>
        </div>
      ))}
    </Section>
  );
}

function Events({ partnerId, m, canAct }: { partnerId: string; m: ConsoleMode; canAct: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  async function resend(id: string) {
    setBusy(id);
    const r = await act(partnerId, { action: "delivery.resend", deliveryId: id });
    setBusy(null);
    if (!r.ok) window.alert(r.error ?? "Couldn't re-send.");
    else if (!r.delivered) window.alert(`Sent, but the partner's server didn't accept it${r.status ? ` (HTTP ${r.status})` : ""}.`);
    router.refresh();
  }
  return (
    <Section title="Webhook events" sub="The last 25 events SetMo sent (or tried to send). Failed ones retry automatically for about a day.">
      {m.deliveries.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No events yet.</p>}
      {m.deliveries.map((d, i) => (
        <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 2px", borderTop: i ? "1px solid var(--line-soft)" : "none", flexWrap: "wrap", fontSize: 12.5 }}>
          <span className={"chip " + (DELIVERY_CLS[d.status] ?? "")} style={{ padding: "2px 8px", fontSize: 11 }}>{d.status.toLowerCase()}</span>
          <code style={{ fontSize: 12 }}>{d.type}</code>
          <span className="muted" style={{ flex: 1, minWidth: 160 }}>
            {when(d.createdAt)} · {d.attempts} {d.attempts === 1 ? "try" : "tries"}
            {d.lastStatus ? ` · HTTP ${d.lastStatus}` : ""}
            {d.lastError && d.status !== "DELIVERED" ? ` · ${d.lastError}` : ""}
            {d.status === "PENDING" && d.nextAttemptAt ? ` · next ${when(d.nextAttemptAt)}` : ""}
          </span>
          {canAct && (
            <button className="btn btn-ghost" style={{ padding: "3px 9px", fontSize: 11.5 }} onClick={() => resend(d.id)} disabled={busy === d.id}>
              {busy === d.id ? "Sending…" : "Re-send"}
            </button>
          )}
        </div>
      ))}
    </Section>
  );
}
