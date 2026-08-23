import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useShop } from "../lib/shop";
import { getSettings } from "../lib/backend";
import { track } from "../lib/seo";

/* ------------------------------------------------------------------
   EASTER EGG — "Catch me if you can"
   A small token appears mid-session and dodges the cursor. Catch it
   (click) and you win the admin-configured flash discount — with a
   2-minute countdown to use it (see FlashBadge). Once per session.
   Reduced-motion users get a still token (fair catch). The discount
   % comes from Studio Admin → Settings → "Catch me" discount.
------------------------------------------------------------------- */

const SESSION_FLAG = "sk-catch-done";
const APPEAR_AFTER_MS = 45_000;
const FLEE_AFTER_MS = 30_000;
const TTL_MS = 120_000; // 2-minute purchase window
const DODGE_RADIUS = 90;
const MARGIN = 70;

const randomSpot = () => ({
  x: MARGIN + Math.random() * (window.innerWidth - MARGIN * 2),
  y: MARGIN + Math.random() * (window.innerHeight - MARGIN * 2),
});

export default function CatchEgg() {
  const { flash, applyFlash } = useShop();
  const [pct, setPct] = useState(0);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [fleeing, setFleeing] = useState(false);
  const posRef = useRef(pos);
  posRef.current = pos;
  const reduced = useRef(typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  // load admin-configured discount once
  useEffect(() => {
    getSettings().then((s) => setPct(Number(s.catchDiscountPct) || 0)).catch(() => {});
  }, []);

  useEffect(() => {
    // ?catch=demo — preview the token without the wait (dev/demo hook)
    const demo = new URLSearchParams(window.location.search).get("catch") === "demo";
    if (!pct || (sessionStorage.getItem(SESSION_FLAG) && !demo) || flash) return;

    let gone = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const appear = setTimeout(() => {
      if (gone) return;
      setPos(randomSpot());
      track("catch_egg_appear", { pct });

      // flee if never caught
      timers.push(setTimeout(() => {
        if (gone) return;
        setFleeing(true);
        track("catch_egg_fled", { pct });
        timers.push(setTimeout(() => {
          sessionStorage.setItem(SESSION_FLAG, "1");
          setPos(null);
        }, 600));
      }, FLEE_AFTER_MS));
    }, demo ? 1_500 : APPEAR_AFTER_MS);
    timers.push(appear);

    // dodge the cursor (skip for reduced-motion — still token, fair catch)
    const onMove = (e: PointerEvent) => {
      if (reduced.current || !posRef.current || gone) return;
      const dx = e.clientX - posRef.current.x;
      const dy = e.clientY - posRef.current.y;
      if (Math.hypot(dx, dy) < DODGE_RADIUS) setPos(randomSpot());
    };
    window.addEventListener("pointermove", onMove);

    return () => { gone = true; timers.forEach(clearTimeout); window.removeEventListener("pointermove", onMove); };
  }, [pct, flash]);

  if (!pos) return null;

  const catchIt = () => {
    sessionStorage.setItem(SESSION_FLAG, "1");
    applyFlash(pct, TTL_MS);
    track("catch_egg_caught", { pct });
    toast.success(`Caught! −${pct}% flash discount — 2:00 on the clock.`);
    setPos(null);
  };

  return (
    <button
      type="button"
      onClick={catchIt}
      aria-label={`Catch me — win ${pct}% off`}
      className="fixed z-[86] w-14 h-14 rounded-full border-2 grid place-items-center cursor-pointer select-none transition-all duration-300 shadow-lg"
      style={{
        left: pos.x - 28,
        top: pos.y - 28,
        background: "var(--dept)",
        borderColor: "var(--bg)",
        color: "var(--on-dept, var(--bg))",
        opacity: fleeing ? 0 : 1,
        transform: fleeing ? "scale(0.4)" : "scale(1)",
      }}
    >
      <span className="font-display-wide text-[13px] font-bold leading-none">−{pct}%</span>
      <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 font-meta text-[8px] whitespace-nowrap" style={{ color: "var(--muted)" }}>
        catch me
      </span>
    </button>
  );
}
