/* ------------------------------------------------------------------
   KON10 STUDIO — shared editor UI primitives
   Tip (delayed tooltip, §43), ColorField (custom inline spectrum picker,
   palette, recent + document colors, §12), FontField (font browser with
   lazy webfont loading + recents, §11/§48).
   Includes smart viewport containment to prevent offscreen rendering.
------------------------------------------------------------------- */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ensureFontLoaded, getRecents, normalizeHex, pushRecent,
  FONT_CATALOG, STUDIO_SWATCHES, type FontEntry,
} from "../../lib/editor-studio";

/* ---------------- tooltip ---------------- */

export function Tip({ tip, children, below }: { tip: string; children: ReactNode; below?: boolean }) {
  return <span className={below ? "s-tip s-tip-b" : "s-tip"} data-tip={tip}>{children}</span>;
}

/* ---------------- popover shell with viewport clamping ---------------- */

function usePopover(estimatedWidth = 248, estimatedHeight = 380) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isInteractingRef = useRef(false);
  const [coords, setCoords] = useState<{ top?: number; bottom?: number; left: number; maxHeight: number }>({
    left: 12,
    maxHeight: 380,
  });

  const updatePosition = useCallback(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 16;
    const spaceAbove = rect.top - 16;
    const placeAbove = spaceBelow < 280 && spaceAbove > spaceBelow;

    let left = rect.left;
    if (left + estimatedWidth > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - estimatedWidth - 12);
    }
    if (left < 12) left = 12;

    if (placeAbove) {
      setCoords({
        bottom: window.innerHeight - rect.top + 6,
        left,
        maxHeight: Math.min(spaceAbove, estimatedHeight),
      });
    } else {
      setCoords({
        top: rect.bottom + 6,
        left,
        maxHeight: Math.min(spaceBelow, estimatedHeight),
      });
    }
  }, [estimatedWidth, estimatedHeight]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const close = (e: MouseEvent) => {
      if (isInteractingRef.current) return;
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const handleResize = () => updatePosition();
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleResize, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize, true);
    };
  }, [open, updatePosition]);

  return { open, setOpen, ref, isInteractingRef, coords };
}

/* ---------------- HSV / Hex Math Utilities ---------------- */

