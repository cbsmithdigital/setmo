import type { Metadata } from "next";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { InstallGuide, type Platform } from "@/components/InstallGuide";

// The page a practice sends its team: how to put SetMo on an iPhone, an Android
// phone or a computer, with a QR code that opens this same page on a phone.
// Public — someone who hasn't signed in yet needs it most.

export const metadata: Metadata = {
  title: "Get the SetMo app",
  description: "Put SetMo on your phone's home screen — practice calls, scores and coaching one tap away.",
};

function platformFor(ua: string): Platform {
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "computer";
}

export default async function InstallPage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "setmo.growdental.ai";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const url = `${proto}://${host}/install`;
  const qrSvg = await QRCode.toString(url, { type: "svg", margin: 1, width: 200, color: { dark: "#0b0b14", light: "#ffffff" } });
  return <InstallGuide initial={platformFor(h.get("user-agent") ?? "")} url={url} qrSvg={qrSvg} />;
}
