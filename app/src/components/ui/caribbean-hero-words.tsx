"use client";

import { useState, useRef } from "react";
import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import { Globe, Anchor, Zap } from "lucide-react";

export function CaribbeanHeroWords() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredLine, setHoveredLine] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Scroll-linked depth parallax for headline words
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"],
  });

  const smoothProgress = useSpring(scrollYProgress, { stiffness: 100, damping: 20 });
  const y1 = useTransform(smoothProgress, [0, 1], [-12, 18]);
  const y2 = useTransform(smoothProgress, [0, 1], [0, -12]);
  const y3 = useTransform(smoothProgress, [0, 1], [15, -28]);
  const rotateX = useTransform(smoothProgress, [0, 1], [6, -6]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setMousePos({ x, y });
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => {
        setHoveredLine(null);
        setMousePos({ x: 0, y: 0 });
      }}
      className="relative py-4 select-none"
      style={{ perspective: "1000px" }}
      aria-label="Caribbean-rooted. Globally competitive."
    >
      {/* Background ambient lighting pulse */}
      <div
        className="pointer-events-none absolute -inset-x-12 -inset-y-8 rounded-3xl bg-[var(--dept)]/5 blur-3xl transition-opacity duration-500"
        style={{
          opacity: hoveredLine !== null ? 0.9 : 0.4,
          transform: `translate(${mousePos.x * 24}px, ${mousePos.y * 24}px)`,
        }}
      />

      <motion.div
        style={{ rotateX }}
        className="flex flex-col gap-1 md:gap-2 relative z-10"
      >
        {/* LINE 1: Caribbean-rooted. */}
        <motion.div
          style={{ y: y1 }}
          onMouseEnter={() => setHoveredLine(1)}
          className="group flex flex-wrap items-baseline gap-3 cursor-default transition-transform duration-300"
        >
          <span className="display-hero font-black tracking-tight leading-[0.9] text-[var(--ink)] transition-colors duration-300 group-hover:text-[var(--dept)] flex items-center">
            Caribbean-rooted.
          </span>

          <motion.span
            initial={{ opacity: 0, scale: 0.8, x: -10 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-[var(--line)] bg-[var(--panel)]/80 backdrop-blur-md text-[10px] font-mono uppercase tracking-wider text-[var(--muted)] group-hover:border-[var(--dept)] group-hover:text-[var(--ink)] transition-colors shadow-sm"
          >
            <Anchor className="w-3 h-3 text-[var(--dept)] animate-bounce" />
            <span>Kingston · 18.01° N, 76.80° W</span>
          </motion.span>
        </motion.div>

        {/* LINE 2: Globally */}
        <motion.div
          style={{ y: y2 }}
          onMouseEnter={() => setHoveredLine(2)}
          className="group flex flex-wrap items-center gap-3.5 cursor-default transition-transform duration-300 pl-2 md:pl-6"
        >
          <span
            className="display-hero font-black tracking-tight leading-[0.9] text-transparent transition-all duration-500 group-hover:tracking-wider"
            style={{
              WebkitTextStroke: "2px var(--ink)",
              letterSpacing: hoveredLine === 2 ? "0.04em" : "-0.01em",
            }}
          >
            Globally
          </span>

          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--dept-soft)] border border-[var(--dept)]/40 text-[var(--dept)] font-meta text-[10px] uppercase font-bold tracking-widest">
            <Globe className="w-3.5 h-3.5 animate-[spin_8s_linear_infinite]" />
            <span>Worldwide Reach</span>
          </div>
        </motion.div>

        {/* LINE 3: competitive. */}
        <motion.div
          style={{ y: y3 }}
          onMouseEnter={() => setHoveredLine(3)}
          className="group flex flex-wrap items-baseline gap-3 cursor-default transition-transform duration-300 pl-4 md:pl-12"
        >
          <span className="display-hero font-black tracking-tight leading-[0.9] dept-accent relative">
            competitive.
            {/* Animated accent underline underline-beam */}
            <motion.span
              className="absolute left-0 bottom-1 h-1.5 md:h-2 bg-[var(--dept)] rounded-full -z-10 opacity-40 group-hover:opacity-100 transition-opacity"
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ delay: 0.4, duration: 0.8, ease: "easeOut" }}
            />
          </span>

          <span className="inline-flex items-center gap-1 text-[11px] font-meta uppercase font-bold text-[var(--muted)] tracking-wider px-2.5 py-0.5 rounded-full border border-[var(--line)] bg-[var(--bg)]">
            <Zap className="w-3 h-3 text-amber-500" />
            <span>Tier-1 Execution</span>
          </span>
        </motion.div>
      </motion.div>
    </div>
  );
}

export default CaribbeanHeroWords;
