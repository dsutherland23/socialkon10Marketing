/* ------------------------------------------------------------------
   KON10 STUDIO — shared design data + helpers (PRD §11–§13, §18, §39, §48)
   Curated font catalog with lazy loading, recent-items store, color
   utilities, element library metadata, and the pre-export quality check.
   Pure data + DOM helpers; no Fabric imports here.
------------------------------------------------------------------- */

/* ---------------- fonts (§11) ---------------- */

export interface FontEntry {
  label: string;
  family: string;   // primary family name (Google Fonts unless system)
  stack: string;    // full CSS font-family value used on canvas objects
  category: "Sans" | "Serif" | "Display" | "Script" | "Mono";
  system?: boolean; // no webfont fetch needed
}

export const FONT_CATALOG: FontEntry[] = [
  { label: "Archivo", family: "Archivo", stack: "Archivo, sans-serif", category: "Sans" },
  { label: "Instrument Sans", family: "Instrument Sans", stack: "Instrument Sans, sans-serif", category: "Sans" },
  { label: "Inter", family: "Inter", stack: "Inter, sans-serif", category: "Sans" },
  { label: "Montserrat", family: "Montserrat", stack: "Montserrat, sans-serif", category: "Sans" },
  { label: "Poppins", family: "Poppins", stack: "Poppins, sans-serif", category: "Sans" },
  { label: "Work Sans", family: "Work Sans", stack: "Work Sans, sans-serif", category: "Sans" },
  { label: "DM Sans", family: "DM Sans", stack: "DM Sans, sans-serif", category: "Sans" },
  { label: "Oswald", family: "Oswald", stack: "Oswald, sans-serif", category: "Sans" },
  { label: "Arial", family: "Arial", stack: "Arial, sans-serif", category: "Sans", system: true },
  { label: "Playfair Display", family: "Playfair Display", stack: "Playfair Display, serif", category: "Serif" },
  { label: "Libre Baskerville", family: "Libre Baskerville", stack: "Libre Baskerville, serif", category: "Serif" },
  { label: "DM Serif Display", family: "DM Serif Display", stack: "DM Serif Display, serif", category: "Serif" },
  { label: "Georgia", family: "Georgia", stack: "Georgia, serif", category: "Serif", system: true },
  { label: "Times New Roman", family: "Times New Roman", stack: "Times New Roman, serif", category: "Serif", system: true },
  { label: "Bebas Neue", family: "Bebas Neue", stack: "Bebas Neue, sans-serif", category: "Display" },
  { label: "Anton", family: "Anton", stack: "Anton, sans-serif", category: "Display" },
  { label: "Righteous", family: "Righteous", stack: "Righteous, sans-serif", category: "Display" },
  { label: "Bungee", family: "Bungee", stack: "Bungee, sans-serif", category: "Display" },
  { label: "Space Grotesk", family: "Space Grotesk", stack: "Space Grotesk, sans-serif", category: "Display" },
  { label: "Dancing Script", family: "Dancing Script", stack: "Dancing Script, cursive", category: "Script" },
  { label: "Pacifico", family: "Pacifico", stack: "Pacifico, cursive", category: "Script" },
  { label: "Caveat", family: "Caveat", stack: "Caveat, cursive", category: "Script" },
  { label: "Space Mono", family: "Space Mono", stack: "Space Mono, monospace", category: "Mono" },
  { label: "JetBrains Mono", family: "JetBrains Mono", stack: "JetBrains Mono, monospace", category: "Mono" },
  { label: "Courier New", family: "Courier New", stack: "Courier New, monospace", category: "Mono", system: true },
];

const fontRequested = new Set<string>();

