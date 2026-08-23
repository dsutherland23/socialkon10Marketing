import { useEffect, useRef, useState } from "react";
import { ProjectCover } from "./cover";

/* ------------------------------------------------------------------
   LIVE COVER — the case-study banner becomes a miniature live render
   of the real site. The iframe is rendered at desktop width and
   transform-scaled into the banner, pointer-events disabled; the
   generative cover stays underneath as the loading state and the
   permanent fallback if the site blocks embedding. Clicking the
   banner opens the full contained Live Window.
------------------------------------------------------------------- */

const RENDER_W = 1280;

export function LiveCover({
  url, title, seed, hue, image, onOpen,
}: {
  url: string; title: string; seed: number; hue: number; image?: string; onOpen: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  // measure the banner so the desktop-width render scales to fit exactly
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / RENDER_W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // if the frame never signals load, keep the generative art permanently
  useEffect(() => {
    if (loaded) return;
    const t = window.setTimeout(() => setFailed(true), 10000);
    return () => window.clearTimeout(t);
  }, [loaded]);

  const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } })();

  return (
    <button
      ref={boxRef as never}
      onClick={onOpen}
      className="group relative block w-full h-full overflow-hidden text-left cursor-pointer"
      aria-label={`Open interactive live preview of ${title}`}
    >
      {/* generative art: loading state + permanent fallback */}
      <div className="absolute inset-0">
        <ProjectCover seed={seed} hue={hue} title={title} image={image} className="!h-full" />
      </div>

      {/* live render, scaled into the banner */}
      {!failed && scale > 0 && (
        <iframe
          src={url}
          title={`Live render of ${title}`}
          onLoad={() => setLoaded(true)}
          sandbox="allow-scripts allow-same-origin"
          referrerPolicy="strict-origin-when-cross-origin"
          loading="lazy"
          tabIndex={-1}
          aria-hidden="true"
          className="absolute top-0 left-0 border-0 pointer-events-none"
          style={{
            width: RENDER_W,
            height: `${100 / scale}%`,
            transform: `scale(${scale})`,
            transformOrigin: "0 0",
            opacity: loaded ? 1 : 0,
            transition: "opacity 500ms var(--ease-out)",
            background: "#fff",
          }}
        />
      )}

      {/* mini browser chrome */}
      <div
        className="absolute top-0 inset-x-0 flex items-center gap-2.5 px-3.5 h-9 border-b border-[var(--line)]"
        style={{ background: "var(--panel)", opacity: loaded ? 1 : 0, transition: "opacity 400ms var(--ease-out)" }}
      >
        <span className="flex gap-1" aria-hidden>
          <i className="w-2 h-2 border border-[var(--line-strong)]" />
          <i className="w-2 h-2 border border-[var(--line-strong)]" />
          <i className="w-2 h-2 dept-bg" />
        </span>
        <span className="font-meta text-[9px] truncate px-2.5 py-0.5 border border-[var(--line)]" style={{ background: "var(--bg)" }}>{host}</span>
        <span className="ml-auto flex items-center gap-1.5 font-meta text-[9px] dept-accent shrink-0">
          <i className="w-1.5 h-1.5 rounded-full dept-bg animate-pulse" aria-hidden /> LIVE
        </span>
      </div>

      {/* hover hint */}
      <div
        className="absolute bottom-4 right-4 font-meta text-[10px] px-3 py-2 border border-[var(--line-strong)] opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        style={{ background: "var(--bg)" }}
        aria-hidden
      >
        Click to interact →
      </div>
    </button>
  );
}
