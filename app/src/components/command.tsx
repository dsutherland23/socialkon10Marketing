import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../lib/theme";

/* ------------------------------------------------------------------
   COMMAND CENTER (PRD §77)
   Keyboard-initiated surface → per motion gate: NO entry animation.
   Appears instantly, like Raycast. Optional launcher, never required
   for navigation.
------------------------------------------------------------------- */

const ACTIONS = [
  { label: "Brand my business", to: "/graphic-design-branding", hint: "/01" },
  { label: "Grow my socials", to: "/social-media-marketing", hint: "/02" },
  { label: "Build my website", to: "/website-design-development", hint: "/03" },
  { label: "View our work", to: "/work", hint: "/work" },
  { label: "Browse packages", to: "/packages", hint: "/pkg" },
  { label: "Get a quote", to: "/start?intent=quote", hint: "/quote" },
  { label: "Book a consultation", to: "/start?intent=consultation", hint: "/call" },
  { label: "Ask a question", to: "/start?intent=question", hint: "/ask" },
] as const;

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { setTheme, resolved } = useTheme();

  const items = [
    ...ACTIONS.filter((a) => a.label.toLowerCase().includes(query.toLowerCase())),
    ...(query.length === 0 || "dark mode theme".includes(query.toLowerCase())
      ? [{ label: `Switch to ${resolved === "dark" ? "light" : "dark"} mode`, to: "__theme", hint: "/ui" } as const]
      : []),
  ];

  useEffect(() => {
    if (open) {
      setQuery(""); setCursor(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, items.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
      if (e.key === "Enter" && items[cursor]) {
        const it = items[cursor];
        onClose();
        if (it.to === "__theme") setTheme(resolved === "dark" ? "light" : "dark");
        else navigate(it.to);
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [open, cursor, items, navigate, onClose, resolved, setTheme]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center pt-[18vh] px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Command menu"
      onClick={onClose}
      style={{ background: "color-mix(in srgb, var(--ink) 40%, transparent)" }}
    >
      <div
        className="w-full max-w-xl border border-[var(--line-strong)]"
        style={{ background: "var(--bg)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-4 rule-b">
          <span className="idx" aria-hidden>⌘</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setCursor(0); }}
            placeholder="What are you looking for?"
            className="w-full bg-transparent outline-none font-meta text-sm placeholder:text-[var(--muted)]"
            aria-label="Search commands"
          />
          <kbd className="font-meta text-[9px] border border-[var(--line)] px-1.5 py-0.5 text-[var(--muted)]">ESC</kbd>
        </div>
        <ul role="listbox" aria-label="Commands" className="max-h-[46vh] overflow-y-auto">
          {items.map((a, i) => (
            <li key={a.label} role="option" aria-selected={i === cursor}>
              <button
                className="w-full flex items-center justify-between px-5 py-3.5 text-left transition-colors"
                style={i === cursor ? { background: "var(--dept)", color: "var(--on-dept)" } : {}}
                onMouseEnter={() => setCursor(i)}
                onClick={() => {
                  onClose();
                  if (a.to === "__theme") setTheme(resolved === "dark" ? "light" : "dark");
                  else navigate(a.to);
                }}
              >
                <span className="font-display text-sm font-semibold uppercase tracking-tight">/ {a.label}</span>
                <span className="font-meta text-[10px] opacity-60">{a.hint}</span>
              </button>
            </li>
          ))}
          {items.length === 0 && (
            <li className="px-5 py-6 font-meta text-[11px] text-[var(--muted)]">No matches — try “quote” or “website”.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
