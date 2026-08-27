"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import gsap from "gsap";
import { ChevronLeft, ChevronRight, ArrowUpRight } from "lucide-react";

export interface CardItem {
  id?: string;
  imgUrl: string;
  alt?: string;
  linkUrl?: string;
  title?: string;
  client?: string;
  category?: string;
  year?: string | number;
}

interface SocialCardsProps {
  cards: CardItem[];
  className?: string;
}

const MAX_VISIBLE = 7;
const HALF = 3;

const FAN_POSITIONS = [
  { rot: -21, scale: 0.78, x: -32, y: 7.5, zIndex: 1 },
  { rot: -14, scale: 0.85, x: -22, y: 4.0, zIndex: 2 },
  { rot: -7,  scale: 0.94, x: -11, y: 1.4, zIndex: 4 },
  { rot: 0,   scale: 1.0,  x: 0,   y: 0.0, zIndex: 10 },
  { rot: 7,   scale: 0.94, x: 11,  y: 1.4, zIndex: 4 },
  { rot: 14,  scale: 0.85, x: 22,  y: 4.0, zIndex: 2 },
  { rot: 21,  scale: 0.78, x: 32,  y: 7.5, zIndex: 1 },
];

function getResponsiveMultiplier(width: number) {
  if (width < 480) return 0.28;
  if (width < 640) return 0.40;
  if (width < 768) return 0.52;
  if (width < 1024) return 0.78;
  return 1.05;
}

function getHeightMultiplier(width: number) {
  let idealPx: number;
  if (width < 480) idealPx = 22 * 16;
  else if (width < 640) idealPx = 26 * 16;
  else if (width < 768) idealPx = 28 * 16;
  else if (width < 1024) idealPx = 34 * 16;
  else idealPx = 38 * 16;

  const available = typeof window !== "undefined" ? window.innerHeight * 0.75 : idealPx;
  if (available >= idealPx) return 1;
  return Math.max(0.6, available / idealPx);
}

function getSlotConfig(totalCards: number, slot: number) {
  if (totalCards >= MAX_VISIBLE) return FAN_POSITIONS[slot];
  const center = totalCards >> 1;
  const distance = totalCards > 1 ? (slot - center) / center : 0;
  const absDistance = Math.abs(distance);
  return {
    rot: distance * 21,
    scale: 1.0 - 0.22 * absDistance * absDistance,
    x: distance * 32,
    y: absDistance * absDistance * 7.5,
    zIndex: 10 - Math.abs(slot - center),
  };
}