function hsvToHex(h: number, s: number, v: number): string {
  let r = 0, g = 0, b = 0;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const norm = normalizeHex(hex) ?? "#ffffff";
  const r = parseInt(norm.slice(1, 3), 16) / 255;
  const g = parseInt(norm.slice(3, 5), 16) / 255;
  const b = parseInt(norm.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;

  if (max !== min) {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h, s, v };
}

/* ---------------- color field (§12) ---------------- */

export function ColorField({
  label, value, onChange, disabled, docColors = [], compact = false,
}: {
  label?: string;
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
  docColors?: string[];
  compact?: boolean;
}) {
  const { open, setOpen, ref, isInteractingRef, coords } = usePopover(248, 390);
  const current = normalizeHex(value) ?? "#ffffff";
  const [hsv, setHsv] = useState(() => hexToHsv(current));
  const [hexInput, setHexInput] = useState(current);

  const satBoxRef = useRef<HTMLDivElement>(null);
  const hueSliderRef = useRef<HTMLDivElement>(null);

  // Sync HSV when external value changes
  useEffect(() => {
    const norm = normalizeHex(value) ?? "#ffffff";
    setHsv(hexToHsv(norm));
    setHexInput(norm);
  }, [value]);

  const commit = useCallback((newHex: string) => {
    const n = normalizeHex(newHex);
    if (!n) return;
    setHexInput(n);
    onChange(n);
    pushRecent("colors", n);
  }, [onChange]);

  // Saturation / Value 2D Box Drag Handler
  const handleSatBoxMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!satBoxRef.current) return;
    isInteractingRef.current = true;

    const updateSatVal = (moveEvent: MouseEvent | React.MouseEvent) => {
      if (!satBoxRef.current) return;
      const rect = satBoxRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, moveEvent.clientX - rect.left));
      const y = Math.max(0, Math.min(rect.height, moveEvent.clientY - rect.top));

      const newS = x / rect.width;
      const newV = 1 - y / rect.height;

      setHsv((prev) => {
        const next = { ...prev, s: newS, v: newV };
        const newColor = hsvToHex(next.h, next.s, next.v);
        commit(newColor);
        return next;
      });
    };

    updateSatVal(e);

    const onMouseMove = (moveEv: MouseEvent) => {
      updateSatVal(moveEv);
    };

    const onMouseUp = () => {
      isInteractingRef.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  // Hue Slider Drag Handler
  const handleHueSliderMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!hueSliderRef.current) return;
    isInteractingRef.current = true;

    const updateHue = (moveEvent: MouseEvent | React.MouseEvent) => {
      if (!hueSliderRef.current) return;
      const rect = hueSliderRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, moveEvent.clientX - rect.left));
      const newH = x / rect.width;

      setHsv((prev) => {
        const next = { ...prev, h: newH };
        const newColor = hsvToHex(next.h, next.s, next.v);
        commit(newColor);
        return next;
      });
    };

    updateHue(e);

    const onMouseMove = (moveEv: MouseEvent) => {
      updateHue(moveEv);
    };

    const onMouseUp = () => {
      isInteractingRef.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const recents = getRecents("colors");
  const pureHueHex = hsvToHex(hsv.h, 1, 1);

  return (
    <div className="relative" ref={ref}>
      {label && <span className="s-label">{label}</span>}
      {compact ? (
        <button
          type="button"
          disabled={disabled}
          className={"s-icon-btn relative grid place-items-center" + (disabled ? " opacity-35 pointer-events-none" : "")}
          onClick={() => setOpen(!open)}
          aria-label={label ?? "Choose color"}
        >
          <span className="w-4 h-4 rounded-full border border-white/40 shadow" style={{ background: current }} />
        </button>
      ) : (
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
      )}

      {open && (
        <div
          className="fixed s-pop w-[248px] z-[300] shadow-2xl backdrop-blur-xl border border-white/20 rounded-2xl p-3 flex flex-col gap-2.5 overflow-y-auto"
          style={{
            top: coords.top,
            bottom: coords.bottom,
            left: coords.left,
            maxHeight: coords.maxHeight,
            background: "var(--s-panel2, #18181b)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Interactive 2D Saturation/Value Box */}
          <div
            ref={satBoxRef}
            onMouseDown={handleSatBoxMouseDown}
            className="w-full h-[110px] rounded-xl relative cursor-crosshair overflow-hidden shadow-inner select-none border border-white/10 shrink-0"
            style={{
              backgroundColor: pureHueHex,
              backgroundImage: `linear-gradient(to right, #fff, transparent), linear-gradient(to top, #000, transparent)`,
            }}
          >
            {/* Draggable Circle Indicator */}
            <div
              className="w-3.5 h-3.5 rounded-full border-2 border-white shadow-md pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${Math.round(hsv.s * 100)}%`,
                top: `${Math.round((1 - hsv.v) * 100)}%`,
                backgroundColor: current,
              }}
            />
          </div>

          {/* Draggable Hue Rainbow Slider Bar */}
          <div
            ref={hueSliderRef}
            onMouseDown={handleHueSliderMouseDown}
            className="w-full h-4 rounded-full relative cursor-pointer shadow-inner select-none border border-white/10 shrink-0"
            style={{
              backgroundImage: `linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)`,
            }}
          >
            {/* Slider Thumb */}
            <div
              className="w-4 h-4 rounded-full border-2 border-white shadow-lg pointer-events-none absolute top-0 -translate-x-1/2"
              style={{
                left: `${Math.round(hsv.h * 100)}%`,
                backgroundColor: pureHueHex,
              }}
            />
          </div>

          {/* Color Preview & Hex Input */}
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg border border-white/20 shadow shrink-0" style={{ background: current }} />
            <input
              className="s-input !py-1.5 font-meta text-[11px] uppercase font-bold"
              value={hexInput}
              aria-label="Hex value"
              onChange={(e) => {
                setHexInput(e.target.value);
                const norm = normalizeHex(e.target.value);
                if (norm) {
                  setHsv(hexToHsv(norm));
                  onChange(norm);
                }
              }}
              onBlur={() => commit(hexInput)}
              onKeyDown={(e) => { if (e.key === "Enter") commit(hexInput); }}
            />
            {"EyeDropper" in window && (
              <button
                type="button"
                className="s-btn s-btn-line !py-1 !px-2 shrink-0"
                title="Pick color from screen"
                onClick={async () => {
                  try {
                    const dropper = new (window as unknown as { EyeDropper: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper();
                    const r = await dropper.open();
                    commit(r.sRGBHex);
                  } catch { /* cancelled */ }
                }}
              >
                <span>💉</span>
              </button>
            )}
          </div>

          {/* Quick Swatches */}
          <div>
            <span className="s-label !mb-1 text-[9.5px]">Palette</span>
            <div className="flex flex-wrap gap-1">
              {STUDIO_SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="s-swatch !w-5 !h-5 border border-white/10 hover:scale-110 transition-transform"
                  style={{ background: c }}
                  aria-label={`Use ${c}`}
                  onClick={() => commit(c)}
                />
              ))}
            </div>
          </div>

          {docColors.length > 0 && (
            <div>
              <span className="s-label !mb-1 text-[9.5px]">In this design</span>
              <div className="flex flex-wrap gap-1">
                {docColors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="s-swatch !w-5 !h-5 border border-white/10 hover:scale-110 transition-transform"
                    style={{ background: c }}
                    aria-label={`Use ${c}`}
                    onClick={() => commit(c)}
                  />
                ))}
              </div>
            </div>
          )}

          {recents.length > 0 && (
            <div>
              <span className="s-label !mb-1 text-[9.5px]">Recent</span>
              <div className="flex flex-wrap gap-1">
                {recents.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="s-swatch !w-5 !h-5 border border-white/10 hover:scale-110 transition-transform"
                    style={{ background: c }}
                    aria-label={`Use ${c}`}
                    onClick={() => commit(c)}
                  />
                ))}
              </div>
            </div>
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
  const { open, setOpen, ref, coords } = usePopover(248, 380);
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
        <div
          className="fixed s-pop w-[248px] z-[300] shadow-2xl backdrop-blur-xl border border-white/20 rounded-2xl p-3 flex flex-col gap-2 overflow-y-auto"
          style={{
            top: coords.top,
            bottom: coords.bottom,
            left: coords.left,
            maxHeight: coords.maxHeight,
            background: "var(--s-panel2, #18181b)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            autoFocus
            className="s-input !py-1.5 mb-1"
            placeholder="Search fonts…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search fonts"
          />
          <div className="s-scroll max-h-[260px] overflow-y-auto pr-1 flex flex-col gap-0.5">
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
