import type { ServiceKey } from "@/generated/prisma/client";

// Presentation metadata for the service picker (descriptions, indicative case
// value). Live status + skill count come from the Agent row at query time.
export const SERVICE_META: Record<
  ServiceKey,
  { name: string; desc: string; value: string }
> = {
  IMPLANT: {
    name: "Implants & full-arch",
    desc: "High-ticket reconstructive cases — the flagship call.",
    value: "$25k–45k",
  },
  DENTURE: {
    name: "Dentures & snap-in",
    desc: "Removable and implant-retained denture conversations.",
    value: "$3k–12k",
  },
  COSMETIC: {
    name: "Cosmetic & veneers",
    desc: "Smile-makeover, vision-casting led calls.",
    value: "$8k–30k",
  },
  ORTHO: {
    name: "Ortho & Invisalign",
    desc: "Aligner and braces consult booking.",
    value: "$4k–7k",
  },
  WISDOM: {
    name: "Wisdom teeth",
    desc: "Surgical extraction scheduling.",
    value: "$1k–3k",
  },
  GENERAL: {
    name: "General & hygiene",
    desc: "New-patient and recall booking fundamentals.",
    value: "varies",
  },
};

// Display order in the picker.
export const SERVICE_ORDER: ServiceKey[] = [
  "IMPLANT",
  "DENTURE",
  "COSMETIC",
  "ORTHO",
  "WISDOM",
  "GENERAL",
];
