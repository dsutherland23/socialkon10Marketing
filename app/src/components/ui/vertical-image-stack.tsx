"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, type PanInfo } from "framer-motion";
import { ArrowUpRight, ChevronUp, ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";

export interface StackImageItem {
  id: string | number;
  src: string;
  alt: string;
  title?: string;
  client?: string;
  category?: string;
  slug?: string;
}

const DEFAULT_PORTFOLIO_IMAGES: StackImageItem[] = [
  {
    id: "oasis",
    src: "/covers/oasis-music-festival.webp",
    alt: "Oasis Music Festival Branding",
    title: "Oasis Music Festival",
    client: "Oasis Events JA",
    category: "Brand & Event Identity",
    slug: "oasis-music-festival",
  },
  {
    id: "harbour",
    src: "/covers/harbour-and-co.webp",
    alt: "Harbour & Co. Brand & Menus",
    title: "Harbour & Co.",
    client: "Harbour Restaurant Group",
    category: "Brand Identity & Packaging",
    slug: "harbour-and-co",
  },
  {
    id: "jamrock",
    src: "/covers/jamrock-eats.webp",
    alt: "Jamrock Eats Visual Campaign",
    title: "Jamrock Eats",
    client: "Jamrock Culinary",
    category: "Graphic Design & Social",
    slug: "jamrock-eats",
  },
  {
    id: "peak",
    src: "/covers/peak-performance-fitness.webp",
    alt: "Peak Performance Fitness Branding",
    title: "Peak Performance",
    client: "Peak Performance Ltd.",
    category: "Social Campaign & Visuals",
    slug: "peak-performance-fitness",
  },
  {
    id: "solymar",
    src: "/covers/sol-y-mar-resort.webp",
    alt: "Sol y Mar Luxury Resort Identity",
    title: "Sol y Mar Resort",
    client: "Sol y Mar Hospitality",
    category: "Luxury Brand & Web Design",
    slug: "sol-y-mar-resort",
  },
  {
    id: "vertex",
    src: "/covers/vertex-conference.webp",
    alt: "Vertex Tech Summit Keynote & Stage Design",
    title: "Vertex Summit",
    client: "Vertex Innovation",
    category: "Conference Graphics & Stage",
    slug: "vertex-conference",
  },
];

export interface VerticalImageStackProps {
  items?: StackImageItem[];
  className?: string;
  autoPlay?: boolean;
  autoPlayIntervalMs?: number;
}

export function VerticalImageStack({
  items = DEFAULT_PORTFOLIO_IMAGES,
  className = "",
  autoPlay = false,
  autoPlayIntervalMs = 4500,
}: VerticalImageStackProps) {
  const imageList = items && items.length > 0 ? items : DEFAULT_PORTFOLIO_IMAGES;
  const [currentIndex, setCurrentIndex] = useState(0);
  const lastNavigationTime = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigationCooldown = 350; // ms between navigations

  const navigate = useCallback(
    (newDirection: number) => {
      const now = Date.now();
      if (now - lastNavigationTime.current < navigationCooldown) return;
      lastNavigationTime.current = now;

      setCurrentIndex((prev) => {
        if (newDirection > 0) {
          return prev === imageList.length - 1 ? 0 : prev + 1;
        }
        return prev === 0 ? imageList.length - 1 : prev - 1;
      });
    },
    [imageList.length]
  );

  // Auto-play cycling when enabled
  useEffect(() => {
    if (!autoPlay) return;
    const timer = setInterval(() => {
      navigate(1);
    }, autoPlayIntervalMs);
    return () => clearInterval(timer);
  }, [autoPlay, autoPlayIntervalMs, navigate]);

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const threshold = 40;
    if (info.offset.y < -threshold) {
      navigate(1);
    } else if (info.offset.y > threshold) {
      navigate(-1);
    }
  };

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > 25) {
        if (e.deltaY > 0) {
          navigate(1);
        } else {
          navigate(-1);
        }
      }
    },
    [navigate]
  );

  // Bind wheel event to container
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const onWheel = (e: WheelEvent) => {
      e.stopPropagation();
      handleWheel(e);
    };

    node.addEventListener("wheel", onWheel, { passive: true });
    return () => node.removeEventListener("wheel", onWheel);
  }, [handleWheel]);

  const getCardStyle = (index: number) => {
    const total = imageList.length;
    let diff = index - currentIndex;
    if (diff > total / 2) diff -= total;
    if (diff < -total / 2) diff += total;

    if (diff === 0) {
      return { y: 0, scale: 1, opacity: 1, zIndex: 10, rotateX: 0, filter: "brightness(1)" };
    } else if (diff === -1) {
      return { y: -130, scale: 0.84, opacity: 0.65, zIndex: 8, rotateX: 10, filter: "brightness(0.75)" };
    } else if (diff === -2) {
      return { y: -230, scale: 0.72, opacity: 0.35, zIndex: 6, rotateX: 18, filter: "brightness(0.5)" };
    } else if (diff === 1) {
      return { y: 130, scale: 0.84, opacity: 0.65, zIndex: 8, rotateX: -10, filter: "brightness(0.75)" };
    } else if (diff === 2) {
      return { y: 230, scale: 0.72, opacity: 0.35, zIndex: 6, rotateX: -18, filter: "brightness(0.5)" };
    } else {
      return {
        y: diff > 0 ? 340 : -340,
        scale: 0.6,
        opacity: 0,
        zIndex: 0,
        rotateX: diff > 0 ? -22 : 22,
        filter: "brightness(0.3)",
      };
    }
  };

  const isVisible = (index: number) => {
    const total = imageList.length;
    let diff = index - currentIndex;
    if (diff > total / 2) diff -= total;
    if (diff < -total / 2) diff += total;
    return Math.abs(diff) <= 2;
  };

  return (
    <div
      ref={containerRef}
      className={`relative flex h-[500px] md:h-[580px] w-full items-center justify-center select-none overflow-visible ${className}`}
      aria-label="Graphic Portfolio Reel"
    >
      {/* Subtle backdrop ambient illumination */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[340px] w-[340px] md:h-[420px] md:w-[420px] rounded-full bg-[var(--dept)]/10 blur-3xl transition-colors duration-700" />
      </div>

      {/* Up/Down Quick Navigation Controls */}
      <div className="absolute left-1 sm:left-2 md:left-4 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2.5 z-30">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="w-8 h-8 rounded-full border border-[var(--line)] bg-[var(--panel)]/85 backdrop-blur-md flex items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] hover:border-[var(--dept)] transition-all shadow-sm active:scale-95 cursor-pointer"
          aria-label="Previous portfolio item"
          title="Previous item"
        >
          <ChevronUp className="w-4 h-4" />
        </button>

        {/* Counter Widget */}
        <div className="flex flex-col items-center py-2 px-1 rounded-full bg-[var(--panel)]/90 backdrop-blur-md border border-[var(--line)] shadow-sm">
          <span className="text-xs font-bold font-mono text-[var(--ink)] tabular-nums">
            {String(currentIndex + 1).padStart(2, "0")}
          </span>
          <div className="my-1.5 h-3 w-px bg-[var(--line)]" />
          <span className="text-[10px] font-mono text-[var(--muted)] tabular-nums">
            {String(imageList.length).padStart(2, "0")}
          </span>
        </div>

        <button
          type="button"
          onClick={() => navigate(1)}
          className="w-8 h-8 rounded-full border border-[var(--line)] bg-[var(--panel)]/85 backdrop-blur-md flex items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] hover:border-[var(--dept)] transition-all shadow-sm active:scale-95 cursor-pointer"
          aria-label="Next portfolio item"
          title="Next item"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      {/* 3D Interactive Card Stack */}
      <div
        className="relative flex h-[480px] w-[270px] sm:w-[310px] md:w-[350px] items-center justify-center"
        style={{ perspective: "1200px" }}
      >
        {imageList.map((image, index) => {
          if (!isVisible(index)) return null;
          const style = getCardStyle(index);
          const isCurrent = index === currentIndex;

          return (
            <motion.div
              key={image.id}
              className="absolute cursor-grab active:cursor-grabbing"
              animate={{
                y: style.y,
                scale: style.scale,
                opacity: style.opacity,
                rotateX: style.rotateX,
                zIndex: style.zIndex,
                filter: style.filter,
              }}
              transition={{
                type: "spring",
                stiffness: 280,
                damping: 28,
                mass: 0.9,
              }}
              drag={isCurrent ? "y" : false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.25}
              onDragEnd={handleDragEnd}
              style={{
                transformStyle: "preserve-3d",
                zIndex: style.zIndex,
              }}
            >
              <div
                className={`relative h-[380px] sm:h-[420px] w-[260px] sm:w-[300px] md:w-[330px] overflow-hidden rounded-3xl border transition-all duration-300 ${
                  isCurrent
                    ? "border-[var(--dept)] ring-2 ring-[var(--dept)]/30 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)]"
                    : "border-[var(--line)] bg-[var(--panel)] shadow-md"
                }`}
                style={{
                  background: "var(--panel)",
                }}
              >
                {/* Image Cover */}
                <img
                  src={image.src}
                  alt={image.alt}
                  className="w-full h-full object-cover select-none pointer-events-none"
                  loading={isCurrent ? "eager" : "lazy"}
                  draggable={false}
                />

                {/* Top Badge: Category & Year */}
                <div className="absolute top-3 inset-x-3 flex items-center justify-between pointer-events-none z-10">
                  <span className="font-meta text-[8.5px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-md text-white border border-white/10 shadow-sm">
                    {image.category || "Graphic Portfolio"}
                  </span>
                  <span className="font-mono text-[8px] font-bold px-2 py-0.5 rounded-full bg-[var(--dept)] text-black">
                    PRO
                  </span>
                </div>

                {/* Bottom Overlay Card Info */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent p-4 pt-12 text-white flex flex-col justify-end">
                  <div className="flex items-end justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-sm md:text-base font-bold uppercase truncate leading-tight">
                        {image.title || image.alt}
                      </p>
                      {image.client && (
                        <p className="font-meta text-[9.5px] text-neutral-300 truncate mt-0.5">
                          {image.client}
                        </p>
                      )}
                    </div>

                    {image.slug && isCurrent && (
                      <Link
                        to={`/work/${image.slug}`}
                        className="w-8 h-8 rounded-full bg-[var(--dept)] text-black flex items-center justify-center shrink-0 hover:scale-110 active:scale-95 transition-transform shadow-md"
                        title="View Case Study"
                      >
                        <ArrowUpRight className="w-4 h-4" />
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Navigation Indicators (Right Side) */}
      <div className="absolute right-1 sm:right-2 md:right-4 top-1/2 flex -translate-y-1/2 flex-col gap-2 z-30">
        {imageList.map((_, index) => (
          <button
            key={index}
            type="button"
            onClick={() => setCurrentIndex(index)}
            className={`w-2 rounded-full transition-all duration-300 cursor-pointer ${
              index === currentIndex
                ? "h-6 bg-[var(--dept)] shadow-[0_0_8px_var(--dept)]"
                : "h-2 bg-[var(--line-strong)] hover:bg-[var(--muted)]"
            }`}
            aria-label={`Go to portfolio item ${index + 1}`}
          />
        ))}
      </div>

      {/* Bottom Hint Pill */}
      <div className="absolute -bottom-2 md:bottom-2 left-1/2 -translate-x-1/2 pointer-events-none z-20">
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--panel)]/90 border border-[var(--line)] shadow-sm font-meta text-[8.5px] text-[var(--muted)] uppercase tracking-wider backdrop-blur-md">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--dept)] animate-pulse" />
          <span>Scroll · Drag · Click to explore</span>
        </div>
      </div>
    </div>
  );
}

export default VerticalImageStack;
