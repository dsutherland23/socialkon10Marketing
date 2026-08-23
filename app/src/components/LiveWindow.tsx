import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { track } from "../lib/seo";

/* ------------------------------------------------------------------
   LIVE WINDOW — contained live-site preview.

   A browser-chrome modal that iframes a sample site with a strict
   sandbox: no allow-top-navigation, no allow-popups — the preview can
   never navigate or replace the parent site. Device switcher shows
   responsive behaviour. Falls back gracefully when the target blocks
   embedding (X-Frame-Options / frame-ancestors).
------------------------------------------------------------------- */

type Device = "desktop" | "tablet" | "mobile";

const DEVICES: { id: Device; label: string; width: number }[] = [
  { id: "desktop", label: "Desktop", width: 1240 },
  { id: "tablet", label: "Tablet", width: 768 },
  { id: "mobile", label: "Mobile", width: 390 },
];

export function LiveWindow({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  const [device, setDevice] = useState<Device>("desktop");
  const [loaded, setLoaded] = useState(false);
  const [slowHint, setSlowHint] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const host = useMemo(() => {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
  }, [url]);

  // Esc to close, focus management, body scroll lock
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    track("live_preview_open", { title, host });
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If the frame hasn't signalled load after 8s, show the embedding hint
  useEffect(() => {
    if (loaded) return;
    const t = window.setTimeout(() => setSlowHint(true), 8000);
    return () => window.clearTimeout(t);
  }, [loaded]);

  const width = DEVICES.find((d) => d.id === device)!.width;

  // Portal to body: fixed positioning must not be trapped by transformed
  // ancestors (e.g. the page-enter route transition wrapper).
  return createPortal(
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center p-3 md:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Live preview of ${title}`}
    >
      {/* backdrop */}
      <button
        aria-label="Close preview"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        style={{ background: "rgba(12,12,15,0.62)", backdropFilter: "blur(6px)", animation: "sk-lw-fade 200ms var(--ease-out) both" }}
      />

      {/* window */}
      <div
        className="relative flex flex-col border border-[var(--line-strong)] shadow-2xl"
        style={{
          background: "var(--bg)",
          width: `min(${width}px, 96vw)`,
          height: "min(82vh, 900px)",
          transition: "width 300ms var(--ease-out)",
          animation: "sk-lw-in 240ms var(--ease-out) both",
        }}
      >
        {/* chrome bar */}
        <div className="flex items-center gap-3 px-3 md:px-4 h-11 border-b border-[var(--line-strong)] shrink-0" style={{ background: "var(--panel)" }}>
          <span className="flex gap-1.5" aria-hidden>
            <i className="w-2.5 h-2.5 border border-[var(--line-strong)]" />
            <i className="w-2.5 h-2.5 border border-[var(--line-strong)]" />
            <i className="w-2.5 h-2.5 dept-bg" />
          </span>
          <span className="font-meta text-[10px] truncate flex-1 min-w-0 px-3 py-1 border border-[var(--line)]" style={{ background: "var(--bg)" }}>
            {host}
          </span>
          <span className="hidden sm:inline font-meta text-[9px] dept-accent shrink-0">DEMO — CONTAINED</span>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:inline font-meta text-[10px] u-line shrink-0"
            onClick={() => track("live_preview_open_live", { title, host })}
          >
            Open live ↗
          </a>
          <button ref={closeRef} onClick={onClose} aria-label="Close preview" className="font-meta text-[11px] shrink-0 px-2 py-1 border border-[var(--line)] hover:border-[var(--line-strong)] transition-colors">
            ESC ✕
          </button>
        </div>

        {/* device switcher + loading hairline */}
        <div className="relative flex items-center justify-center gap-2 h-10 border-b border-[var(--line)] shrink-0" style={{ background: "var(--panel)" }}>
          {DEVICES.map((d) => (
            <button
              key={d.id}
              onClick={() => setDevice(d.id)}
              aria-pressed={device === d.id}
              className="font-meta text-[9px] px-2.5 py-1 border transition-colors"
              style={device === d.id
                ? { background: "var(--ink)", borderColor: "var(--ink)", color: "var(--bg)" }
                : { borderColor: "var(--line)" }}
            >
              {d.label.toUpperCase()}
            </button>
          ))}
          {!loaded && (
            <span className="absolute bottom-0 left-0 h-[2px] dept-bg" style={{ animation: "sk-lw-load 1.6s var(--ease-in-out) infinite", width: "40%" }} aria-hidden />
          )}
        </div>

        {/* viewport */}
        <div className="relative flex-1 min-h-0" style={{ background: "var(--panel)" }}>
          {!loaded && (
            <div className="absolute inset-0 grid place-items-center">
              <span className="font-meta text-[10px] text-[var(--muted)]">Loading {host}…</span>
            </div>
          )}
          <iframe
            src={url}
            title={`Live preview of ${title}`}
            onLoad={() => setLoaded(true)}
            sandbox="allow-scripts allow-same-origin allow-forms"
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 w-full h-full border-0"
            style={{ opacity: loaded ? 1 : 0, transition: "opacity 300ms var(--ease-out)", background: "#fff" }}
          />
          {slowHint && !loaded && (
            <div className="absolute inset-x-0 bottom-0 p-4 border-t border-[var(--line)] text-center" style={{ background: "var(--bg)" }}>
              <p className="font-meta text-[10px] text-[var(--muted)]">
                This site is slow to respond or blocks embedding.
                <a href={url} target="_blank" rel="noopener noreferrer" className="dept-accent u-line ml-2">Open live ↗</a>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