/** Lazily load a Google Font and wait until the browser can render it. */
export async function ensureFontLoaded(entry: FontEntry): Promise<void> {
  if (entry.system) return;
  if (!fontRequested.has(entry.family)) {
    fontRequested.add(entry.family);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(entry.family).replace(/%20/g, "+")}:wght@400;700;800&display=swap`;
    document.head.appendChild(link);
  }
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load(`400 24px "${entry.family}"`),
        document.fonts.load(`700 24px "${entry.family}"`),
        document.fonts.load(`800 24px "${entry.family}"`),
      ]),
      new Promise((r) => setTimeout(r, 2600)), // offline guard — fall back silently
    ]);
  } catch { /* offline or blocked — canvas falls back to the stack's generic family */ }
}

/* ---------------- recent items (§48) ---------------- */

const RECENT_KEY = (kind: string) => `sk-studio-recent-${kind}`;

export function getRecents(kind: "fonts" | "colors"): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY(kind));
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(arr) ? arr.slice(0, 8) : [];
  } catch { return []; }
}

export function pushRecent(kind: "fonts" | "colors", value: string): void {
  try {
    const arr = getRecents(kind).filter((v) => v !== value);
    arr.unshift(value);
    localStorage.setItem(RECENT_KEY(kind), JSON.stringify(arr.slice(0, 8)));
  } catch { /* storage full/blocked — recents are best-effort */ }
}

/* ---------------- colors (§12/§13) ---------------- */

export const STUDIO_SWATCHES = [
  "#ffffff", "#f4f1ea", "#d8d4c8", "#9a9aa4", "#4a4a52", "#16161a", "#000000",
  "#ef4444", "#f97316", "#f59e0b", "#facc15", "#84cc16", "#22c55e", "#10b981",
  "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#ec4899", "#f43f5e",
];

/** Normalize a color string to #rrggbb — hex, rgb(), rgba(), hsl(), hsla() — or null. */
export function normalizeHex(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  const m = s.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})/);
  if (m) {
    let h = m[1].toLowerCase();
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    return `#${h}`;
  }
  const rgb = s.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  if (rgb) {
    const to = (n: string) => Math.max(0, Math.min(255, Math.round(Number(n)))).toString(16).padStart(2, "0");
    return `#${to(rgb[1])}${to(rgb[2])}${to(rgb[3])}`;
  }
  const hsl = s.match(/^hsla?\(\s*([\d.]+)(?:deg)?[,\s]+([\d.]+)%[,\s]+([\d.]+)%/);
  if (hsl) {
    const h = (((Number(hsl[1]) % 360) + 360) % 360) / 360;
    const sat = Number(hsl[2]) / 100, l = Number(hsl[3]) / 100;
    const to = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, "0");
    if (sat === 0) return `#${to(l)}${to(l)}${to(l)}`;
    const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
    const p = 2 * l - q;
    const hue = (t0: number) => {
      let t = t0;
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return `#${to(hue(h + 1 / 3))}${to(hue(h))}${to(hue(h - 1 / 3))}`;
  }
  return null;
}

/* ---------------- element library (§18) ---------------- */

export type ElementKind =
  | "rect" | "rounded" | "circle" | "ellipse" | "triangle" | "pill" | "diamond" | "ring" | "cross"
  | "line" | "dash"
  | "arrow-r" | "arrow-l" | "arrow-u" | "arrow-d"
  | "star" | "burst" | "chevron";

export interface ElementItem { kind: ElementKind; name: string; category: "Shapes" | "Lines" | "Arrows" | "Badges" }

