"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/Icon";

type Asset = {
  id: string;
  title: string;
  desc: string;
  type: "VIDEO" | "WORKBOOK";
  length: number;
  hasAsset: boolean;
  external: boolean;
  assetUrl: string | null;
  thumbUrl: string | null;
};

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

function VideoModal({ a, onClose }: { a: Asset; onClose: () => void }) {
  const embed = a.external && a.assetUrl ? embedFor(a.assetUrl) : null;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(6,6,12,.7)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ width: "min(880px,94vw)", overflow: "hidden", animation: "popin .3s var(--spring) both" }}>
        <div style={{ position: "relative", aspectRatio: "16/9", background: "#000", display: "grid", placeItems: "center", overflow: "hidden" }}>
          {a.external ? (
            embed ? (
              <iframe src={embed} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
            ) : (
              <a className="btn btn-primary" href={a.assetUrl ?? "#"} target="_blank" rel="noreferrer"><Icon name="play" size={16} /> Watch video ↗</a>
            )
          ) : (
            <video src={a.assetUrl ?? undefined} controls autoPlay style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
          )}
          <button onClick={onClose} style={{ position: "absolute", top: 14, right: 16, width: 34, height: 34, borderRadius: "50%", background: "rgba(0,0,0,.45)", display: "grid", placeItems: "center", color: "#fff" }} aria-label="Close"><Icon name="x" size={16} sw={2.4} /></button>
        </div>
        <div className="card-pad">
          <h2 style={{ fontSize: 21, marginBottom: 8 }}>{a.title}</h2>
          {a.desc && <p className="muted" style={{ fontSize: 14 }}>{a.desc}</p>}
        </div>
      </div>
    </div>
  );
}

export function ResourcesClient({ assets }: { assets: Asset[] }) {
  const [open, setOpen] = useState<Asset | null>(null);

  if (assets.length === 0) {
    return <div className="content"><div className="card card-pad muted" style={{ fontSize: 14 }}>No operations resources yet. Your SetMo team publishes videos and documents here.</div></div>;
  }

  return (
    <div className="content">
      <div className="grid g-3">
        {assets.map((a) => {
          const isVideo = a.type === "VIDEO";
          const card = (
            <>
              <div style={{ position: "relative", aspectRatio: "16/9", borderRadius: 12, overflow: "hidden", marginBottom: 12, background: "linear-gradient(135deg,#24243a,#15132a)", display: "grid", placeItems: "center" }}>
                {a.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.thumbUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                ) : isVideo && a.hasAsset && !a.external && a.assetUrl ? (
                  <video src={`${a.assetUrl}#t=0.1`} preload="metadata" muted style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                ) : null}
                <div style={{ position: "relative", width: 54, height: 54, borderRadius: "50%", background: "rgba(255,255,255,.16)", backdropFilter: "blur(6px)", border: "1.5px solid rgba(255,255,255,.4)", display: "grid", placeItems: "center", color: "#fff" }}>
                  <Icon name={isVideo ? "play" : "doc"} size={24} />
                </div>
              </div>
              <div style={{ fontWeight: 700, fontSize: 15.5, marginBottom: 6 }}>{a.title}</div>
              {a.desc && <p className="muted" style={{ fontSize: 13, marginBottom: 12, flex: 1 }}>{a.desc}</p>}
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="chip" style={{ padding: "2px 9px", fontSize: 11 }}>{isVideo ? `Video · ${a.length} min` : `PDF · ${a.length} pp`}</span>
              </div>
            </>
          );
          return isVideo ? (
            <button key={a.id} className="card card-pad" style={{ textAlign: "left", display: "flex", flexDirection: "column" }} onClick={() => a.hasAsset && setOpen(a)} disabled={!a.hasAsset}>
              {card}
            </button>
          ) : (
            <a key={a.id} className="card card-pad" style={{ display: "flex", flexDirection: "column" }} href={a.hasAsset ? a.assetUrl ?? "#" : undefined} target="_blank" rel="noreferrer">
              {card}
            </a>
          );
        })}
      </div>

      {open && <VideoModal a={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
