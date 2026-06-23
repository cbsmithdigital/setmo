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
  onClose,
}: {
  scope?: "office" | "group";
  offices?: Office[];
  seatsFree?: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const roleOptions: Role[] = scope === "group" ? ["SETTER", "OFFICE_ADMIN", "GROUP_ADMIN"] : ["SETTER", "OFFICE_ADMIN"];
  const [role, setRole] = useState<Role>("SETTER");
  const [officeId, setOfficeId] = useState<string>(offices[0]?.id ?? "");
  const [emails, setEmails] = useState<string[]>(["", ""]);
  const [done, setDone] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [previewLinks, setPreviewLinks] = useState<string[]>([]);

  const valid = emails.filter((e) => /.+@.+\..+/.test(e));
  const needsLocation = scope === "group" && role !== "GROUP_ADMIN";

  async function send() {
    setErr(null);
    if (needsLocation && !officeId) {
      setErr("Choose a location for this role.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(scope === "group" ? "/api/group/invites" : "/api/office/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ emails: valid, role, ...(needsLocation ? { officeId } : {}) }),
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
              Choose what they can do, then add their emails. They&apos;ll get a link to set up their account. Users are free &amp; unlimited.
            </p>

            {err && <div className="banner error" style={{ marginBottom: 16 }}>{err}</div>}

            {/* role */}
            <label style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", display: "block", marginBottom: 8 }}>Invite as</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
              {roleOptions.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={"btn " + (role === r ? "btn-primary" : "btn-ghost")}
                  onClick={() => setRole(r)}
                  style={{ flex: "1 1 0", minWidth: 110, padding: "9px 12px", fontSize: 13.5 }}
                >
                  {ROLE_INFO[r].label}
                </button>
              ))}
            </div>
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 16 }}>{ROLE_INFO[role].desc}</p>

            {/* location (group only, non-group-admin role) */}
            {needsLocation && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)", display: "block", marginBottom: 8 }}>Location</label>
                <select className="input" value={officeId} onChange={(e) => setOfficeId(e.target.value)} style={{ width: "100%" }}>
                  {offices.length === 0 && <option value="">No locations found</option>}
                  {offices.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
            )}

            {emails.map((em, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <input
                  className="input"
                  type="email"
                  value={em}
                  placeholder="name@example.com"
                  onChange={(e) => setEmails(emails.map((x, j) => (j === i ? e.target.value : x)))}
                  style={{ flex: 1 }}
                />
                {emails.length > 1 && (
                  <button onClick={() => setEmails(emails.filter((_, j) => j !== i))} className="btn btn-ghost" style={{ padding: "0 14px" }} aria-label="Remove">
                    <Icon name="x" size={16} />
                  </button>
                )}
              </div>
            ))}
            <button onClick={() => setEmails([...emails, ""])} className="btn btn-ghost" style={{ fontSize: 13.5, padding: "9px 14px", marginBottom: 20 }}>
              + Add another
            </button>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderTop: "1px solid var(--line)", marginBottom: 18 }}>
              <span className="muted" style={{ fontSize: 13.5 }}>
                {valid.length} invite{valid.length === 1 ? "" : "s"} · as {ROLE_INFO[role].label.toLowerCase()}
              </span>
            </div>
            <button className="btn btn-primary btn-block btn-lg" disabled={!valid.length || loading} onClick={send}>
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
