"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";

// Horizontal rail with desktop scroll arrows (auto-hidden at the ends / no overflow).
function Rail({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState({ left: false, right: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setOver({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => { el.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
  }, []);
  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: "smooth" });
  return (
    <div className="rail-wrap">
      {over.left && <button className="rail-arrow left" onClick={() => scroll(-1)} aria-label="Scroll left"><span style={{ display: "inline-flex", transform: "rotate(180deg)" }}><Icon name="arrow" size={18} /></span></button>}
      <div ref={ref} className="hrail">{children}</div>
      {over.right && <button className="rail-arrow right" onClick={() => scroll(1)} aria-label="Scroll right"><Icon name="arrow" size={18} /></button>}
    </div>
  );
}

type Asset = { hasAsset: boolean; external: boolean; assetUrl: string | null; thumbUrl: string | null };
type Video = { id: string; title: string; mins: number; skill: string; why: string; status: string } & Asset;
type Workbook = { id: string; title: string; pages: number; done: number; desc: string; tag: string } & Asset;

// Convert a Vimeo/YouTube/Loom watch URL into an embeddable player URL.
function embedFor(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") { const id = u.searchParams.get("v"); return id ? `https://www.youtube.com/embed/${id}` : null; }
    if (host === "youtu.be") return `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
    if (host === "vimeo.com") { const id = u.pathname.split("/").filter(Boolean)[0]; return id ? `https://player.vimeo.com/video/${id}` : null; }
    if (host === "loom.com") { const id = u.pathname.split("/").filter(Boolean).pop(); return id ? `https://www.loom.com/embed/${id}` : null; }
    return null;
  } catch {
    return null;
  }
}

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
      <div style={{ position: "relative", aspectRatio: "16/9", background: thumbFor(v.id, index), display: "grid", placeItems: "center", overflow: "hidden" }}>
        {v.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={v.thumbUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        ) : v.hasAsset && !v.external && v.assetUrl ? (
          <video src={`${v.assetUrl}#t=0.1`} preload="metadata" muted style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(135deg,transparent,transparent 18px,rgba(0,0,0,.06) 18px,rgba(0,0,0,.06) 36px)" }} />
        )}
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
  const embed = video.external && video.assetUrl ? embedFor(video.assetUrl) : null;

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
        <div style={{ position: "relative", aspectRatio: "16/9", background: playing && video.hasAsset ? "#000" : thumbFor(video.id, index), display: "grid", placeItems: "center", overflow: "hidden" }}>
          {playing && video.hasAsset ? (
            video.external ? (
              embed ? (
                <iframe src={embed} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
              ) : (
                <a className="btn btn-primary" href={video.assetUrl ?? "#"} target="_blank" rel="noreferrer"><Icon name="play" size={16} /> Watch video ↗</a>
              )
            ) : (
              <video src={video.assetUrl ?? undefined} controls autoPlay style={{ position: "absolute", inset: 0, width: "100%", height: "100%", background: "#000" }} />
            )
          ) : (
            <>
              {video.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={video.thumbUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(135deg,transparent,transparent 22px,rgba(0,0,0,.06) 22px,rgba(0,0,0,.06) 44px)" }} />
              )}
              {video.hasAsset ? (
                <button onClick={() => setPlaying(true)} style={{ position: "relative", width: 78, height: 78, borderRadius: "50%", background: "rgba(255,255,255,.16)", backdropFilter: "blur(8px)", border: "1.5px solid rgba(255,255,255,.4)", display: "grid", placeItems: "center", color: "#fff" }}>
                  <Icon name="play" size={30} />
                </button>
              ) : (
                <span className="chip" style={{ position: "relative", background: "rgba(0,0,0,.4)", color: "#fff" }}>Lesson video coming soon</span>
              )}
            </>
          )}
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
            <button className="btn btn-primary" onClick={() => setPlaying(true)} disabled={!video.hasAsset}>
              <Icon name="play" size={16} /> {video.hasAsset ? "Watch lesson" : "Coming soon"}
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

type OpsAsset = { id: string; title: string; desc: string; type: "VIDEO" | "WORKBOOK"; length: number } & Asset;

// PDF / document card (workbooks + operations docs): thumbnail (page 1) or icon.
function DocCard({ title, desc, meta, thumbUrl, assetUrl, hasAsset }: { title: string; desc: string; meta: string; thumbUrl: string | null; assetUrl: string | null; hasAsset: boolean }) {
  return (
    <div className="card card-pad" style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ position: "relative", aspectRatio: "16/10", borderRadius: 10, overflow: "hidden", marginBottom: 12, background: "linear-gradient(135deg,#24243a,#15132a)", display: "grid", placeItems: "center" }}>
        {thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
        ) : (
          <div style={{ color: "var(--purple-2)" }}><Icon name="doc" size={30} /></div>
        )}
      </div>
      <div style={{ fontWeight: 700, fontSize: 15.5, marginBottom: 6 }}>{title}</div>
      {desc && <p className="muted" style={{ fontSize: 13, marginBottom: 12, flex: 1 }}>{desc}</p>}
      <div style={{ marginBottom: 12 }}><span className="chip" style={{ padding: "2px 9px", fontSize: 11 }}>{meta}</span></div>
      {hasAsset ? (
        <a className="btn btn-ghost" style={{ width: "100%" }} href={assetUrl ?? "#"} target="_blank" rel="noreferrer"><Icon name="doc" size={16} /> Open</a>
      ) : (
        <button className="btn btn-ghost" style={{ width: "100%" }} disabled><Icon name="doc" size={16} /> Coming soon</button>
      )}
    </div>
  );
}

