import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getSavedRecordings } from "@/lib/queries";
import { Icon } from "@/components/ui/Icon";
import { whenLabel, mmss } from "@/lib/format";

export default async function LibraryPage() {
  const user = await requireUser();
  const rows = await getSavedRecordings(user);
  const isAdmin = ["OFFICE_ADMIN", "GROUP_ADMIN", "PLATFORM_ADMIN"].includes(user.role);

  return (
    <>
      <div className="topbar">
        <div className="tb-greet">
          <h1>Saved recordings</h1>
          <p>{isAdmin ? "Calls your team saved — review, share, and use as training examples." : "Calls you've saved to revisit or share for review."}</p>
        </div>
      </div>
      <div className="content">
        {rows.length === 0 ? (
          <div className="card card-pad muted" style={{ fontSize: 14 }}>
            No saved recordings yet. On any scored call&apos;s results, hit <b style={{ color: "var(--text-2)" }}>Save recording</b> to keep it here.
          </div>
        ) : (
          <div className="card rise" style={{ overflow: "hidden" }}>
            {rows.map((r, i) => (
              <Link
                key={r.id}
                href={`/results/${r.id}`}
                style={{ display: "flex", alignItems: "center", gap: 14, padding: "15px 20px", borderTop: i ? "1px solid var(--line-soft)" : "none" }}
              >
                <div style={{ width: 42, height: 42, borderRadius: 11, background: "var(--s3)", display: "grid", placeItems: "center", color: "var(--purple-2)", flex: "none" }}>
                  <Icon name="mic" size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14.5 }}>
                    {r.persona}
                    {r.shared && (
                      <span className="chip mint" style={{ marginLeft: 8, padding: "1px 8px", fontSize: 10.5 }}>
                        Shared
                      </span>
                    )}
                  </div>
                  <div className="muted" style={{ fontSize: 12.5 }}>
                    {r.showSetter ? `${r.setterName} · ` : ""}{r.service} · {whenLabel(r.when)} · {mmss(r.durationSeconds)}
                  </div>
                </div>
                <div
                  style={{ fontFamily: "var(--font-lato)", fontWeight: 900, fontSize: 19, width: 44, textAlign: "right" }}
                  className={r.score != null && r.score >= 4 ? "mint-text" : "grad-text"}
                >
                  {r.score != null ? r.score.toFixed(1) : "—"}
                </div>
                <div style={{ color: "var(--muted)" }}>›</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
