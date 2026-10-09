/**
 * Voice roster check (pnpm voices:check): every voice in the roster must be in
 * the ElevenLabs account's My Voices, and be the gender the roster says.
 *
 * A voice that isn't in the account doesn't fail anything: ElevenLabs quietly
 * plays the agent's default voice instead, so a man can end up speaking in a
 * woman's voice with no error anywhere. Run this whenever the roster changes.
 * Needs ELEVENLABS_API_KEY, from the environment or a .env.local here or one
 * level up.
 */
import fs from "node:fs";
import path from "node:path";
import { VOICE_CATALOG } from "../src/lib/voices";

function apiKey(): string | null {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  for (const file of [path.join(process.cwd(), ".env.local"), path.join(process.cwd(), "..", ".env.local")]) {
    if (!fs.existsSync(file)) continue;
    const m = fs.readFileSync(file, "utf8").match(/^ELEVENLABS_API_KEY=(.*)$/m);
    const v = m?.[1].trim().replace(/^["']|["']$/g, "");
    if (v) return v;
  }
  return null;
}

type AccountVoice = { voice_id: string; name: string; labels?: { gender?: string } };

async function run(): Promise<number> {
  const key = apiKey();
  if (!key) {
    console.error("No ELEVENLABS_API_KEY (environment or .env.local).");
    return 1;
  }
  const account = new Map<string, AccountVoice>();
  let token: string | null = null;
  for (let page = 0; page < 50; page++) {
    const res = await fetch(`https://api.elevenlabs.io/v2/voices?page_size=100${token ? `&next_page_token=${encodeURIComponent(token)}` : ""}`, {
      headers: { "xi-api-key": key },
    });
    if (!res.ok) {
      console.error(`Couldn't list the account's voices: HTTP ${res.status}`);
      return 1;
    }
    const body = (await res.json()) as { voices: AccountVoice[]; has_more: boolean; next_page_token: string | null };
    for (const v of body.voices) account.set(v.voice_id, v);
    if (!body.has_more) break;
    token = body.next_page_token;
  }

  const problems: string[] = [];
  for (const v of VOICE_CATALOG) {
    const a = account.get(v.id);
    if (!a) problems.push(`${v.name} (${v.id}) isn't in My Voices — leads given it get the agent's default voice`);
    else if (a.labels?.gender && a.labels.gender !== v.gender) problems.push(`${v.name} (${v.id}) is "${a.name}", labeled ${a.labels.gender}, but the roster says ${v.gender}`);
  }

  console.log(`${VOICE_CATALOG.length} roster voices, ${account.size} voices in the account.`);
  if (problems.length) {
    console.error(`\n✗ ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  ${p}`);
    return 1;
  }
  console.log("✓ every roster voice is in My Voices and matches its gender.");
  return 0;
}

run().then((code) => process.exit(code));