export const ELEMENTS: ElementItem[] = [
  { kind: "rect", name: "Rectangle", category: "Shapes" },
  { kind: "rounded", name: "Rounded card", category: "Shapes" },
  { kind: "circle", name: "Circle", category: "Shapes" },
  { kind: "ellipse", name: "Ellipse", category: "Shapes" },
  { kind: "triangle", name: "Triangle", category: "Shapes" },
  { kind: "pill", name: "Pill", category: "Shapes" },
  { kind: "diamond", name: "Diamond", category: "Shapes" },
  { kind: "ring", name: "Ring", category: "Shapes" },
  { kind: "cross", name: "Plus", category: "Shapes" },
  { kind: "line", name: "Line", category: "Lines" },
  { kind: "dash", name: "Dashed line", category: "Lines" },
  { kind: "arrow-r", name: "Arrow right", category: "Arrows" },
  { kind: "arrow-l", name: "Arrow left", category: "Arrows" },
  { kind: "arrow-u", name: "Arrow up", category: "Arrows" },
  { kind: "arrow-d", name: "Arrow down", category: "Arrows" },
  { kind: "star", name: "Star", category: "Badges" },
  { kind: "burst", name: "Burst", category: "Badges" },
  { kind: "chevron", name: "Chevron", category: "Badges" },
];

/** Star/burst polygon points, centered on (0,0). */
export function starPoints(spikes: number, outerR: number, innerR: number): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = (Math.PI * i) / spikes - Math.PI / 2;
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return pts;
}

/* ---------------- design quality check (§39) ---------------- */

export interface DesignCheck { level: "ok" | "warn"; msg: string }

interface CheckableObject {
  type?: string;
  left?: number; top?: number; angle?: number;
  visible?: boolean;
  text?: string;
  fontFamily?: string;
  getBoundingRect: () => { left: number; top: number; width: number; height: number };
  getScaledWidth: () => number;
  getScaledHeight: () => number;
  getElement?: () => { naturalWidth?: number; naturalHeight?: number } | undefined;
}

export function runDesignChecks(objects: CheckableObject[], W: number, H: number): DesignCheck[] {
  const out: DesignCheck[] = [];
  const marginX = W * 0.05, marginY = H * 0.05;

  const live = objects.filter((o) => o.visible !== false && !/^activeselection$/i.test(o.type ?? ""));

  // objects outside canvas
  const outside = live.filter((o) => {
    const r = o.getBoundingRect();
    return r.left > W + 2 || r.top > H + 2 || r.left + r.width < -2 || r.top + r.height < -2;
  });
  out.push(outside.length
    ? { level: "warn", msg: `${outside.length} object${outside.length > 1 ? "s are" : " is"} outside the canvas` }
    : { level: "ok", msg: "All objects inside the canvas" });

  // text outside safe area
  const unsafeText = live.filter((o) => {
    if (!/^(textbox|itext|text)$/i.test(o.type ?? "")) return false;
    const r = o.getBoundingRect();
    return r.left < marginX || r.top < marginY || r.left + r.width > W - marginX || r.top + r.height > H - marginY;
  });
  out.push(unsafeText.length
    ? { level: "warn", msg: `${unsafeText.length} text element${unsafeText.length > 1 ? "s" : ""} outside the safe area` }
    : { level: "ok", msg: "All text inside safe area" });

  // low-resolution images (source smaller than ~1.5× its placed size)
  const lowRes = live.filter((o) => {
    if (!/^(fabricimage|image)$/i.test(o.type ?? "")) return false;
    const el = o.getElement?.();
    if (!el?.naturalWidth) return false;
    return el.naturalWidth < o.getScaledWidth() * 1.5;
  });
  out.push(lowRes.length
    ? { level: "warn", msg: `${lowRes.length} image${lowRes.length > 1 ? "s" : ""} may print blurry (low resolution)` }
    : { level: "ok", msg: "Images are sharp enough for export" });

  // missing fonts
  const missingFonts = new Set<string>();
  live.forEach((o) => {
    if (!/^(textbox|itext|text)$/i.test(o.type ?? "") || !o.fontFamily) return;
    const family = o.fontFamily.split(",")[0].trim().replace(/^["']|["']$/g, "");
    if (family && !document.fonts.check(`16px "${family}"`)) missingFonts.add(family);
  });
  out.push(missingFonts.size
    ? { level: "warn", msg: `Font not loaded: ${[...missingFonts].join(", ")}` }
    : { level: "ok", msg: "All fonts loaded" });

  return out;
}
