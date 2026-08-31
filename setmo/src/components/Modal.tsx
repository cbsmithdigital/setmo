"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

export function ModalShell({
  children,
  onClose,
  width = 520,
}: {
  children: React.ReactNode;
  onClose: () => void;
  width?: number;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Portal to <body> so the fixed overlay isn't trapped by a transformed ancestor
  // (e.g. a `.rise`-animated card), which would otherwise contain it and let later
  // cards paint on top. Modals only render after a client interaction, so guarding
  // on `document` is SSR-safe (no hydration mismatch — it's never in initial HTML).
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(6,6,12,.72)",
        backdropFilter: "blur(6px)",
        display: "grid",
        placeItems: "center",
        padding: 24,
        animation: "fade .2s ease",
      }}
    >
      <style>{`@keyframes fade{from{opacity:0}to{opacity:1}}`}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        className="card card-glow"
        style={{ width: `min(${width}px,94vw)`, maxHeight: "92vh", overflowY: "auto", animation: "popin .3s var(--spring) both" }}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
