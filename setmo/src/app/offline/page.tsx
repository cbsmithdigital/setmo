// Shown by the service worker when the phone has no connection. Static, public,
// and self-contained: it's served from the cache with no network at all, so it
// carries its own styles and needs no script or image the cache doesn't hold.
export const dynamic = "force-static";

export const metadata = { title: "Offline — SetMo" };

const css = `
.offline{min-height:100dvh;display:grid;place-items:center;padding:24px;background:#08080f;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif;text-align:center}
.offline img{width:72px;height:72px;border-radius:18px;margin:0 auto 22px;display:block}
.offline h1{font-size:26px;margin:0 0 10px}
.offline p{color:#94a3b8;max-width:24em;margin:0 auto 24px;line-height:1.5}
.offline a{display:inline-block;padding:14px 26px;border-radius:12px;background:linear-gradient(135deg,#8b5cf6,#7c3aed);color:#fff;font-weight:700;text-decoration:none}
`;

export default function OfflinePage() {
  return (
    <div className="offline">
      <style>{css}</style>
      <div>
        {/* eslint-disable-next-line @next/next/no-img-element -- must load from the offline cache, not the image optimizer */}
        <img src="/icons/icon-192.png" alt="" />
        <h1>You&apos;re offline</h1>
        <p>SetMo needs a connection — practice calls run live. Check your Wi-Fi or signal, then try again.</p>
        {/* Reloads the page they were trying to open (this screen stands in for it). */}
        <a href="">Try again</a>
      </div>
    </div>
  );
}
