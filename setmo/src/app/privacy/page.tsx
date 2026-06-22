import type { Metadata } from "next";
import "../marketing.css";
import { LegalDoc } from "@/components/LegalDoc";
import { PRIVACY_MD } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy — SetMo",
  description: "How Grow Dental collects, uses, and shares information for SetMo.",
};

export default function PrivacyPage() {
  return <LegalDoc markdown={PRIVACY_MD} />;
}