export function CardFanCarousel({ cards, className = "" }: SocialCardsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isAnimating = useRef(false);
  const hasEntered = useRef(false);
  const directionRef = useRef<"left" | "right" | null>(null);
  const prevVisible = useRef<Set<number>>(new Set());

  const totalCards = cards.length;
  const needsPagination = totalCards >= 5;
  const [centerIndex, setCenterIndex] = useState(HALF);

  const getVisibleMap = useCallback((center: number) => {
    const map = new Map<number, number>();
    for (let slot = 0; slot < MAX_VISIBLE; slot++) {
      map.set(((center + slot - HALF) % totalCards + totalCards) % totalCards, slot);
    }
    return map;
  }, [totalCards]);

  const cycle = useCallback((direction: "left" | "right") => {
    if (isAnimating.current || !needsPagination) return;
    isAnimating.current = true;
    directionRef.current = direction;
    setCenterIndex((prev) =>
      direction === "right" ? (prev + 1) % totalCards : (prev - 1 + totalCards) % totalCards
    );
  }, [totalCards, needsPagination]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !totalCards) return;

    const cardElements = Array.from(container.querySelectorAll<HTMLElement>(".fan-card"));
    if (!cardElements.length) return;

    const visibleMap = getVisibleMap(centerIndex);
    const previouslyVisible = prevVisible.current;
    const direction = directionRef.current;
    const isFirstMount = !hasEntered.current;
    const multiplier = getResponsiveMultiplier(window.innerWidth);
    const hMult = getHeightMultiplier(window.innerWidth);
    const slotCount = needsPagination ? MAX_VISIBLE : totalCards;
    const config = (slot: number) => getSlotConfig(slotCount, slot);

    if (isFirstMount) isAnimating.current = true;

    let completedCount = 0;
    const visibleCount = visibleMap.size;
    const onCardDone = () => {
      if (++completedCount >= visibleCount) {
        isAnimating.current = false;
        if (isFirstMount) hasEntered.current = true;
      }
    };

    cardElements.forEach((card, cardIndex) => {
      const slot = visibleMap.get(cardIndex);
      const wasVisible = previouslyVisible.has(cardIndex);

      if (slot !== undefined) {
        const { x, y, rot, scale, zIndex } = config(slot);
        const target = {
          x: `${x * multiplier}rem`,
          y: `${y * hMult}rem`,
          rotation: rot,
          scale,
          opacity: 1,
          zIndex,
        };

        if (isFirstMount) {
          gsap.set(card, { x: 0, y: `${12 * hMult}rem`, rotation: 0, scale: 0.5, opacity: 0 });
          gsap.to(card, {
            ...target,
            duration: 1.2,
            ease: "elastic.out(1.05, .78)",
            delay: 0.15 + slot * 0.05,
            onComplete: onCardDone,
          });
        } else if (!wasVisible) {
          const enterX = direction === "right" ? 40 : -40;
          gsap.set(card, {
            x: `${enterX}rem`,
            y: `${y * hMult}rem`,
            rotation: direction === "right" ? 30 : -30,
            scale: 0.5,
            opacity: 0,
          });
          gsap.to(card, { ...target, duration: 0.6, ease: "power2.out", onComplete: onCardDone });
        } else {
          gsap.to(card, { ...target, duration: 0.5, ease: "power2.out", onComplete: onCardDone });
        }
      } else if (wasVisible) {
        const exitX = direction === "right" ? -40 : 40;
        gsap.to(card, {
          x: `${exitX}rem`,
          opacity: 0,
          scale: 0.5,
          rotation: direction === "right" ? -30 : 30,
          duration: 0.4,
          ease: "power2.in",
          zIndex: 0,
        });
      } else if (isFirstMount) {
        gsap.set(card, { opacity: 0, scale: 0.3, x: 0, y: 0, zIndex: 0 });
      }
    });

    prevVisible.current = new Set(visibleMap.keys());

    // Hover interactions
    const visibleEntries: { el: HTMLElement; slot: number }[] = [];
    cardElements.forEach((el, i) => {
      const slot = visibleMap.get(i);
      if (slot !== undefined) visibleEntries.push({ el, slot });
    });
    visibleEntries.sort((a, b) => a.slot - b.slot);

    let activeSlot: number | null = null;
    let leaveTimer: ReturnType<typeof setTimeout> | null = null;
    const centerSlot = visibleEntries.length >> 1;

    const updateHoverLayout = (hoveredSlot: number | null) => {
      const mult = getResponsiveMultiplier(window.innerWidth);
      const hM = getHeightMultiplier(window.innerWidth);

      visibleEntries.forEach(({ el, slot }) => {
        const base = config(slot);
        let targetX = base.x * mult;
        let targetY = base.y * hM;
        let targetRot = base.rot;
        let targetScale = base.scale;
        let delay = 0;

        if (hoveredSlot !== null) {
          const distance = Math.abs(slot - hoveredSlot);
          delay = distance * 0.02;

          if (slot === hoveredSlot) {
            targetY -= 3.0 * hM;
            targetScale *= 1.08;
          } else {
            const normalized = centerSlot > 0 ? (slot - centerSlot) / centerSlot : 0;
            const pushStrength = 8 * (1 - Math.abs(normalized)) * (1 + 0.2 * Math.max(0, 3 - distance));

            if (slot < hoveredSlot) {
              targetX -= pushStrength * mult;
              targetRot -= 3 / (distance + 1);
            } else {
              targetX += pushStrength * mult;
              targetRot += 3 / (distance + 1);
            }

            if (slot === visibleEntries.length - 1 && hoveredSlot < centerSlot) targetY -= 1 * hM;
            if (slot === 0 && hoveredSlot > centerSlot) targetY -= 1 * hM;
          }
        } else {
          delay = Math.abs(slot - centerSlot) * 0.02;
        }

        gsap.to(el, {
          x: `${targetX}rem`,
          y: `${targetY}rem`,
          rotation: targetRot,
          scale: targetScale,
          duration: 0.5,
          delay,
          ease: "elastic.out(1, .75)",
          overwrite: "auto",
        });
        gsap.set(el, { zIndex: hoveredSlot === slot ? 20 : base.zIndex });
      });
    };

    const enterHandlers = visibleEntries.map(({ el, slot }) => {
      const handler = () => {
        if (isAnimating.current) return;
        if (leaveTimer) {
          clearTimeout(leaveTimer);
          leaveTimer = null;
        }
        if (activeSlot !== slot) {
          activeSlot = slot;
          updateHoverLayout(slot);
        }
      };
      el.addEventListener("mouseenter", handler);
      return { el, handler };
    });

    const onMouseLeave = () => {
      if (isAnimating.current) return;
      if (leaveTimer) clearTimeout(leaveTimer);
      leaveTimer = setTimeout(() => {
        activeSlot = null;
        updateHoverLayout(null);
      }, 50);
    };
    container.addEventListener("mouseleave", onMouseLeave);

    const onResize = () => {
      if (!isAnimating.current) updateHoverLayout(activeSlot);
    };
    window.addEventListener("resize", onResize);

    return () => {
      enterHandlers.forEach(({ el, handler }) => el.removeEventListener("mouseenter", handler));
      container.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("resize", onResize);
      if (leaveTimer) clearTimeout(leaveTimer);
      gsap.killTweensOf(cardElements);
    };
  }, [centerIndex, totalCards, getVisibleMap, needsPagination]);

  if (!totalCards) return null;

  return (
    <div className={`flex flex-col items-center w-full py-4 relative select-none ${className}`}>
      {/* 3D Curved Fanned Stage */}
      <div className="flex items-center justify-center w-full max-w-[96rem] overflow-visible">
        <div
          ref={containerRef}
          className="relative flex justify-center items-center w-full h-[460px] sm:h-[540px] md:h-[620px] overflow-visible"
        >
          {cards.map((card, index) => {
            const cardContent = (
              <div className="group relative w-full h-full rounded-2xl overflow-hidden border border-[var(--line)] bg-[var(--panel)] shadow-[0_24px_50px_-15px_rgba(0,0,0,0.5)] transition-all duration-300">
                {/* Image Cover */}
                <img
                  src={card.imgUrl}
                  loading="lazy"
                  alt={card.alt || card.title || `Project ${index + 1}`}
                  className="absolute inset-0 w-full h-full object-cover select-none transition-transform duration-700 group-hover:scale-105"
                  draggable={false}
                />

                {/* Ambient Dark Gradient Vignette */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent opacity-80 group-hover:opacity-95 transition-opacity" />

                {/* Top Badge Pill */}
                <div className="absolute top-3.5 left-3.5 right-3.5 flex justify-between items-center">
                  <span className="px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-[9px] font-mono uppercase text-white/90">
                    {card.category || "GRAPHIC PORTFOLIO"}
                  </span>
                  <div className="w-6 h-6 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </div>
                </div>

                {/* Bottom Info Strip */}
                <div className="absolute bottom-0 inset-x-0 p-4 sm:p-5 text-left transform translate-y-1 group-hover:translate-y-0 transition-transform">
                  {card.client && (
                    <p className="text-[10px] font-meta uppercase tracking-wider text-white/70">
                      {card.client}
                    </p>
                  )}
                  <h4 className="font-display text-base sm:text-lg font-bold uppercase tracking-tight text-white mt-0.5 line-clamp-1">
                    {card.title}
                  </h4>
                </div>
              </div>
            );

            const cardClasses =
              "fan-card absolute w-[240px] sm:w-[280px] md:w-[320px] h-[340px] sm:h-[400px] md:h-[460px] cursor-pointer will-change-transform rounded-2xl";

            return card.linkUrl ? (
              <Link key={card.id || index} to={card.linkUrl} className={cardClasses}>
                {cardContent}
              </Link>
            ) : (
              <div key={card.id || index} className={cardClasses}>
                {cardContent}
              </div>
            );
          })}
        </div>
      </div>

      {/* Pagination Controls */}
      {needsPagination && (
        <div className="flex items-center justify-center gap-4 mt-6 md:mt-8 z-30">
          <button
            className="w-10 h-10 md:w-11 md:h-11 rounded-full border border-[var(--line)] bg-[var(--panel)]/80 backdrop-blur-md text-[var(--ink)] hover:border-[var(--dept)] hover:text-[var(--dept)] flex items-center justify-center shadow-md transition-all active:scale-95"
            onClick={() => cycle("left")}
            aria-label="Previous project"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            {cards.map((_, i) => (
              <button
                key={i}
                onClick={() => setCenterIndex(i)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === centerIndex
                    ? "w-6 bg-[var(--dept)]"
                    : "w-2 bg-[var(--line)] hover:bg-[var(--muted)]"
                }`}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>

          <button
            className="w-10 h-10 md:w-11 md:h-11 rounded-full border border-[var(--line)] bg-[var(--panel)]/80 backdrop-blur-md text-[var(--ink)] hover:border-[var(--dept)] hover:text-[var(--dept)] flex items-center justify-center shadow-md transition-all active:scale-95"
            onClick={() => cycle("right")}
            aria-label="Next project"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}

export default CardFanCarousel;
