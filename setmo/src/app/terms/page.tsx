import type { Metadata } from "next";
import "../marketing.css";
import { LegalDoc } from "@/components/LegalDoc";
import { TERMS_MD } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of Service — SetMo",
  description: "The terms governing your use of SetMo by Grow Dental.",
};

export default function TermsPage() {
  return <LegalDoc markdown={TERMS_MD} />;
}
