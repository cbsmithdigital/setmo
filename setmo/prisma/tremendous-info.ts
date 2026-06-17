// Once TREMENDOUS_API_KEY (+ TREMENDOUS_ENV) is set, run this to print your
// funding sources and campaigns so you can fill in TREMENDOUS_FUNDING_SOURCE_ID
// and TREMENDOUS_CAMPAIGN_ID. Read-only — makes no orders.
// Run: pnpm exec tsx prisma/tremendous-info.ts
import { config } from "dotenv";
config({ path: ".env.local" });
config();

const base = process.env.TREMENDOUS_ENV === "production" ? "https://api.tremendous.com/api/v2" : "https://testflight.tremendous.com/api/v2";

async function get(path: string) {
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${process.env.TREMENDOUS_API_KEY}`, Accept: "application/json" },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function main() {
  if (!process.env.TREMENDOUS_API_KEY) {
    console.log("Set TREMENDOUS_API_KEY in .env.local first.");
    return;
  }
  console.log(`Tremendous env: ${process.env.TREMENDOUS_ENV === "production" ? "PRODUCTION" : "sandbox"} (${base})\n`);

  try {
    const fs = await get("/funding_sources");
    console.log("FUNDING SOURCES:");
    for (const f of fs.funding_sources ?? []) console.log(`  id=${f.id}  method=${f.method}  ${f.meta?.label ?? f.type ?? ""}`);
  } catch (e) {
    console.log("funding_sources:", (e as Error).message);
  }

  try {
    const c = await get("/campaigns");
    console.log("\nCAMPAIGNS:");
    for (const cam of c.campaigns ?? []) console.log(`  id=${cam.id}  name="${cam.name}"  products=${(cam.products ?? []).length}`);
  } catch (e) {
    console.log("campaigns:", (e as Error).message);
  }

  console.log("\nSet TREMENDOUS_FUNDING_SOURCE_ID and TREMENDOUS_CAMPAIGN_ID from the above (in .env.local and Vercel).");
}
main();
