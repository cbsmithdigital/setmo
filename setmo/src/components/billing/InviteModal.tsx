"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { ModalShell } from "@/components/Modal";

type Role = "SETTER" | "OFFICE_ADMIN" | "GROUP_ADMIN";
type Office = { id: string; name: string };

const ROLE_INFO: Record<Role, { label: string; desc: string }> = {
  SETTER: { label: "Setter", desc: "Practices calls and gets scored." },
  OFFICE_ADMIN: { label: "Office admin", desc: "Manages a location, its team, and billing." },
  GROUP_ADMIN: { label: "Group admin", desc: "Oversees every location in the group." },
};

export function InviteModal({
  scope = "office",
  offices = [],
  allowGroupAdmin = false,
  onClose,
}: {
  scope?: "office" | "group";
  offices?: Office[];
  allowGroupAdmin?: boolean; // office scope: show group-admin option (office is in a group)
  seatsFree?: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const roleOptions: Role[] =
    scope === "group"
      ? ["SETTER", "OFFICE_ADMIN", "GROUP_ADMIN"]
      : allowGroupAdmin
        ? ["SETTER", "OFFICE_ADMIN", "GROUP_ADMIN"]
        : ["SETTER", "OFFICE_ADMIN"];
  const [selected, setSelected] = useState<Role[]>(["SETTER"]);
  const [officeId, setOfficeId] = useState<string>(offices[0]?.id ?? "");
  const [invitees, setInvitees] = useState<{ name: string; email: string }[]>([
    { name: "", email: "" },
    { name: "", email: "" },
  ]);
  const [done, setDone] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [previewLinks, setPreviewLinks] = useState<string[]>([]);

  const valid = invitees.filter((i) => /.+@.+\..+/.test(i.email));
  const needsLocation = scope === "group" && selected.some((r) => r === "SETTER" || r === "OFFICE_ADMIN");

  function toggle(r: Role) {
    setSelected((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  }

  async function send() {
    setErr(null);
    if (selected.length === 0) {
      setErr("Pick at least one role.");
      return;
    }
    if (needsLocation && !officeId) {
      setErr("Choose a location for the office roles.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(scope === "group" ? "/api/group/invites" : "/api/office/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ invitees: valid.map((i) => ({ email: i.email, name: i.name.trim() || undefined })), roles: selected, ...(needsLocation ? { officeId } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error ?? "Couldn't send invites.");
        setLoading(false);
        return;
      }
      setSentCount(data.invited ?? valid.length);
      setPreviewLinks(data.previewLinks ?? []);
      setDone(true);
      router.refresh();
    } catch {
      setErr("Couldn't send invites. Try again.");
      setLoading(false);
    }
  }

  const selectedLabels = roleOptions.filter((r) => selected.includes(r)).map((r) => ROLE_INFO[r].label.toLowerCase());

  return (
    <ModalShell onClose={onClose} width={520}>
      <div className="card-pad">
        {!done ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
              <h2 style={{ fontSize: 22 }}>Invite to your team</h2>
              <button onClick={onClose} style={{ color: "var(--muted)" }} aria-label="Close">
                <Icon name="x" size={20} />
              </button>
            </div>
            <p className="muted" style={{ fontSize: 14, marginBottom: 18 }}>
              Pick one or more roles, then add their emails. Someone can be both an office admin and a setter. They&apos;ll get a link to set up their account — users are free &amp; unlimited.
            </p>

            {err && <div className="banner error" style={{ marginBottom: 16 }}>{err}</div>}

            {/* roles (multi-select) */}
            <label style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", display: "block", marginBottom: 8 }}>Roles</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              {roleOptions.map((r) => {
                const on = selected.includes(r);
                return (
                  <button
                    key={r}
                    type="button"
                    className={"btn " + (on ? "btn-primary" : "btn-ghost")}
                    onClick={() => toggle(r)}
                    style={{ flex: "1 1 0", minWidth: 110, padding: "9px 12px", fontSize: 13.5, gap: 6 }}
                  >
                    {on && <Icon name="check" size={14} sw={3} />} {ROLE_INFO[r].label}
                  </button>
                );
              })}
            </div>
            <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 3 }}>
              {roleOptions.filter((r) => selected.includes(r)).map((r) => (
                <p key={r} className="muted" style={{ fontSize: 12.5 }}><b style={{ color: "var(--text-2)" }}>{ROLE_INFO[r].label}:</b> {ROLE_INFO[r].desc}</p>
              ))}
            </div>

            {/* location (group only, when an office-scoped role is selected) */}
            {needsLocation && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", display: "block", marginBottom: 8 }}>Location (for office admin / setter)</label>
                <select className="input" value={officeId} onChange={(e) => setOfficeId(e.target.value)} style={{ width: "100%" }}>
                  {offices.length === 0 && <option value="">No locations found</option>}
                  {offices.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
            )}

            <label style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", display: "block", marginBottom: 8 }}>Who are you inviting?</label>
            {invitees.map((row, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <input
                  className="input"
                  type="text"
                  value={row.name}
                  placeholder="Full name"
                  onChange={(e) => setInvitees(invitees.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  style={{ flex: 1, minWidth: 0 }}
                />
                <input
                  className="input"
                  type="email"
                  value={row.email}
                  placeholder="name@example.com"
                  onChange={(e) => setInvitees(invitees.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))}
                  style={{ flex: 1.3, minWidth: 0 }}
                />
                {invitees.length > 1 && (
                  <button onClick={() => setInvitees(invitees.filter((_, j) => j !== i))} className="btn btn-ghost" style={{ padding: "0 12px" }} aria-label="Remove">
                    <Icon name="x" size={16} />
                  </button>
                )}
              </div>
            ))}
            <button onClick={() => setInvitees([...invitees, { name: "", email: "" }])} className="btn btn-ghost" style={{ fontSize: 13.5, padding: "9px 14px", marginBottom: 20 }}>
              + Add another
            </button>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderTop: "1px solid var(--line)", marginBottom: 18 }}>
              <span className="muted" style={{ fontSize: 13.5 }}>
                {valid.length} invite{valid.length === 1 ? "" : "s"}{selectedLabels.length ? ` · as ${selectedLabels.join(" + ")}` : ""}
              </span>
            </div>
            <button className="btn btn-primary btn-block btn-lg" disabled={!valid.length || !selected.length || loading} onClick={send}>
              <Icon name="send" size={18} /> {loading ? "Sending…" : `Send ${valid.length || ""} invite${valid.length === 1 ? "" : "s"}`}
            </button>
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "16px 8px" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--grad)", display: "grid", placeItems: "center", margin: "0 auto 18px", color: "#fff" }}>
              <Icon name="send" size={28} />
            </div>
            <h2 style={{ fontSize: 23, marginBottom: 8 }}>Invites on their way</h2>
            <p className="muted" style={{ fontSize: 14.5, maxWidth: "26em", margin: "0 auto 22px" }}>
              We sent {sentCount} invite{sentCount === 1 ? "" : "s"}. They&apos;ll appear on your team the moment they accept.
            </p>
            {previewLinks.length > 0 && (
              <div className="banner mint" style={{ textAlign: "left", marginBottom: 18, wordBreak: "break-all" }}>
                <b>Dev mode (email not configured)</b> — share these invite links manually:
                <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                  {previewLinks.map((l, i) => (
                    <li key={i} style={{ fontSize: 12 }}>{l}</li>
                  ))}
                </ul>
              </div>
            )}
            <button className="btn btn-primary btn-lg" onClick={onClose}>Done</button>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
