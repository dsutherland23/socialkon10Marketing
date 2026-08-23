import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/* ------------------------------------------------------------------
   MOTION PRIMITIVES
   Gate results applied: section reveals = occasional tier (standard
   animation); hover effects = frequent tier (fast, subtle, transform/
   opacity only). Keyboard-initiated surfaces (command palette) get no
   entry animation. Reduced-motion variants handled in CSS.
------------------------------------------------------------------- */

const useReduced = () => {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const fn = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  return reduced;
};

export { useReduced };

/** Scroll-triggered reveal: opacity + translate, 30–80ms stagger via delay prop. */
export function Reveal({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li" | "span";
}) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add("is-in"), io.unobserve(e.target))),
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Tag ref={ref as any} className={`reveal ${className}`} style={{ "--reveal-delay": `${delay}ms` } as CSSProperties}>
      {children}
    </Tag>
  );
}

/** Clip/reveal headline: each line slides up inside an overflow mask. */
export function ClipLines({ lines, className = "", lineClassName = "", delay = 0, stagger = 90 }: {
  lines: ReactNode[];
  className?: string;
  lineClassName?: string;
  delay?: number;
  stagger?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && (e.target.classList.add("is-in"), io.unobserve(e.target))),
      { threshold: 0.2 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <span ref={ref} className={className} style={{ display: "block" }}>
      {lines.map((l, i) => (
        <span className="clip-line" key={i}>
          <span className={lineClassName} style={{ "--reveal-delay": `${delay + i * stagger}ms` } as CSSProperties}>
            {l}
          </span>
        </span>
      ))}
    </span>
  );
}

/* Text shuffle (character-cycle settle) — reference technique, used on
   department selector + archive rows where it signals interactivity. */
const GLYPHS = "SK10#/—+×·";
export function ShuffleText({ text, play, className = "" }: { text: string; play: boolean; className?: string }) {
  const reduced = useReduced();
  const [out, setOut] = useState(text);
  const frame = useRef(0);
  useEffect(() => {
    if (!play || reduced) { setOut(text); return; }
    let raf = 0;
    frame.current = 0;
    const total = Math.max(10, text.length * 2);
    const tick = () => {
      frame.current++;
      const p = frame.current / total;
      const settled = Math.floor(text.length * p);
      let s = text.slice(0, settled);
      for (let i = settled; i < text.length; i++) {
        s += text[i] === " " ? " " : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      }
      setOut(s);
      if (frame.current < total) raf = requestAnimationFrame(tick);
      else setOut(text);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [play, text, reduced]);
  return <span className={className} aria-label={text}>{out}</span>;
}

/** Magnetic hover — desktop-only, pointer:fine gated, spring-like lerp. */
export function Magnetic({ children, strength = 0.25, className = "" }: {
  children: ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReduced();
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let raf = 0;
    let tx = 0, ty = 0, cx = 0, cy = 0;
    const move = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      tx = (e.clientX - (r.left + r.width / 2)) * strength;
      ty = (e.clientY - (r.top + r.height / 2)) * strength;
    };
    const leave = () => { tx = 0; ty = 0; };
    const loop = () => {
      cx += (tx - cx) * 0.18;
      cy += (ty - cy) * 0.18;
      el.style.transform = `translate(${cx.toFixed(2)}px, ${cy.toFixed(2)}px)`;
      raf = requestAnimationFrame(loop);
    };
    el.addEventListener("mousemove", move);
    el.addEventListener("mouseleave", leave);
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); el.removeEventListener("mousemove", move); el.removeEventListener("mouseleave", leave); };
  }, [strength, reduced]);
  return <div ref={ref} className={className} style={{ willChange: "transform" }}>{children}</div>;
}
