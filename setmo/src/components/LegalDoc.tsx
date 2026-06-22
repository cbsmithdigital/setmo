import Image from "next/image";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Renders a Markdown legal document (terms / privacy) in a centered prose
// column with the SetMo marketing-brand chrome. Wrapped in `.mkt` so it reuses
// the light marketing theme; marketing.css is imported by the page.
export function LegalDoc({ markdown }: { markdown: string }) {
  return (
    <div className="mkt legal-page">
      <header className="legal-top">
        <div className="wrap legal-top-in">
          <Link className="logo" href="/">
            <Image className="lm" src="/setmo-icon.png" alt="" width={30} height={30} />
            <span>Set<span className="mo">Mo</span></span>
          </Link>
          <nav className="legal-nav">
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link className="btn btn-ghost" href="/login">Open the app</Link>
          </nav>
        </div>
      </header>

      <main className="wrap legal">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
      </main>

      <footer className="legal-foot">
        <div className="wrap legal-foot-in">
          <span>© 2026 Grow Dental AI. All rights reserved.</span>
          <span><Link href="/terms">Terms</Link> · <Link href="/privacy">Privacy</Link> · support@growdental.ai</span>
        </div>
      </footer>
    </div>
  );
}