export function TrainingsClient({
  recommended,
  videos,
  workbooks,
  operations = [],
}: {
  recommended: Video[];
  videos: Video[];
  workbooks: Workbook[];
  operations?: OpsAsset[];
}) {
  const [open, setOpen] = useState<{ v: Video; i: number } | null>(null);
  const allVideos = [...recommended, ...videos];
  const opsVideos: Video[] = operations.filter((o) => o.type === "VIDEO").map((o) => ({ id: o.id, title: o.title, mins: o.length, skill: "Operations", why: o.desc || "Operations resource", status: "start", hasAsset: o.hasAsset, external: o.external, assetUrl: o.assetUrl, thumbUrl: o.thumbUrl }));
  const opsDocs = operations.filter((o) => o.type === "WORKBOOK");

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
        <div style={{ marginBottom: 32 }}>
          <Rail>
            {allVideos.map((v, i) => (
              <VideoCard key={v.id} v={v} index={i} onOpen={() => setOpen({ v, i })} />
            ))}
          </Rail>
        </div>
      )}

      {/* workbooks */}
      {workbooks.length > 0 && (
        <>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Workbooks</div>
          <p className="muted" style={{ fontSize: 13.5, marginBottom: 18 }}>
            Go deeper between calls — scripts and drills you can keep on hand.
          </p>
          <div style={{ marginBottom: 32 }}>
            <Rail>
              {workbooks.map((w) => (
                <DocCard key={w.id} title={w.title} desc={w.desc} meta={`${w.tag} · ${w.pages} pp`} thumbUrl={w.thumbUrl} assetUrl={w.assetUrl} hasAsset={w.hasAsset} />
              ))}
            </Rail>
          </div>
        </>
      )}

      {/* operations & tools */}
      {(opsVideos.length > 0 || opsDocs.length > 0) && (
        <>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Operations &amp; tools</div>
          <p className="muted" style={{ fontSize: 13.5, marginBottom: 18 }}>
            Scripts, SOPs, and resources for running your practice.
          </p>
          <Rail>
            {opsVideos.map((v, i) => (
              <VideoCard key={v.id} v={v} index={i} onOpen={() => setOpen({ v, i: allVideos.length + i })} />
            ))}
            {opsDocs.map((d) => (
              <DocCard key={d.id} title={d.title} desc={d.desc} meta={`PDF · ${d.length} pp`} thumbUrl={d.thumbUrl} assetUrl={d.assetUrl} hasAsset={d.hasAsset} />
            ))}
          </Rail>
        </>
      )}

      {open && <VideoModal video={open.v} index={open.i} onClose={() => setOpen(null)} />}
    </div>
  );
}
