import { useEffect, useRef, useState } from "react";
import { HandIllustration } from "./HandEgg";
import { track } from "../lib/seo";

/* ------------------------------------------------------------------
   ORDER-COMPLETE STAMP — the hand celebrates a conversion.
   Listens for the "sk-order-complete" window event (fired by the
   quote/checkout confirmation screens), descends onto the
   confirmation, and stamps it — a tilted approval frame — then
   leaves. Reduced-motion safe (static stamp, no hand).
------------------------------------------------------------------- */

const HIDE_Y = -160;

export default function StampEgg() {
  const [x, setX] = useState(0);
  const [y, setY] = useState(HIDE_Y);
  const [wind, setWind] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [released, setReleased] = useState(false);
  const [stamped, setStamped] = useState(false);
  const [stampPos, setStampPos] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const wait = (ms: number) => new Promise<void>((r) => { timers.current.push(setTimeout(r, ms)); });

    const onComplete = () => {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const cx = window.innerWidth / 2;
      const cy = Math.round(window.innerHeight * 0.42);
      setStampPos({ x: cx, y: cy });
      setX(cx - 32);
      setActive(true);
      track("easter_egg_stamp", {});

      (async () => {
        if (reduced) {
          // no flying hand — just the stamp itself
          setStamped(true);
          await wait(2_400);
          setStamped(false);
          setActive(false);
          return;
        }
        setY(cy - 120);            // descend above the confirmation
        await wait(700);
        setWind(true);             // wind up…
        await wait(170);
        setWind(false);
        setPressed(true);          // SLAM — squash hard
        await wait(160);
        setStamped(true);          // STAMP
        await wait(240);
        setPressed(false);
        setReleased(true);         // jelly rebound
        await wait(480);
        setReleased(false);
        setY(HIDE_Y);              // retreat
        await wait(650);
        await wait(1_800);         // let the stamp be admired
        setStamped(false);
        setActive(false);
      })();
    };

    window.addEventListener("sk-order-complete", onComplete);
    return () => {
      window.removeEventListener("sk-order-complete", onComplete);
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, []);

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-[92] pointer-events-none" aria-hidden>
      <div
        className="absolute left-0 top-0 text-[var(--ink)]"
        style={{
          transform: `translate(${x}px, ${y + (pressed ? 10 : 0)}px)`,
          transition: pressed ? "transform 120ms ease-in" : "transform 640ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div
          className={released ? "sk-squish" : undefined}
          style={{
            transform: `scale(${pressed ? 1.2 : wind ? 0.9 : 1}, ${pressed ? 0.8 : wind ? 1.11 : 1})`,
            transformOrigin: "50% 100%",
            transition: pressed ? "transform 110ms ease-in" : "transform 170ms ease-out",
          }}
        >
          <HandIllustration />
        </div>
      </div>
      {stamped && (
        <div
          className="sk-pop absolute font-display-wide font-bold uppercase px-6 py-3 border-[3px] dept-accent"
          style={{
            left: stampPos.x,
            top: stampPos.y,
            transform: "translate(-50%, -50%) rotate(-8deg)",
            borderColor: "var(--dept)",
            background: "color-mix(in srgb, var(--bg) 82%, transparent)",
            fontSize: "clamp(1.4rem, 3vw, 2.2rem)",
            letterSpacing: "0.08em",
          }}
        >
          Worth it.
          <span className="block font-meta text-[9px] font-normal tracking-normal mt-1 opacity-70" style={{ letterSpacing: "0.02em" }}>
            — the hand approves
          </span>
        </div>
      )}
    </div>
  );
}
