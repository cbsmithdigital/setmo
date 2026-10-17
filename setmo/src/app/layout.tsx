import type { Metadata, Viewport } from "next";
import { Lato, DM_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { PwaRegister } from "@/components/PwaRegister";
import "./globals.css";

// Lato Black (900) — headings. Include 400/700 for occasional weights.
const lato = Lato({
  variable: "--font-lato",
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  display: "swap",
});

// DM Sans (variable) — body.
const dmSans = DM_Sans({
  variable: "--font-dmsans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  // Makes the preview image URL below absolute, as link previews require.
  metadataBase: new URL("https://setmo.growdental.ai"),
  title: "SetMo — Set more appointments",
  description:
    "SetMo trains dental appointment setters on high-value lead calls against a realistic AI patient, scores them, and tracks improvement.",
  applicationName: "SetMo",
  icons: {
    icon: [{ url: "/setmo-icon.png", type: "image/png" }],
    shortcut: "/setmo-icon.png",
    apple: "/apple-touch-icon.png",
  },
  // Added to an iPhone's home screen, SetMo opens full-screen like an app.
  appleWebApp: { capable: true, title: "SetMo", statusBarStyle: "black" },
  formatDetection: { telephone: false },
  // Link previews (iMessage, Slack, LinkedIn, Facebook, X). Next fills the
  // og/twitter title and description from each page's own, so a shared /audit
  // link previews as the audit page. The card is a static file in public/: a
  // generated /opengraph-image route would be sent to /login by proxy.ts.
  openGraph: {
    type: "website",
    siteName: "SetMo",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "SetMo — Set more appointments. AI practice calls for your dental front desk." }],
  },
  twitter: { card: "summary_large_image" },
};

// Edge to edge on phones (the layout pads for the notch and home bar itself),
// dark browser chrome, and pinch-zoom left alone.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#08080f",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${lato.variable} ${dmSans.variable}`}>
      <body>
        {children}
        <PwaRegister />
        <Analytics />
      </body>
    </html>
  );
}
