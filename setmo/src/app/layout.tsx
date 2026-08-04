import type { Metadata } from "next";
import { Lato, DM_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
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
  title: "SetMo — Set more appointments",
  description:
    "SetMo trains dental appointment setters on high-value lead calls against a realistic AI patient, scores them, and tracks improvement.",
  icons: {
    icon: [{ url: "/setmo-icon.png", type: "image/png" }],
    shortcut: "/setmo-icon.png",
    apple: "/setmo-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${lato.variable} ${dmSans.variable}`}>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
