import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getSettings, type SiteSettings } from "../lib/backend";
import { useMoney } from "../lib/money";
import { effectivePrice, useTemplateFavorites, type Template } from "../lib/templates";

/* ------------------------------------------------------------------
   WATERMARKED PREVIEWS (Templates PRD §9/§10/§39)
   Public previews render behind a repeating diagonal watermark.
   The original design file is never loaded on public pages — previews
   are separate assets (uploaded previews or generated preview art).
------------------------------------------------------------------- */

export function useWatermarkConfig() {
  const [wm, setWm] = useState<NonNullable<SiteSettings["watermark"]>>({});
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const s = await getSettings();
      if (alive) setWm(s.watermark ?? {});
    };
    load();
    window.addEventListener("sk-content-changed", load);
    return () => { alive = false; window.removeEventListener("sk-content-changed", load); };
  }, []);
  return {
    enabled: wm.enabled !== false,
    text: wm.text || "SOCIAL KON10 • PREVIEW",
    opacity: wm.opacity ?? 0.16,
    rotation: wm.rotation ?? -30,
    spacing: wm.spacing ?? 220,
  };
}

/** Repeating diagonal watermark overlay — sits on top of any preview. */
export function Watermark({ className = "" }: { className?: string }) {
  const wm = useWatermarkConfig();
  const patternId = useMemo(() => `wm-${Math.random().toString(36).slice(2, 8)}`, []);
  if (!wm.enabled) return null;
  return (
    <svg className={`absolute inset-0 w-full h-full pointer-events-none ${className}`} aria-hidden="true">
      <defs>
        <pattern id={patternId} width={wm.spacing} height={wm.spacing} patternUnits="userSpaceOnUse"
          patternTransform={`rotate(${wm.rotation})`}>
          <text x="0" y={wm.spacing / 2} fill="currentColor" fillOpacity={wm.opacity}
            style={{ font: "700 15px ui-monospace, monospace", letterSpacing: "0.2em" }}>
            {wm.text}
          </text>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${patternId})`} className="text-white" />
    </svg>
  );
}

/* ---------------- generative preview art ----------------
   Deterministic per-template flyer artwork, so every template has a
   rich preview without shipping stock photography. Admin-uploaded
   preview images take precedence when present. */

function hashSeed(slug: string): number {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) { h ^= slug.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 100000;
}

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function TemplatePreviewArt({ tpl, variant = 0, className = "" }: { tpl: Template; variant?: number; className?: string }) {
  const nodes = useMemo(() => {
    const rnd = mulberry(hashSeed(tpl.slug) + variant * 7919);
    const els: React.ReactNode[] = [];
    const W = 800, H = 1000;
    const hue = tpl.hue;

    if (variant % 3 === 1) {
      // detail shot — oversized cropped typographic block
      for (let i = 0; i < 7; i++) {
        const w = 120 + rnd() * 480;
        els.push(<rect key={i} x={60} y={120 + i * 110} width={w} height={34 + rnd() * 30}
          fill={`hsl(${hue} 70% ${55 + rnd() * 25}% / ${0.25 + rnd() * 0.6})`} />);
      }
    } else if (variant % 3 === 2) {
      // mockup — concentric framing + orbit dots
      for (let i = 0; i < 5; i++) {
        els.push(<rect key={i} x={70 + i * 44} y={90 + i * 56} width={W - 140 - i * 88} height={H - 180 - i * 112}
          fill="none" stroke={`hsl(${hue} 75% ${50 + i * 8}% / 0.55)`} strokeWidth={3} />);
      }
      for (let i = 0; i < 24; i++) {
        els.push(<circle key={`d${i}`} cx={rnd() * W} cy={rnd() * H} r={2 + rnd() * 5}
          fill={`hsl(${hue} 85% 65% / ${0.3 + rnd() * 0.5})`} />);
      }
    } else {
      // hero layout — diagonal energy field + badge
      for (let i = 0; i < 9; i++) {
        const y = i * 130 - 100;
        els.push(<rect key={i} x={-80 + rnd() * 60} y={y} width={W + 160} height={10 + rnd() * 46}
          fill={`hsl(${hue} 65% ${16 + i * 6}%)`} transform={`rotate(-8 400 500)`} />);
      }
      els.push(<circle key="badge" cx={600 + rnd() * 60} cy={170 + rnd() * 60} r={86}
        fill={`hsl(${hue} 85% 55%)`} />);
    }
    return els;
  }, [tpl.slug, tpl.hue, variant]);

  const words = tpl.name.split(" ");
  const line1 = words.slice(0, Math.ceil(words.length / 2)).join(" ");
  const line2 = words.slice(Math.ceil(words.length / 2)).join(" ");

  return (
    <svg viewBox="0 0 800 1000" role="img" aria-label={`${tpl.name} — template preview artwork`}
      className={className} preserveAspectRatio="xMidYMid slice"
      style={{ display: "block", width: "100%", height: "100%", background: `hsl(${tpl.hue} 40% 9%)` }}>
      {nodes}
      <text x="60" y="720" fill="white" style={{ font: "800 72px system-ui, sans-serif", letterSpacing: "-0.02em" }}>
        {line1.toUpperCase()}
      </text>
      {line2 && (
        <text x="60" y="800" fill={`hsl(${tpl.hue} 85% 62%)`} style={{ font: "800 72px system-ui, sans-serif", letterSpacing: "-0.02em" }}>
          {line2.toUpperCase()}
        </text>
      )}
      <text x="60" y="880" fill="white" fillOpacity="0.55" style={{ font: "600 22px ui-monospace, monospace", letterSpacing: "0.3em" }}>
        {tpl.fileFormat} • {tpl.dimensions}
      </text>
      <rect x="1" y="1" width="798" height="998" fill="none" stroke={`hsl(${tpl.hue} 70% 55% / 0.4)`} strokeWidth="2" />
    </svg>
  );
}

/** Watermarked preview: uploaded image when present, generative art otherwise. */
export function TemplatePreview({ tpl, variant = 0, className = "", noWatermark = false }: {
  tpl: Template; variant?: number; className?: string; noWatermark?: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  const rawImg = tpl.previewImages[variant];
  const isDeadBlob = typeof rawImg === "string" && rawImg.startsWith("blob:");
  const img = (!imgError && !isDeadBlob) ? rawImg : undefined;

  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background: `hsl(${tpl.hue} 40% 9%)` }}>
      {img ? (
        <img
          src={img}
          alt={`${tpl.name} preview ${variant + 1}`}
          loading="lazy"
          onError={() => setImgError(true)}
          className="block w-full h-full object-cover"
          draggable={false}
        />
      ) : (
        <TemplatePreviewArt tpl={tpl} variant={variant} />
      )}
      {!noWatermark && <Watermark />}
    </div>
  );
}

/* ---------------- marketplace card (§3) ---------------- */

export function TemplateCard({ tpl, categoryName, onQuickView }: {
  tpl: Template;
  categoryName?: string;
  onQuickView?: (tpl: Template) => void;
}) {
  const money = useMoney();
  const { isFav, toggle } = useTemplateFavorites();
  const free = effectivePrice(tpl) === 0;
  const onSale = tpl.salePrice !== undefined && tpl.salePrice < tpl.price;

  return (
    <article className="group border border-[var(--line)] hover:border-[var(--dept)] transition-colors flex flex-col"
      style={{ background: "var(--panel)" }}>
      <div className="relative">
        <Link to={`/templates/${tpl.slug}`} aria-label={`View ${tpl.name}`}>
          <TemplatePreview tpl={tpl} className="aspect-[4/5]" />
        </Link>
        {/* badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5 items-start">
          {tpl.bestseller && <span className="font-meta text-[8.5px] px-2 py-1 dept-bg" style={{ color: "var(--on-dept)" }}>BESTSELLER</span>}
          {tpl.isNew && <span className="font-meta text-[8.5px] px-2 py-1 border border-white/40 text-white" style={{ background: "rgb(0 0 0 / 0.45)" }}>NEW</span>}
          {onSale && <span className="font-meta text-[8.5px] px-2 py-1 bg-red-600 text-white">SALE</span>}
          {free && <span className="font-meta text-[8.5px] px-2 py-1 bg-emerald-600 text-white">FREE</span>}
        </div>
        {/* favorite */}
        <button
          onClick={() => toggle(tpl.slug)}
          aria-label={isFav(tpl.slug) ? `Remove ${tpl.name} from favorites` : `Save ${tpl.name} to favorites`}
          aria-pressed={isFav(tpl.slug)}
          className="absolute top-3 right-3 w-9 h-9 grid place-items-center border border-white/40 text-white transition-transform hover:scale-110"
          style={{ background: "rgb(0 0 0 / 0.45)" }}
        >
          <svg width="15" height="14" viewBox="0 0 15 14" fill={isFav(tpl.slug) ? "currentColor" : "none"} aria-hidden>
            <path d="M7.5 12.5S1.5 9 1.5 5A3.25 3.25 0 0 1 7.5 3a3.25 3.25 0 0 1 6 2c0 4-6 7.5-6 7.5Z"
              stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
        </button>
        {/* quick view */}
        {onQuickView && (
          <button
            onClick={() => onQuickView(tpl)}
            className="absolute bottom-3 right-3 font-meta text-[9px] px-3 py-2 border border-white/40 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
            style={{ background: "rgb(0 0 0 / 0.55)" }}
          >
            QUICK VIEW
          </button>
        )}
      </div>

      <div className="p-5 flex flex-col gap-1.5 grow">
        <span className="font-meta text-[9px] text-[var(--muted)]">
          {categoryName ?? tpl.category}{tpl.subcategory ? ` / ${tpl.subcategory}` : ""} · {tpl.software.replace("Adobe ", "")} {tpl.fileFormat}
        </span>
        <h3 className="font-display text-base font-bold uppercase leading-tight">
          <Link to={`/templates/${tpl.slug}`} className="hover:text-[var(--dept)] transition-colors">{tpl.name}</Link>
        </h3>
        <div className="mt-auto pt-3 flex items-center justify-between gap-2">
          <p className="font-display font-bold">
            {free ? "Free" : (
              <>
                {onSale && <span className="text-[var(--muted)] line-through font-normal text-sm mr-2">{money(tpl.price)}</span>}
                {money(effectivePrice(tpl))}
              </>
            )}
          </p>
          {tpl.customizeAvailable && (
            <span className="font-meta text-[8.5px] text-[var(--muted)]" title="Our designers can customize this template for you">
              ✦ CUSTOMIZABLE
            </span>
          )}
        </div>
        <div className="flex gap-2 mt-2">
          <Link to={`/templates/${tpl.slug}`} className="btn btn-dept !py-2 !px-3.5 text-center grow">View Template</Link>
        </div>
      </div>
    </article>
  );
}
