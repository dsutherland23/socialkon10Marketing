"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import { Sparkles, MousePointer, Crosshair } from "lucide-react";
import { Reveal } from "../../lib/motion";

export interface MouseFlyInProps {
  imageUrl?: string;
  className?: string;
}

export function MouseFlyIn({
  imageUrl = "/assets/apple-mouse.png",
  className = "",
}: MouseFlyInProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Track scroll progress through this transition section
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  // Spring physics for ultra-smooth fluid flight motion
  const smooth = useSpring(scrollYProgress, {
    stiffness: 85,
    damping: 22,
    mass: 0.8,
  });

  // Flight Path Transformations: smooth sweep across the top open runway
  const x = useTransform(smooth, [0, 0.2, 0.5, 0.8, 1], ["-70vw", "-25vw", "10vw", "50vw", "115vw"]);
  const y = useTransform(smooth, [0, 0.25, 0.5, 0.75, 1], ["10px", "-20px", "0px", "-20px", "-35px"]);
  const rotate = useTransform(smooth, [0, 0.3, 0.6, 1], [-20, -4, 8, 22]);
  const rotateY = useTransform(smooth, [0, 0.5, 1], [-14, 0, 16]);
  const scale = useTransform(smooth, [0, 0.2, 0.5, 0.8, 1], [0.85, 1.15, 1.38, 1.22, 0.95]);
  const opacity = useTransform(smooth, [0, 0.08, 0.88, 1], [0, 1, 1, 0]);

  // Optical glowing particle trail coordinate
  const trailWidth = useTransform(smooth, [0, 0.5, 1], ["0%", "85%", "100%"]);

  return (
    <section
      ref={containerRef}
      className={`relative z-20 w-full overflow-x-clip select-none pt-12 md:pt-16 pb-20 md:pb-28 ${className}`}
      style={{
        background: "var(--panel)",
      }}
      aria-label="Precision Design Craft"
    >
      {/* Precision Blueprint Grid & Measurement Lines */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.06] blueprint-grid" />

      {/* DEDICATED MOUSE RUNWAY: Sits naturally above the writing */}
      <div className="relative w-full h-44 sm:h-56 md:h-72 flex items-center justify-center overflow-visible pointer-events-none mb-6 md:mb-10 z-30">
        {/* Dynamic Glowing Trail Line along the upper line */}
        <motion.div
          className="absolute left-0 top-1/2 -translate-y-1/2 h-px bg-gradient-to-r from-transparent via-[var(--dept)] to-[var(--dept)] opacity-40 blur-[1px]"
          style={{ width: trailWidth }}
        />

        {/* The Flying Apple Mouse — Large, prominent, centered in upper runway */}
        <motion.div
          style={{
            x,
            y,
            rotate,
            rotateY,
            scale,
            opacity,
            perspective: "1200px",
          }}
          className="relative will-change-transform flex items-center justify-center pointer-events-none"
        >
          {/* Ambient Lighting Halo underneath the mouse */}
          <div className="absolute -inset-14 rounded-full bg-[var(--dept)]/20 blur-3xl -z-10 pointer-events-none" />

          {/* Mouse Image with clean Apple finish and soft drop shadow */}
          <div className="relative">
            <img
              src={imageUrl}
              alt="Apple Magic Mouse flying across screen"
              className="w-72 sm:w-96 md:w-[480px] lg:w-[580px] h-auto object-contain drop-shadow-[0_32px_60px_rgba(0,0,0,0.4)] select-none pointer-events-none"
              draggable={false}
              loading="eager"
            />
          </div>
        </motion.div>
      </div>

      {/* MAIN TEXT CONTENT: Placed cleanly below the mouse runway */}
      <div className="wrap relative z-10">
        <div className="max-w-3xl mx-auto text-center relative">
          <Reveal>
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full border border-[var(--line)] bg-[var(--bg)] font-meta text-[9.5px] uppercase font-bold tracking-widest text-[var(--muted)] shadow-sm">
              <Crosshair className="w-3.5 h-3.5 text-[var(--dept)]" />
              <span>Studio Precision · Pixel By Pixel</span>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <h2 className="font-display text-3xl md:text-5xl font-black uppercase tracking-tight mt-5 text-[var(--ink)] leading-tight">
              Crafted with obsessive attention to detail.
            </h2>
          </Reveal>

          <Reveal delay={220}>
            <p className="mt-4 text-sm md:text-base text-[var(--muted)] max-w-xl mx-auto leading-relaxed">
              Every vector curve, design system, and digital interaction is refined until it looks effortless and converts without friction.
            </p>
          </Reveal>

          {/* Precision telemetry pills */}
          <Reveal delay={300}>
            <div className="mt-8 flex flex-wrap justify-center items-center gap-3 font-mono text-[9px] uppercase text-[var(--muted)]">
              <span className="px-2.5 py-1 rounded-md border border-[var(--line)] bg-[var(--bg)]/80 flex items-center gap-1.5">
                <MousePointer className="w-3 h-3 text-[var(--dept)]" />
                <span>Zero-Latency Vectors</span>
              </span>
              <span className="px-2.5 py-1 rounded-md border border-[var(--line)] bg-[var(--bg)]/80">
                100% Custom Tailored
              </span>
              <span className="px-2.5 py-1 rounded-md border border-[var(--line)] bg-[var(--bg)]/80 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" />
                <span>Production Ready</span>
              </span>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

export default MouseFlyIn;
