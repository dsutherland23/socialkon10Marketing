import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import type { Project } from "../lib/data";
import { track } from "../lib/seo";

/* ------------------------------------------------------------------
   2026 STUDIO ARTWORK LIGHTBOX
   Interactive full-resolution artwork inspector for creative portfolio
   pieces (Brand Identity, Graphic Design, Social Campaigns, Packaging).
   Supports fit/100%/200% zoom, pan-drag, multi-asset gallery navigation,
   fullscreen API, and keyboard shortcuts.
------------------------------------------------------------------- */

interface ArtworkLightboxProps {
  project: Project;
  initialIndex?: number;
  onClose: () => void;
}

export function ArtworkLightbox({ project, initialIndex = 0, onClose }: ArtworkLightboxProps) {
  // Collect all visual assets (primary cover image + any gallery deliverables)
  const assets = useMemo(() => {
    const list: string[] = [];
    if (project.image) list.push(project.image);
    if (Array.isArray(project.gallery)) {
      project.gallery.forEach((img) => {
        if (img && !list.includes(img)) list.push(img);
      });
    }
    return list;
  }, [project]);

  const [currentIndex, setCurrentIndex] = useState(
    Math.max(0, Math.min(initialIndex, assets.length - 1))
  );

  // Zoom & Pan state
  const [zoomLevel, setZoomLevel] = useState<1 | 1.5 | 2.5>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);

  const currentAsset = assets[currentIndex] || project.image;

  // Reset zoom & pan on asset change
  useEffect(() => {
    setZoomLevel(1);
    setPan({ x: 0, y: 0 });
  }, [currentIndex]);

  // Keyboard navigation & body scroll lock
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtnRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowRight") {
        setCurrentIndex((i) => (i + 1) % assets.length);
      } else if (e.key === "ArrowLeft") {
        setCurrentIndex((i) => (i - 1 + assets.length) % assets.length);
      } else if (e.key === "+" || e.key === "=") {
        setZoomLevel((z) => (z === 1 ? 1.5 : z === 1.5 ? 2.5 : 2.5));
      } else if (e.key === "-") {
        setZoomLevel((z) => (z === 2.5 ? 1.5 : 1));
      } else if (e.key === "0") {
        setZoomLevel(1);
        setPan({ x: 0, y: 0 });
      } else if (e.key === "f" || e.key === "F") {
        toggleFullscreen();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    track("artwork_lightbox_open", { title: project.title, slug: project.slug });

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets.length, onClose, project.slug, project.title]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Mouse pan drag handling when zoomed in
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomLevel === 1) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...pan };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({
      x: panStartRef.current.x + dx,
      y: panStartRef.current.y + dy,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const cycleZoom = () => {
    if (zoomLevel === 1) {
      setZoomLevel(1.5);
    } else if (zoomLevel === 1.5) {
      setZoomLevel(2.5);
    } else {
      setZoomLevel(1);
      setPan({ x: 0, y: 0 });
    }
  };

  const copyLink = async () => {
    if (!currentAsset) return;
    const fullUrl = currentAsset.startsWith("http") ? currentAsset : `${window.location.origin}${currentAsset}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // ignore
    }
  };

  if (!currentAsset) return null;

  return createPortal(
    <div
      ref={containerRef}
      className="fixed inset-0 z-[110] flex flex-col bg-zinc-950/95 backdrop-blur-xl text-white select-none animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label={`Artwork inspection for ${project.title}`}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* TOP HUD BAR */}
      <header className="flex items-center justify-between px-4 md:px-6 h-14 border-b border-white/10 bg-zinc-900/80 backdrop-blur-md z-30 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono text-xs text-[var(--dept)] font-bold">
            /PROJECT_{project.id}
          </span>
          <span className="hidden sm:inline text-white/30">|</span>
          <h2 className="font-display font-bold text-sm md:text-base uppercase tracking-tight truncate max-w-[240px] md:max-w-md text-white">
            {project.title}
          </h2>
          {assets.length > 1 && (
            <span className="font-meta text-[10px] px-2 py-0.5 rounded-full bg-white/10 border border-white/15 text-zinc-300 font-mono">
              {currentIndex + 1} of {assets.length}
            </span>
          )}
        </div>

        {/* CONTROLS */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Zoom Selector */}
          <div className="flex items-center rounded-lg border border-white/15 bg-white/5 p-0.5">
            <button
              onClick={() => {
                setZoomLevel(1);
                setPan({ x: 0, y: 0 });
              }}
              className={`px-2 py-1 text-[11px] font-meta rounded transition-colors ${
                zoomLevel === 1 ? "bg-white/20 text-white font-bold" : "text-zinc-400 hover:text-white"
              }`}
              title="Fit to window (Press 0)"
            >
              Fit
            </button>
            <button
              onClick={() => {
                setZoomLevel(1.5);
                setPan({ x: 0, y: 0 });
              }}
              className={`px-2 py-1 text-[11px] font-meta rounded transition-colors ${
                zoomLevel === 1.5 ? "bg-white/20 text-white font-bold" : "text-zinc-400 hover:text-white"
              }`}
              title="100% actual resolution (Press +)"
            >
              100%
            </button>
            <button
              onClick={() => {
                setZoomLevel(2.5);
                setPan({ x: 0, y: 0 });
              }}
              className={`px-2 py-1 text-[11px] font-meta rounded transition-colors ${
                zoomLevel === 2.5 ? "bg-white/20 text-white font-bold" : "text-zinc-400 hover:text-white"
              }`}
              title="250% macro detail zoom"
            >
              2.5×
            </button>
          </div>

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className="p-2 text-zinc-300 hover:text-white hover:bg-white/10 rounded-lg border border-white/15 transition-colors hidden sm:flex items-center justify-center"
            title={isFullscreen ? "Exit Fullscreen (Press F)" : "Fullscreen Mode (Press F)"}
            aria-label="Toggle fullscreen"
          >
            {isFullscreen ? "⛶" : "⛶"}
          </button>

          {/* Direct Raw Link */}
          <a
            href={currentAsset}
            target="_blank"
            rel="noreferrer"
            className="px-2.5 py-1.5 text-xs font-meta text-zinc-300 hover:text-white hover:bg-white/10 rounded-lg border border-white/15 transition-colors hidden md:flex items-center gap-1"
            title="Open raw full-size image in new browser tab"
          >
            Raw ↗
          </a>

          {/* Copy Asset Link */}
          <button
            onClick={copyLink}
            className="px-2.5 py-1.5 text-xs font-meta text-zinc-300 hover:text-white hover:bg-white/10 rounded-lg border border-white/15 transition-colors hidden lg:flex items-center gap-1"
          >
            {copied ? "✓ Copied" : "Copy Link"}
          </button>

          {/* Close Button */}
          <button
            ref={closeBtnRef}
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white hover:bg-red-600/30 hover:border-red-500/50 rounded-lg border border-white/15 transition-colors ml-1"
            title="Close Lightbox (Press Esc)"
            aria-label="Close lightbox"
          >
            ✕
          </button>
        </div>
      </header>

      {/* MAIN VIEWPORT STAGE */}
      <div
        className={`relative flex-1 overflow-hidden flex items-center justify-center p-2 sm:p-6 md:p-8 ${
          zoomLevel > 1 ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in"
        }`}
        onMouseDown={handleMouseDown}
        onClick={(e) => {
          // If not dragging and clicked directly, toggle zoom
          if (e.target === e.currentTarget || zoomLevel === 1) {
            cycleZoom();
          }
        }}
      >
        {/* Ambient colored studio back-glow matching project's hue */}
        <div
          className="absolute inset-0 pointer-events-none opacity-20 blur-3xl"
          style={{
            background: `radial-gradient(circle at center, hsl(${project.hue} 80% 45%) 0%, transparent 65%)`,
          }}
          aria-hidden="true"
        />

        {/* Previous Asset Trigger */}
        {assets.length > 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setCurrentIndex((i) => (i - 1 + assets.length) % assets.length);
            }}
            className="absolute left-3 md:left-6 top-1/2 -translate-y-1/2 z-30 w-11 h-11 rounded-full bg-zinc-900/80 hover:bg-white/20 border border-white/20 text-white flex items-center justify-center text-xl transition-all shadow-xl backdrop-blur-md"
            title="Previous artwork (Left Arrow)"
            aria-label="Previous artwork"
          >
            ‹
          </button>
        )}

        {/* Next Asset Trigger */}
        {assets.length > 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setCurrentIndex((i) => (i + 1) % assets.length);
            }}
            className="absolute right-3 md:right-6 top-1/2 -translate-y-1/2 z-30 w-11 h-11 rounded-full bg-zinc-900/80 hover:bg-white/20 border border-white/20 text-white flex items-center justify-center text-xl transition-all shadow-xl backdrop-blur-md"
            title="Next artwork (Right Arrow)"
            aria-label="Next artwork"
          >
            ›
          </button>
        )}

        {/* Display Image with transform pan and zoom */}
        <div
          className="relative max-w-full max-h-full flex items-center justify-center transition-transform duration-150 ease-out"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomLevel})`,
            transformOrigin: "center center",
          }}
        >
          <img
            src={currentAsset}
            alt={`${project.title} artwork exhibit`}
            className="max-w-[92vw] max-h-[75vh] md:max-h-[80vh] object-contain rounded-lg shadow-2xl border border-white/10 pointer-events-none select-none"
            loading="eager"
            decoding="async"
          />
        </div>

        {/* Floating Hint Overlay on hover */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none bg-black/60 backdrop-blur-md border border-white/15 px-3 py-1 rounded-full text-[10px] font-meta text-zinc-300 flex items-center gap-2">
          <span>Click to {zoomLevel === 1 ? "Zoom in" : "Reset fit"}</span>
          <span className="text-white/30">•</span>
          <span>{zoomLevel > 1 ? "Drag to Pan" : "Use arrow keys for gallery"}</span>
        </div>
      </div>

      {/* BOTTOM THUMBNAILS & FOOTER INFO */}
      <footer className="px-4 md:px-6 py-3 border-t border-white/10 bg-zinc-900/90 backdrop-blur-md flex flex-wrap items-center justify-between gap-4 z-30 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex flex-wrap items-center gap-1.5 font-meta text-[10px] text-zinc-400">
            <span>Client: <strong className="text-white">{project.client}</strong></span>
            <span>·</span>
            <span>Industry: <strong className="text-white">{project.industry}</strong></span>
            <span>·</span>
            <span>Year: <strong className="text-white">{project.year}</strong></span>
          </div>

          <div className="hidden sm:flex flex-wrap gap-1">
            {project.categories.map((c) => (
              <span key={c} className="font-meta text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-zinc-300 border border-white/10">
                {c}
              </span>
            ))}
          </div>
        </div>

        {/* Multi-Asset Thumbnails Strip */}
        {assets.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 max-w-md">
            {assets.map((thumb, idx) => (
              <button
                key={thumb}
                onClick={() => setCurrentIndex(idx)}
                className={`w-10 h-10 rounded border overflow-hidden shrink-0 transition-all ${
                  currentIndex === idx
                    ? "border-[var(--dept)] ring-2 ring-[var(--dept)]/50 scale-105"
                    : "border-white/20 opacity-60 hover:opacity-100"
                }`}
                title={`View asset ${idx + 1}`}
              >
                <img src={thumb} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}

        {/* Direct CTA */}
        <Link
          to={`/start?intent=quote&ref=${project.slug}`}
          onClick={onClose}
          className="btn btn-dept !py-1.5 !px-3 text-xs shrink-0 rounded-lg ml-auto sm:ml-0"
        >
          Commission Similar Project <span className="btn-arrow" aria-hidden>→</span>
        </Link>
      </footer>
    </div>,
    document.body
  );
}
