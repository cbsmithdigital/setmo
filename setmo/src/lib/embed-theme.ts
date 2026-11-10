// The look of the embedded partner call (/embed/<token>): the partner's accent
// on buttons and highlights, and an optional background. No background keeps
// SetMo's dark screen exactly as it is; a light background switches the whole
// page to a light palette (dark text, white cards), set on :root so the page
// background, the body and the browser's color scheme all match from the first
// paint — the frame never flashes black.
//
// Colors come from the partner's settings, which only accept #RRGGBB, and are
// checked again here before they're written into the page's CSS.

type Rgb = [number, number, number];

export const isHexColor = (c: string | null | undefined): c is string => typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c);

function rgbOf(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Move a color toward white (255) or black (0) by `amount` (0–1). */
const mix = (rgb: Rgb, target: number, amount: number) =>
  "#" + rgb.map((c) => Math.round(c + (target - c) * amount).toString(16).padStart(2, "0")).join("");

/** WCAG relative luminance, 0 (black) to 1 (white). */
function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Light enough that dark text reads better on it than white text. */
export const isLightColor = (hex: string) => luminance(rgbOf(hex)) > 0.4;

export type EmbedLook = { accent: string | null; background: string | null };

/** The page's color scheme and browser theme color for this look. */
export function embedViewport(look: EmbedLook): { colorScheme: "light" | "dark"; themeColor: string } {
  const bg = isHexColor(look.background) ? look.background : null;
  return bg && isLightColor(bg) ? { colorScheme: "light", themeColor: bg } : { colorScheme: "dark", themeColor: bg ?? "#08080f" };
}

/** The CSS for this look, or "" for SetMo's default (dark, purple). */
export function embedThemeCss(look: EmbedLook): string {
  const accent = isHexColor(look.accent) ? look.accent : null;
  const bg = isHexColor(look.background) ? look.background : null;
  const light = Boolean(bg && isLightColor(bg));
  const rules: string[] = [];
  const root: string[] = [];

  if (accent) {
    const rgb = rgbOf(accent);
    const a = rgb.join(",");
    // On a light page the text-weight shade of the accent is darker, not lighter.
    const textShade = light ? mix(rgb, 0, 0.12) : mix(rgb, 255, 0.3);
    const deep = mix(rgb, 0, 0.18);
    root.push(
      `--purple:${accent}`,
      `--purple-2:${textShade}`,
      `--purple-deep:${deep}`,
      `--grad:linear-gradient(135deg,${accent},${deep})`,
      `--grad-num:linear-gradient(135deg,${textShade},${deep})`,
      `--glow:0 14px 40px -18px rgba(${a},${light ? 0.35 : 0.5})`,
      `--accent-rgb:${a}`
    );
    rules.push(
      `.chip.purple{background:rgba(${a},.12);border-color:rgba(${a},.32)}`,
      `.wf i{background:linear-gradient(180deg,var(--purple-2),var(--purple-deep))}`,
      `.btn-primary:hover{box-shadow:0 18px 44px -16px rgba(${a},.6)}`,
      `::selection{background:rgba(${a},.28)}`,
      `.call-glow{background:radial-gradient(circle,rgba(${a},${light ? 0.12 : 0.18}),transparent 65%)}`,
      `.card-glow::before{background:radial-gradient(120% 80% at 90% 0%,rgba(${a},${light ? 0.07 : 0.12}),transparent 55%)}`
    );
  }

  if (bg && light) {
    root.push(
      "color-scheme:light",
      `--bg:${bg}`,
      "--s1:#f8fafc",
      "--s2:#ffffff",
      "--s3:#edf1f5",
      "--s4:#e2e8ee",
      "--line:#d8e0e7",
      "--line-soft:#e6ecf1",
      "--text:#0f172a",
      "--text-2:#334155",
      "--text-strong:#0f172a",
      "--muted:#526173",
      "--faint:#64748b",
      "--mint:#047857",
      "--mint-deep:#065f46",
      "--amber:#b45309",
      "--rose:#be123c",
      "--error:#dc2626",
      "--danger-text:#b91c1c",
      "--ring-track:#e2e8ee",
      "--shadow-card:0 1px 2px rgba(15,23,42,.06),0 10px 28px -14px rgba(15,23,42,.16)"
    );
    rules.push(
      "html,body{background:var(--bg)}",
      "h1,h2,h3,h4{color:var(--text-strong)}",
      ".app-bg{background:none}",
      ".skill .track{background:var(--s4)}",
      // The score ring's track is drawn #1a1a2e (components/ui/widgets); CSS
      // outranks an SVG attribute, so the light page gets a light track here.
      'svg circle[stroke="#1a1a2e"]{stroke:var(--ring-track)}',
      ".mint-text{background:linear-gradient(135deg,#059669,#047857);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}",
      ".chip.mint{background:rgba(4,120,87,.08);border-color:rgba(4,120,87,.25)}",
      ".chip.amber{background:rgba(180,83,9,.08);border-color:rgba(180,83,9,.25)}",
      ".chip.rose{background:rgba(190,18,60,.07);border-color:rgba(190,18,60,.22)}",
      ".banner.error{color:#b91c1c}",
      ".banner.mint{color:var(--mint)}",
      "::-webkit-scrollbar-thumb{background:#c7d2dc;border-color:var(--bg)}"
    );
  } else if (bg) {
    // A dark background of the partner's choosing: same dark palette, their shade.
    root.push(`--bg:${bg}`);
    rules.push("html,body{background:var(--bg)}");
  }

  if (!root.length && !rules.length) return "";
  return `:root{${root.join(";")}}\n${rules.join("\n")}`;
}
