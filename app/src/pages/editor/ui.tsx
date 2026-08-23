/* ------------------------------------------------------------------
   KON10 STUDIO — shared editor UI primitives
   Tip (delayed tooltip, §43), ColorField (color popover with palette,
   recent + document colors, §12), FontField (font browser with lazy
   webfont loading + recents, §11/§48).
------------------------------------------------------------------- */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ensureFontLoaded, getRecents, normalizeHex, pushRecent,
  FONT_CATALOG, STUDIO_SWATCHES, type FontEntry,
} from "../../lib/editor-studio";

/* ---------------- tooltip ---------------- */

export function Tip({ tip, children, below }: { tip: string; children: ReactNode; below?: boolean }) {
  return <span className={below ? "s-tip s-tip-b" : "s-tip"} data-tip={tip}>{children}</span>;
}

/* ---------------- popover shell ---------------- */

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  return { open, setOpen, ref };
}

/* ---------------- color field (§12) ---------------- */

export function ColorField({
  label, value, onChange, disabled, docColors = [],
}: {
  label?: string;
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
  docColors?: string[];
}) {
  const { open, setOpen, ref } = usePopover();
  const current = normalizeHex(value) ?? "#ffffff";
  const [hex, setHex] = useState(current);
  useEffect(() => { setHex(normalizeHex(value) ?? "#ffffff"); }, [value]);

  const commit = (h: string) => {
    const n = normalizeHex(h);
    if (!n) return;
    onChange(n);
    pushRecent("colors", n);
  };
  const recents = getRecents("colors");

  return (
    <div className="relative" ref={ref}>
      {label && <span className="s-label">{label}</span>}
      <button
        type="button"
        disabled={disabled}
        className="s-list-btn !py-[7px]"
        onClick={() => setOpen(!open)}
        aria-label={label ?? "Choose color"}
      >
        <span className="s-swatch" style={{ background: current }} />
        <span className="font-meta text-[10px] uppercase tracking-wider">{current}</span>
      </button>
      {open && (
        <div className="s-popover s-pop left-0 top-full mt-1.5 w-[228px]">
          <div className="flex items-center gap-2 mb-2.5">
            <input
              type="color"
              value={current}
              aria-label="Custom color"
              className="w-9 h-9 rounded-md cursor-pointer bg-transparent border border-[var(--s-line2)]"
              onChange={(e) => { setHex(e.target.value); commit(e.target.value); }}
            />
            <input
              className="s-input !py-1.5 font-meta text-[11px] uppercase"
              value={hex}
              aria-label="Hex value"
              onChange={(e) => setHex(e.target.value)}
              onBlur={() => commit(hex)}
              onKeyDown={(e) => { if (e.key === "Enter") commit(hex); }}
            />
          </div>
          {docColors.length > 0 && (
            <>
              <span className="s-label">In this design</span>
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {docColors.map((c) => (
                  <button key={c} className="s-swatch" style={{ background: c }} aria-label={`Use ${c}`}
                    onClick={() => { commit(c); setOpen(false); }} />
                ))}
              </div>
            </>
          )}
          {recents.length > 0 && (
            <>
              <span className="s-label">Recent</span>
              <div className="flex flex-wrap gap-1.5 mb-2.5">
                {recents.map((c) => (
                  <button key={c} className="s-swatch" style={{ background: c }} aria-label={`Use ${c}`}
                    onClick={() => { commit(c); setOpen(false); }} />
                ))}
              </div>
            </>
          )}
          <span className="s-label">Palette</span>
          <div className="flex flex-wrap gap-1.5">
            {STUDIO_SWATCHES.map((c) => (
              <button key={c} className="s-swatch" style={{ background: c }} aria-label={`Use ${c}`}
                onClick={() => { commit(c); setOpen(false); }} />
            ))}
          </div>
          {"EyeDropper" in window && (
            <button
              type="button"
              className="s-btn s-btn-line w-full mt-2.5"
              onClick={async () => {
                try {
                  const dropper = new (window as unknown as { EyeDropper: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper();
                  const r = await dropper.open();
                  commit(r.sRGBHex);
                  setOpen(false);
                } catch { /* user cancelled the eyedropper */ }
              }}
            >
              Pick from screen (eyedropper)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- font browser (§11) ---------------- */

const FONT_CATEGORIES = ["Sans", "Serif", "Display", "Script", "Mono"] as const;

export function FontField({
  value, disabled, onChange,
}: {
  value?: string;
  disabled?: boolean;
  onChange: (stack: string, entry: FontEntry) => void;
}) {
  const { open, setOpen, ref } = usePopover();
  const [q, setQ] = useState("");
  const current = FONT_CATALOG.find((f) => f.stack === value) ?? null;
  const recents = useMemo(
    () => getRecents("fonts").map((s) => FONT_CATALOG.find((f) => f.stack === s)).filter((f): f is FontEntry => !!f),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open],
  );

  const pick = async (f: FontEntry) => {
    setOpen(false);
    await ensureFontLoaded(f);
    pushRecent("fonts", f.stack);
    onChange(f.stack, f);
  };

  const visible = FONT_CATALOG.filter((f) => f.label.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        className="s-list-btn !py-[7px] justify-between"
        onClick={() => setOpen(!open)}
        aria-label="Choose font"
      >
        <span className="truncate text-[12.5px]" style={{ fontFamily: value }}>{current?.label ?? value ?? "Font"}</span>
        <span className="text-[var(--s-muted)] text-[10px]">▾</span>
      </button>
      {open && (
        <div className="s-popover s-pop left-0 top-full mt-1.5 w-[248px]">
          <input
            autoFocus
            className="s-input !py-1.5 mb-2"
            placeholder="Search fonts…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search fonts"
          />
          <div className="s-scroll max-h-[280px] overflow-y-auto pr-1 flex flex-col gap-0.5">
            {!q && recents.length > 0 && (
              <>
                <span className="s-label mt-1">Recent</span>
                {recents.map((f) => <FontRow key={`r-${f.stack}`} f={f} onPick={pick} />)}
              </>
            )}
            {FONT_CATEGORIES.map((cat) => {
              const list = visible.filter((f) => f.category === cat);
              if (!list.length) return null;
              return (
                <div key={cat}>
                  <span className="s-label mt-2">{cat}</span>
                  {list.map((f) => <FontRow key={f.stack} f={f} onPick={pick} />)}
                </div>
              );
            })}
            {!visible.length && <p className="text-[12px] text-[var(--s-muted)] py-3 text-center">No fonts match "{q}"</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function FontRow({ f, onPick }: { f: FontEntry; onPick: (f: FontEntry) => void }) {
  return (
    <button
      type="button"
      className="w-full text-left px-2.5 py-[7px] rounded-md text-[14px] text-[var(--s-text)] hover:bg-[var(--s-hover)] transition-colors"
      style={{ fontFamily: f.stack }}
      onMouseEnter={() => void ensureFontLoaded(f)} // lazy-load the preview font
      onClick={() => void onPick(f)}
    >
      {f.label}
    </button>
  );
}

/* ---------------- small switch ---------------- */

export function Toggle({ label, on, onChange, disabled }: { label: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="flex items-center justify-between w-full py-1.5 text-[12.5px] text-[var(--s-text)] disabled:opacity-40"
    >
      {label}
      <span
        className="w-8 h-[18px] rounded-full relative transition-colors"
        style={{ background: on ? "var(--dept)" : "var(--s-hover)" }}
      >
        <span
          className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-all"
          style={{ left: on ? 16 : 2 }}
        />
      </span>
    </button>
  );
}
