import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useShop } from "../lib/shop";
import { track } from "../lib/seo";

/* ------------------------------------------------------------------
   MICRO EASTER EGGS — small, original personality details.
   1. CopySurprise  — copies carry a witty signature line
   2. LogoEyes      — the header logo subtly follows the cursor (home)
   3. CursorTrail   — blueprint "+" marks trail the cursor (home)
   4. BottomReward  — reaching the page bottom reveals a promo code
   5. KeywordEgg    — typing KON10 flashes the page's grid skeleton
   6. NightOwl      — midnight–5am visitors get a quiet badge
   All respect prefers-reduced-motion where motion is involved.
------------------------------------------------------------------- */

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isHome = () => window.location.pathname === "/";
const isTypingTarget = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

/* ---------- 1. copy-paste surprise ---------- */
function CopySurprise() {
  useEffect(() => {
    const onCopy = (e: ClipboardEvent) => {
      const sel = window.getSelection()?.toString() ?? "";
      if (sel.trim().length < 40 || !e.clipboardData) return;
      e.clipboardData.setData("text/plain", `${sel}\n\n— copied from socialkon10.com. Good taste.`);
      e.preventDefault();
      track("easter_egg_copy", { len: sel.length });
    };
    document.addEventListener("copy", onCopy);
    return () => document.removeEventListener("copy", onCopy);
  }, []);
  return null;
}

/* ---------- 2. logo follows the cursor (homepage) ---------- */
function LogoEyes() {
  useEffect(() => {
    if (!isHome() || reducedMotion()) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const logo = document.querySelector<HTMLElement>("header img");
        if (!logo) return;
        const r = logo.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        const angle = Math.max(-6, Math.min(6, dx / 90));           // ±6° tilt
        const lift = Math.max(-2, Math.min(2, dy / 240));           // ±2px drift
        logo.style.transition = "transform 300ms ease-out";
        logo.style.transform = `rotate(${angle}deg) translateY(${lift}px)`;
      });
    };
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
      const logo = document.querySelector<HTMLElement>("header img");
      if (logo) { logo.style.transform = ""; logo.style.transition = ""; }
    };
  }, []);
  return null;
}

/* ---------- 3. blueprint cursor trail (homepage) ---------- */
function CursorTrail() {
  const [marks, setMarks] = useState<{ id: number; x: number; y: number }[]>([]);
  const idRef = useRef(0);
  useEffect(() => {
    if (!isHome() || reducedMotion()) return;
    let last = 0;
    const onMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - last < 90) return;
      last = now;
      const id = ++idRef.current;
      setMarks((m) => [...m.slice(-14), { id, x: e.clientX, y: e.clientY }]);
      setTimeout(() => setMarks((m) => m.filter((x) => x.id !== id)), 900);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, []);
  return (
    <div className="fixed inset-0 z-[5] pointer-events-none" aria-hidden>
      {marks.map((m) => (
        <span
          key={m.id}
          className="absolute font-meta text-[11px] dept-accent sk-pop"
          style={{ left: m.x - 4, top: m.y - 6, opacity: 0.55 }}
        >
          +
        </span>
      ))}
    </div>
  );
}

/* ---------- 4. scroll-to-bottom reward (homepage, once/session) ---------- */
function BottomReward() {
  const { applyPromo } = useShop();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!isHome() || sessionStorage.getItem("sk-bottom-reward")) return;
    const onScroll = () => {
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 60) {
        sessionStorage.setItem("sk-bottom-reward", "1");
        setShow(true);
        track("easter_egg_bottom", {});
        window.removeEventListener("scroll", onScroll);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!show) return null;
  return (
    <div
      className="sk-pop fixed bottom-4 left-1/2 z-[84] flex items-center gap-3 px-4 py-3 border border-[var(--line-strong)] shadow-lg"
      style={{ background: "var(--bg)", transform: "translateX(-50%)" }}
      role="status"
    >
      <span className="font-meta text-[10px]">
        You read everything. That deserves <span className="dept-accent font-bold">5% off</span> — code <span className="font-bold">BOTTOM5</span>
      </span>
      <button
        className="btn btn-dept !py-1.5 !px-3 font-meta text-[9px]"
        onClick={() => {
          const err = applyPromo("BOTTOM5");
          if (err) toast.error(err);
          else { toast.success("BOTTOM5 applied — 5% off at checkout."); track("promo_apply", { code: "BOTTOM5", via: "bottom-reward" }); }
          setShow(false);
        }}
      >
        Apply
      </button>
      <button className="font-meta text-[10px] text-[var(--muted)]" onClick={() => setShow(false)} aria-label="Dismiss">✕</button>
    </div>
  );
}

/* ---------- 5. KON10 keyword → blueprint skeleton flash ---------- */
function KeywordEgg() {
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (sessionStorage.getItem("sk-kon10")) return;
    let buf = "";
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      buf = (buf + e.key.toUpperCase()).slice(-5);
      if (buf === "KON10") {
        sessionStorage.setItem("sk-kon10", "1");
        setFlash(true);
        track("easter_egg_kon10", {});
        setTimeout(() => setFlash(false), 2000);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  if (!flash) return null;
  return (
    <div
      className="fixed inset-0 z-[88] pointer-events-none sk-pop"
      aria-hidden
      style={{
        backgroundImage: "linear-gradient(var(--dept) 1px, transparent 1px), linear-gradient(90deg, var(--dept) 1px, transparent 1px)",
        backgroundSize: "56px 56px",
        opacity: 0.22,
      }}
    >
      <span className="absolute top-20 left-1/2 -translate-x-1/2 font-meta text-[10px] dept-accent px-3 py-1.5 border" style={{ background: "var(--bg)", borderColor: "var(--dept)" }}>
        BLUEPRINT MODE — you found the skeleton. KON10 accepted.
      </span>
    </div>
  );
}

/* ---------- 6. night owl badge (midnight–5am, once/session) ---------- */
function NightOwl() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const h = new Date().getHours();
    const demo = new URLSearchParams(window.location.search).get("owl") === "demo";
    if ((!demo && (h < 0 || h >= 5)) || sessionStorage.getItem("sk-night-owl")) return;
    const t = setTimeout(() => {
      setShow(true);
      if (!demo) sessionStorage.setItem("sk-night-owl", "1");
      track("easter_egg_nightowl", {});
    }, demo ? 800 : 20_000);
    return () => clearTimeout(t);
  }, []);
  if (!show) return null;
  return (
    <div
      className="sk-pop fixed bottom-4 right-4 z-[84] flex items-center gap-3 px-4 py-3 border border-[var(--line-strong)] shadow-lg max-w-[280px]"
      style={{ background: "var(--panel)" }}
      role="status"
    >
      <span className="font-meta text-[10px] leading-snug">
        Night owl? So are we.<span className="block opacity-60 mt-0.5">Here's to the 2am ideas.</span>
      </span>
      <button className="font-meta text-[10px] text-[var(--muted)] shrink-0" onClick={() => setShow(false)} aria-label="Dismiss">✕</button>
    </div>
  );
}

export default function MicroEggs() {
  return (
    <>
      <CopySurprise />
      <LogoEyes />
      <CursorTrail />
      <BottomReward />
      <KeywordEgg />
      <NightOwl />
    </>
  );
}
