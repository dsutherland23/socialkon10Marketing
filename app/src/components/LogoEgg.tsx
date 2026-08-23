import { useEffect, useRef, useState } from "react";
import { HandIllustration } from "./HandEgg";
import { track } from "../lib/seo";

/* ------------------------------------------------------------------
   EASTER EGG — "The Hand returns: logo check" (rare, one-time)
   On a later session, the hand descends onto the header logo, drags
   it a few pixels off-center, holds… then nudges it back and leaves.
   Homepage only, ~30% of eligible sessions, 3-minute dwell, once ever.
------------------------------------------------------------------- */

const FLAG = "sk-hand-egg-logo-done";
const FIRST_FLAG = "sk-hand-egg-done";
const DELAY_MS = 180_000;  // 3 minutes
const CHANCE = 0.3;        // rare — 30% of eligible sessions
const HIDE_Y = -150;
const GRAB_TIP = 96;       // fingertip offset for the grab point

export default function LogoEgg() {
  const [x, setX] = useState(0);
  const [y, setY] = useState(HIDE_Y);
  const [dragging, setDragging] = useState(false);
  const [caption, setCaption] = useState("");
  const [capPos, setCapPos] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    // homepage only, rare, one-time, and only after the first hand egg ran
    if (window.location.pathname !== "/") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // ?egg=logo — preview without the wait / chance / flags (dev/demo hook)
    const demo = new URLSearchParams(window.location.search).get("egg") === "logo";
    if (!demo) {
      if (!localStorage.getItem(FIRST_FLAG)) return;
      if (localStorage.getItem(FLAG)) return;
      if (Math.random() > CHANCE) { localStorage.setItem(FLAG, "1"); return; }
    }

    const wait = (ms: number) => new Promise<void>((r) => { timers.current.push(setTimeout(r, ms)); });

    const start = setTimeout(() => {
      const logo = document.querySelector<HTMLElement>("header img");
      if (!logo) { localStorage.setItem(FLAG, "1"); return; }
      const r = logo.getBoundingClientRect();
      const grabX = r.left + r.width / 2 - 32;
      const grabY = r.top + r.height / 2 - GRAB_TIP;

      setX(grabX);
      setCapPos({ x: r.left + r.width / 2 + 90, y: r.bottom + 16 });
      setActive(true);
      track("easter_egg_hand_logo", {});

      logo.style.transition = "transform 650ms cubic-bezier(0.22, 1, 0.36, 1)";

      (async () => {
        // descend + grab
        setY(grabY);
        await wait(750);
        setDragging(true);
        await wait(180);

        // pull the logo off-center — hand and logo move together
        logo.style.transform = "translate(26px, 4px) rotate(-5deg)";
        setX(grabX + 26);
        setY(grabY + 4);
        await wait(700);
        setCaption("…just checking it's bolted down.");
        await wait(1_200);

        // nudge it back, let go, leave
        logo.style.transform = "";
        setX(grabX);
        setY(grabY);
        await wait(700);
        setDragging(false);
        await wait(150);
        setY(HIDE_Y);
        await wait(650);
        await wait(900);
        setCaption("");
        setActive(false);
        logo.style.transition = "";
        if (!demo) localStorage.setItem(FLAG, "1");
      })();
    }, demo ? 1_500 : DELAY_MS);
    timers.current.push(start);

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      const logo = document.querySelector<HTMLElement>("header img");
      if (logo) { logo.style.transform = ""; logo.style.transition = ""; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-[90] pointer-events-none" aria-hidden>
      <div
        className="absolute left-0 top-0 text-[var(--ink)]"
        style={{
          transform: `translate(${x}px, ${y}px)`,
          transition: "transform 650ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div
          style={{
            transform: dragging ? "scale(1.09, 0.91)" : "scale(1, 1)",
            transformOrigin: "50% 100%",
            transition: "transform 180ms ease-out",
          }}
        >
          <HandIllustration />
        </div>
      </div>
      {caption && (
        <div
          className="sk-pop absolute font-meta text-[10px] px-3 py-2 border border-[var(--line-strong)] whitespace-nowrap"
          style={{ left: capPos.x, top: capPos.y, background: "var(--bg)", color: "var(--ink)" }}
        >
          {caption}
        </div>
      )}
    </div>
  );
}
