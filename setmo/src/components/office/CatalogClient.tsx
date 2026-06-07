"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { Toggle } from "@/components/ui/Toggle";

type Service = { key: string; name: string; desc: string; live: boolean; enabled: boolean };
type Profile = {
  name: string;
  city: string;
  offerFraming: string;
  appointmentFraming: string;
  depositPolicy: string;
};

export function CatalogClient({
  services: initialServices,
  profile: initialProfile,
}: {
  services: Service[];
  profile: Profile;
}) {
  const router = useRouter();
  const [services, setServices] = useState(initialServices);
  const [profile, setProfile] = useState(initialProfile);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggle(key: string) {
    setSaved(false);
    setServices((s) => s.map((x) => (x.key === key && x.live ? { ...x, enabled: !x.enabled } : x)));
  }
  function setField(field: keyof Profile, value: string) {
    setSaved(false);
    setProfile((p) => ({ ...p, [field]: value }));
  }

  async function save() {
    setErr(null);
    setSaving(true);
    try {
      const res = await fetch("/api/office/catalog", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profile,
          services: Object.fromEntries(services.map((s) => [s.key, s.enabled])),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error ?? "Couldn't save changes.");
        setSaving(false);
        return;
      }
      setSaved(true);
      setSaving(false);
      router.refresh();
    } catch {
      setErr("Couldn't save changes. Try again.");
      setSaving(false);
    }
  }

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Service catalog</h1>
          <p>Choose what your practice offers, and the details your AI lead uses in role-play.</p>
        </div>
        <div className="tb-right" style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {saved && (
            <span className="chip mint">
              <Icon name="check" size={13} /> Saved
            </span>
          )}
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            <Icon name="check" size={17} /> {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      <div className="content">
        {err && <div className="banner error" style={{ marginBottom: 18 }}>{err}</div>}

        <div className="grid g-2" style={{ gridTemplateColumns: "1.1fr 1fr", alignItems: "start" }}>
          <div className="card card-pad rise">
            <h3 style={{ fontSize: 18, marginBottom: 4 }}>Services offered</h3>
            <p className="muted" style={{ fontSize: 13.5, marginBottom: 18 }}>
              This gates which call types your setters can train on, and what the agent offers the lead.
            </p>
            {services.map((s, i) => (
              <div
                key={s.key}
                style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 0", borderTop: i ? "1px solid var(--line-soft)" : "none" }}
              >
                <div style={{ width: 38, height: 38, borderRadius: 11, background: "var(--s3)", display: "grid", placeItems: "center", color: "var(--purple-2)", flex: "none" }}>
                  <Icon name="target" size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14.5, display: "flex", alignItems: "center", gap: 8 }}>
                    {s.name}
                    {!s.live && (
                      <span className="chip" style={{ padding: "1px 8px", fontSize: 10.5 }}>
                        Agent soon
                      </span>
                    )}
                  </div>
                  <div className="muted" style={{ fontSize: 12.5 }}>{s.desc}</div>
                </div>
                <Toggle on={s.enabled} disabled={!s.live} onClick={() => toggle(s.key)} />
              </div>
            ))}
          </div>

          <div className="card card-pad rise" style={{ animationDelay: ".07s" }}>
            <h3 style={{ fontSize: 18, marginBottom: 4 }}>Practice details for role-play</h3>
            <p className="muted" style={{ fontSize: 13.5, marginBottom: 18 }}>
              The AI lead uses these so calls feel like your actual practice.
            </p>
            <div className="field">
              <label>Practice name</label>
              <input className="input" value={profile.name} onChange={(e) => setField("name", e.target.value)} />
            </div>
            <div className="field">
              <label>City</label>
              <input className="input" value={profile.city} onChange={(e) => setField("city", e.target.value)} />
            </div>
            <div className="field">
              <label>Offer / voucher framing</label>
              <input className="input" value={profile.offerFraming} onChange={(e) => setField("offerFraming", e.target.value)} />
            </div>
            <div className="field">
              <label>Appointment framing</label>
              <input className="input" value={profile.appointmentFraming} onChange={(e) => setField("appointmentFraming", e.target.value)} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Deposit policy</label>
              <input className="input" value={profile.depositPolicy} onChange={(e) => setField("depositPolicy", e.target.value)} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
