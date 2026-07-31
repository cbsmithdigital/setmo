import { getPlatformConfig, promoInfo } from "@/lib/config";
import { SignupClient } from "@/components/marketing/SignupClient";

// Dynamic so the sign-up promo banner reflects live platform config (same
// pattern as the landing page's pricing).
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const cfg = await getPlatformConfig();
  return <SignupClient promo={promoInfo(cfg)} />;
}
