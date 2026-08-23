import { useEffect, useRef, useState } from "react";
import { HandIllustration } from "./HandEgg";
import { track } from "../lib/seo";

/* ------------------------------------------------------------------
   MORE HAND EGGS — the hand's side gigs.
   A. IdleNudge  — 60s of no activity: the hand peeks in from the
      right edge holding a note. Vanishes on any activity. Once/session.
   B. ScrollTug  — rare: the hand grabs the right edge of the page and
      pulls it down a little, pointing at what's below. Once ever.
------------------------------------------------------------------- */

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- A. idle nudge ---------- */
function IdleNudge() {
  const [show, setShow] = useState(false);
  const idle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hide = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (sessionStorage.getItem("sk-idle-nudge") || reducedMotion()) return;
    const demo = new URLSearchParams(window.location.search).get("idle") === "demo";
    const IDLE_MS = demo ? 1_500 : 60_000;
    const HOLD_MS = 6_500;   // auto-dismiss even if the user stays idle

    const arm = () => {
      clearTimeout(idle.current);
      idle.current = setTimeout(() => {
        setShow(true);
        if (!demo) sessionStorage.setItem("sk-idle-nudge", "1");
        track("easter_egg_idle", {});
        clearTimeout(hide.current);
        hide.current = setTimeout(() => setShow(false), HOLD_MS);
      }, IDLE_MS);
    };
    const onActivity = () => {
      clearTimeout(hide.current);
      setShow(false);
      if (!sessionStorage.getItem("sk-idle-nudge")) arm();
    };

    arm();
    const events = ["pointermove", "keydown", "scroll", "pointerdown"] as const;
    events.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }));
    return () => {
      clearTimeout(idle.current);
      clearTimeout(hide.current);
      events.forEach((ev) => window.removeEventListener(ev, onActivity));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed right-0 top-1/3 z-[87] pointer-events-none flex items-start transition-transform duration-500"
      style={{ transform: show ? "translateX(0)" : "translateX(105%)", transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
      aria-hidden
    >
      <div className="font-meta text-[10px] px-3 py-2 border border-[var(--line-strong)] whitespace-nowrap mt-16 -ml-40 sk-pop"
        style={{ background: "var(--bg)", opacity: show ? 1 : 0, transition: "opacity 300ms" }}>
        Still there? The store's open.
      </div>
      <div className="text-[var(--ink)]" style={{ transform: "rotate(-90deg)" }}>
        <div className={show ? "sk-wiggle" : undefined}>
          <HandIllustration />
        </div>
      </div>
    </div>
  );
}

/* ---------- B. scroll tug (rare, once ever) ---------- */
function ScrollTug() {
  const [x, setX] = useState(0);
  const [y, setY] = useState(-160);
  const [pulling, setPulling] = useState(false);
  const [released, setReleased] = useState(false);
  const [active, setActive] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    if (reducedMotion()) return;
    const demo = new URLSearchParams(window.location.search).get("tug") === "demo";
    if (!demo) {
      if (window.location.pathname !== "/") return;
      if (localStorage.getItem("sk-hand-tug")) return;
      if (Math.random() > 0.25) { localStorage.setItem("sk-hand-tug", "1"); return; }
    }
    const wait = (ms: number) => new Promise<void>((r) => { timers.current.push(setTimeout(r, ms)); });

    const start = setTimeout(() => {
      const edge = window.innerWidth - 40;
      const midY = Math.round(window.innerHeight * 0.35);
      setX(edge);
      setActive(true);
      track("easter_egg_hand_tug", {});
      (async () => {
        setY(midY - 96);                       // descend to the page edge
        await wait(750);
        // grab + pull the page down
        const from = window.scrollY;
        const to = Math.min(from + 320, document.documentElement.scrollHeight - window.innerHeight);
        if (to > from) {
          setPulling(true);                    // grip + strain stretch
          window.scrollTo({ top: to, behavior: "smooth" });
          setY(midY - 96 + 90);                // hand travels with the pull
        }
        await wait(900);
        setPulling(false);
        setReleased(true);                     // let go — jelly snap-back
        await wait(480);
        setReleased(false);
        setY(-160);                            // retreat
        await wait(700);
        setActive(false);
        if (!demo) localStorage.setItem("sk-hand-tug", "1");
      })();
    }, demo ? 2_000 : 150_000);
    timers.current.push(start);
    return () => { timers.current.forEach(clearTimeout); timers.current = []; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!active) return null;
  return (
    <div className="fixed inset-0 z-[89] pointer-events-none" aria-hidden>
      <div
        className="absolute text-[var(--ink)]"
        style={{
          transform: `translate(${x}px, ${y}px) rotate(-90deg)`,
          transition: "transform 700ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div
          className={released ? "sk-squish" : undefined}
          style={{
            transform: pulling ? "scale(1.14, 0.9)" : "scale(1, 1)",
            transformOrigin: "50% 50%",
            transition: "transform 300ms ease-out",
          }}
        >
          <HandIllustration />
        </div>
      </div>
    </div>
  );
}

export default function MoreHandEggs() {
  return (
    <>
      <IdleNudge />
      <ScrollTug />
    </>
  );
}
