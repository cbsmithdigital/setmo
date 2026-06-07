"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { ModalShell } from "@/components/Modal";

export function InviteModal({ seatsFree, onClose }: { seatsFree: number; onClose: () => void }) {
  const router = useRouter();
  const [emails, setEmails] = useState<string[]>(["", ""]);
  const [done, setDone] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [previewLinks, setPreviewLinks] = useState<string[]>([]);

  const valid = emails.filter((e) => /.+@.+\..+/.test(e));

  async function send() {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/office/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ emails: valid }),
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
    <ModalShell onClose={onClose} width={500}>
      <div className="card-pad">
        {!done ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
              <h2 style={{ fontSize: 22 }}>Invite setters</h2>
              <button onClick={onClose} style={{ color: "var(--muted)" }} aria-label="Close">
                <Icon name="x" size={20} />
              </button>
            </div>
            <p className="muted" style={{ fontSize: 14, marginBottom: 20 }}>
              They&apos;ll get an email to set up their account and start practicing. Each active setter uses one seat.
            </p>

            {err && <div className="banner error" style={{ marginBottom: 16 }}>{err}</div>}

            {emails.map((em, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <input
                  className="input"
                  type="email"
                  value={em}
                  placeholder="name@brightworkdental.com"
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
                {valid.length} invite{valid.length === 1 ? "" : "s"} · {seatsFree} seat{seatsFree === 1 ? "" : "s"} free
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
              We invited {sentCount} setter{sentCount === 1 ? "" : "s"}. They&apos;ll appear on your team the moment they accept.
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
