import type { MetadataRoute } from "next";

// Installs SetMo to a phone's home screen: opens full-screen (no browser bars)
// straight to the person's own home page — /go sends each role where it belongs.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "SetMo — Set more appointments",
    short_name: "SetMo",
    description: "Practice dental lead calls against a realistic AI patient, get scored, and set more appointments.",
    start_url: "/go",
    scope: "/",
    display: "standalone",
    background_color: "#08080f",
    theme_color: "#08080f",
    categories: ["business", "education", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
