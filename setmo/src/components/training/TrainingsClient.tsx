"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";

type Video = { id: string; title: string; mins: number; skill: string; why: string; status: string };
type Workbook = { id: string; title: string; pages: number; done: number; desc: string; tag: string };

const THUMBS = [
  "linear-gradient(135deg,#7c3aed,#4c1d95)",
  "linear-gradient(135deg,#8b5cf6,#6d28d9)",
  "linear-gradient(135deg,#10b981,#065f46)",
  "linear-gradient(135deg,#a78bfa,#7c3aed)",
  "linear-gradient(135deg,#3a3650,#1a1a2e)",
];
const thumbFor = (id: string, i: number) => THUMBS[i % THUMBS.length];

function VideoCard({ v, index, onOpen }: { v: Video; index: number; onOpen: (v: Video) => void }) {
  return (
    <button onClick={() => onOpen(v)} className="card" style={{ textAlign: "left", overflow: "hidden", padding: 0 }}>
      <div style={{ position: "relative", aspectRatio: "16/9", background: thumbFor(v.id, index), display: "grid", placeItems: "center" }}>
        <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(135deg,transparent,transparent 18px,rgba(0,0,0,.06) 18px,rgba(0,0,0,.06) 36px)" }} />
        <div style={{ position: "relative", width: 48, height: 48, borderRadius: "50%", background: "rgba(255,255,255,.18)", border: "1.5px solid rgba(255,255,255,.45)", display: "grid", placeItems: "center", color: "#fff" }}>
          <Icon name="play" size={20} />
        </div>
        <div style={{ position: "absolute", bottom: 10, right: 10, background: "rgba(0,0,0,.55)", color: "#fff", fontSize: 11.5, fontWeight: 600, padding: "3px 8px", borderRadius: 99 }}>
          {v.mins} min
        </div>
        {v.status === "new" && (
          <div style={{ position: "absolute", top: 10, left: 10 }} className="chip mint">
            Recommended
          </div>
        )}
        {v.status === "done" && (
          <div style={{ position: "absolute", top: 10, left: 10, width: 26, height: 26, borderRadius: "50%", background: "var(--mint)", display: "grid", placeItems: "center", color: "#06281d" }}>
            <Icon name="check" size={15} sw={3} />
          </div>
        )}
      </div>
      <div style={{ padding: "15px 16px 17px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: 9, background: "var(--purple)" }} />
          <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--muted)" }}>{v.skill}</span>
        </div>
        <div style={{ fontWeight: 700, fontSize: 15.5, marginBottom: 8, lineHeight: 1.25 }}>{v.title}</div>
        <div className="muted" style={{ fontSize: 13, lineHeight: 1.4 }}>
          <b style={{ color: "var(--text-2)", fontWeight: 600 }}>Why:</b> {v.why}.
        </div>
      </div>
    </button>
  );
}

function VideoModal({ video, index, onClose }: { video: Video; index: number; onClose: () => void }) {
  const router = useRouter();
  const [playing, setPlaying] = useState(false);
  const [marking, setMarking] = useState(false);

  async function markComplete() {
    setMarking(true);
    try {
      await fetch(`/api/trainings/${video.id}/progress`, { method: "POST" });
      router.refresh();
      onClose();
    } catch {
      setMarking(false);
    }
  }

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(6,6,12,.7)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: "min(820px,94vw)", overflow: "hidden", animation: "popin .3s var(--spring) both" }}>
        <div style={{ position: "relative", aspectRatio: "16/9", background: thumbFor(video.id, index), display: "grid", placeItems: "center" }}>
          <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(135deg,transparent,transparent 22px,rgba(0,0,0,.06) 22px,rgba(0,0,0,.06) 44px)" }} />
          <button onClick={() => setPlaying((p) => !p)} style={{ position: "relative", width: 78, height: 78, borderRadius: "50%", background: "rgba(255,255,255,.16)", backdropFilter: "blur(8px)", border: "1.5px solid rgba(255,255,255,.4)", display: "grid", placeItems: "center", color: "#fff" }}>
            <Icon name={playing ? "pause" : "play"} size={30} />
          </button>
          <div style={{ position: "absolute", top: 14, left: 16 }} className="chip purple">{video.skill}</div>
          <button onClick={onClose} style={{ position: "absolute", top: 14, right: 16, width: 34, height: 34, borderRadius: "50%", background: "rgba(0,0,0,.35)", display: "grid", placeItems: "center", color: "#fff" }} aria-label="Close">
            <Icon name="x" size={16} sw={2.4} />
          </button>
        </div>
        <div className="card-pad">
          <h2 style={{ fontSize: 22, marginBottom: 10 }}>{video.title}</h2>
          <div style={{ display: "flex", gap: 11, marginBottom: 16, flexWrap: "wrap" }}>
            <span className="chip"><Icon name="clock" size={13} /> {video.mins} min</span>
            <span className="chip"><Icon name="video" size={13} /> Video lesson</span>
            <span className="chip mint"><Icon name="target" size={13} /> Targets {video.skill}</span>
          </div>
          <div style={{ background: "rgba(139,92,246,.1)", border: "1px solid rgba(139,92,246,.25)", borderRadius: 12, padding: "13px 16px", marginBottom: 18, fontSize: 14, color: "var(--text-2)" }}>
            <b style={{ color: "var(--purple-2)" }}>Why this, now:</b> {video.why}.
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button className="btn btn-primary" onClick={() => setPlaying(true)}>
              <Icon name="play" size={16} /> Watch lesson
            </button>
            <Link className="btn btn-ghost" href="/coach">
              <Icon name="chat" size={16} /> Practice this with Coach
            </Link>
            {video.status !== "done" && (
              <button className="btn btn-ghost" onClick={markComplete} disabled={marking}>
                <Icon name="check" size={16} /> {marking ? "Saving…" : "Mark complete"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TrainingsClient({
  recommended,
  videos,
  workbooks,
}: {
  recommended: Video[];
  videos: Video[];
  workbooks: Workbook[];
}) {
  const [open, setOpen] = useState<{ v: Video; i: number } | null>(null);
  const allVideos = [...recommended, ...videos];

  return (
    <div className="content">
      {/* coach banner */}
      <div
        className="card card-pad rise"
        style={{ marginBottom: 24, background: "linear-gradient(120deg,rgba(139,92,246,.22),rgba(52,211,153,.06))", borderColor: "rgba(139,92,246,.4)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}
      >
        <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
          <div style={{ width: 54, height: 54, borderRadius: 16, background: "var(--grad)", display: "grid", placeItems: "center", color: "#fff", flex: "none", boxShadow: "var(--glow)" }}>
            <Icon name="chat" size={26} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
              <h2 style={{ fontSize: 21 }}>Help me say it better</h2>
              <span className="chip purple" style={{ padding: "2px 9px", fontSize: 11 }}>Setty</span>
            </div>
            <p className="muted" style={{ fontSize: 14.5, maxWidth: "40em" }}>
              Chat or talk it through with Setty — figure out the exact words, or run a quick role-play of just the
              moment you&apos;re stuck on.
            </p>
          </div>
        </div>
        <Link className="btn btn-primary btn-lg" href="/coach">
          <Icon name="chat" size={18} /> Open Coach
        </Link>
      </div>

      {/* videos */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div className="eyebrow">Recommended this week</div>
        <div className="chip"><Icon name="clock" size={13} /> Refreshes from your calls</div>
      </div>
      <p className="muted" style={{ fontSize: 13.5, marginBottom: 18 }}>
        New lessons surface based on your last sessions — your weakest skill gets priority.
      </p>
      {allVideos.length === 0 ? (
        <div className="card card-pad muted" style={{ marginBottom: 32, fontSize: 14 }}>
          No lessons yet — run a few sessions and we&apos;ll recommend coaching tied to your weak spots.
        </div>
      ) : (
        <div className="grid g-3" style={{ marginBottom: 32 }}>
          {allVideos.map((v, i) => (
            <VideoCard key={v.id} v={v} index={i} onOpen={() => setOpen({ v, i })} />
          ))}
        </div>
      )}

      {/* workbooks */}
      {workbooks.length > 0 && (
        <>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Workbooks</div>
          <p className="muted" style={{ fontSize: 13.5, marginBottom: 18 }}>
            Go deeper between calls — scripts and drills you can keep on hand.
          </p>
          <div className="grid g-3">
            {workbooks.map((w) => {
              const pct = w.pages > 0 ? Math.round((w.done / w.pages) * 100) : 0;
              const complete = w.done >= w.pages && w.pages > 0;
              return (
                <div key={w.id} className="card card-pad" style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                    <div style={{ width: 46, height: 54, borderRadius: 8, background: "linear-gradient(135deg,#24243a,#1a1a2e)", border: "1px solid var(--line)", display: "grid", placeItems: "center", color: "var(--purple-2)", position: "relative" }}>
                      <Icon name="doc" size={22} />
                      <span style={{ position: "absolute", left: 0, top: 8, bottom: 8, width: 3, borderRadius: 99, background: "var(--grad)" }} />
                    </div>
                    <span className="chip" style={{ padding: "3px 10px" }}>{w.tag}</span>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 7 }}>{w.title}</div>
                  <p className="muted" style={{ fontSize: 13.5, marginBottom: 16, flex: 1 }}>{w.desc}</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <div style={{ flex: 1, height: 6, borderRadius: 99, background: "#181828", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: pct + "%", background: complete ? "var(--grad-mint)" : "var(--grad)", borderRadius: 99 }} />
                    </div>
                    <span style={{ fontSize: 12, color: complete ? "var(--mint)" : "var(--muted)", fontWeight: 600, whiteSpace: "nowrap" }}>
                      {complete ? "Complete" : `${w.done}/${w.pages} pp`}
                    </span>
                  </div>
                  <button className="btn btn-ghost" style={{ width: "100%" }}>
                    <Icon name="doc" size={16} /> {w.done > 0 ? (complete ? "Review workbook" : "Continue") : "Open workbook"}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {open && <VideoModal video={open.v} index={open.i} onClose={() => setOpen(null)} />}
    </div>
  );
}
