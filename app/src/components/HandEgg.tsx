import { useEffect, useRef, useState } from "react";
import { useTheme } from "../lib/theme";
import { track } from "../lib/seo";

/* ------------------------------------------------------------------
   EASTER EGG — "The Hand" (one-time, after 2 min of browsing)
   A line-art hand descends from the top of the screen, presses the
   header theme toggle to switch on dark mode, retreats… then comes
   back and restores whatever the theme was. Runs once ever
   (localStorage flag), never for reduced-motion users, never when
   the theme is already dark (nothing to play with).
------------------------------------------------------------------- */

const FLAG = "sk-hand-egg-done";
const DELAY_MS = 120_000;   // 2 minutes of browsing
const HOLD_MS = 2_600;      // how long dark mode stays on
const HIDE_Y = -150;        // fully above the viewport
const TIP = 102;            // fingertip offset from top of the SVG

/* Classic cartoon glove — white fill + ink outline reads on light AND dark. */
const GLOVE_INK = "#20242b";

export function HandIllustration() {
  return (
    <svg
      width="64"
      height="120"
      viewBox="0 0 64 120"
      fill="none"
      aria-hidden
      style={{ filter: "drop-shadow(0 8px 12px rgba(0,0,0,0.22))" }}
    >
      {/* cuff */}
      <rect x="21" y="-6" width="25" height="32" rx="9" fill="#ffffff" stroke={GLOVE_INK} strokeWidth="3" />
      <path d="M23 19 C29 23 38 23 44 19" stroke={GLOVE_INK} strokeWidth="2.5" strokeLinecap="round" />
      {/* glove — mitten palm, thumb left, curled-finger scallops right, index extended */}
      <path
        fill="#ffffff"
        stroke={GLOVE_INK}
        strokeWidth="3"
        strokeLinejoin="round"
        strokeLinecap="round"
        d="M 23 23
           C 15 26 11 33 11 40
           C 10.8 42 10.5 42.5 9.5 43.5
           C 4.5 41 1.5 44.5 2.5 49.5
           C 3.5 54.5 8 55.5 10.5 52.5
           C 10.3 58 11.5 62 14.5 65
           C 16.5 67.5 20.5 67.5 23 65
           C 22.3 74 22.3 86 23.5 95
           C 24 101.5 33 101.5 33.5 95
           C 34.7 86 34.7 74 34 65
           C 35.5 68.5 39.3 69.2 41 66
           C 42.3 69.2 46 69.7 47.2 66.3
           C 49.5 64.5 51.5 60 52 53
           C 53 42 51 30 45 23
           Z"
      />
      {/* knuckle creases */}
      <path d="M21 32 C26 30 34 30 39 32" stroke={GLOVE_INK} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M21.5 38 C26.5 36 33.5 36 38.5 38" stroke={GLOVE_INK} strokeWidth="2.5" strokeLinecap="round" />
      {/* thumb crease */}
      <path d="M7 44.5 C9 47.5 9.5 50 9.5 52.5" stroke={GLOVE_INK} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function HandEgg() {
  const { theme, resolved, setTheme } = useTheme();
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const resolvedRef = useRef(resolved);
  resolvedRef.current = resolved;

  const [x, setX] = useState(0);
  const [y, setY] = useState(HIDE_Y);
  const [capY, setCapY] = useState(0);
  const [wind, setWind] = useState(false);      // anticipation stretch
  const [pressed, setPressed] = useState(false); // contact squash
  const [released, setReleased] = useState(false); // jelly bounce-back
  const [caption, setCaption] = useState("");
  const [active, setActive] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    // ?egg=demo — preview the hand without the 2-minute wait (dev/demo hook)
    const demo = new URLSearchParams(window.location.search).get("egg") === "demo";
    if (localStorage.getItem(FLAG) && !demo) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const wait = (ms: number) => new Promise<void>((r) => { timers.current.push(setTimeout(r, ms)); });

    const start = setTimeout(() => {
      // already dark — nothing for the hand to show off
      if (resolvedRef.current === "dark") { if (!demo) localStorage.setItem(FLAG, "1"); return; }
      const btn = document.querySelector<HTMLButtonElement>('button[aria-label^="Theme:"]');
      if (!btn) return;
      const original = themeRef.current;
      const r = btn.getBoundingClientRect();
      const tipY = r.top + r.height / 2 - TIP;

      setX(r.left + r.width / 2 - 32);
      setCapY(r.top + r.height + 14);
      setActive(true);
      track("easter_egg_hand", { from: original });

      (async () => {
        // visit 1 — turn the lights off
        setY(tipY);
        await wait(750);
        setWind(true);                 // anticipation stretch
        await wait(170);
        setWind(false);
        setPressed(true);              // squash on contact
        await wait(170);
        setTheme("dark");
        setCaption("Let's see this in the dark.");
        track("easter_egg_hand_toggle", { to: "dark" });
        await wait(230);
        setPressed(false);
        setReleased(true);             // jelly bounce-back
        await wait(480);
        setReleased(false);
        setY(HIDE_Y);
        await wait(650);
        await wait(HOLD_MS);   // caption stays readable during the dark hold
        setCaption("");

        // visit 2 — put it back, as you were
        setY(tipY);
        await wait(750);
        setWind(true);
        await wait(170);
        setWind(false);
        setPressed(true);
        await wait(170);
        setTheme(original);
        setCaption("…as you were.");
        track("easter_egg_hand_toggle", { to: original });
        await wait(230);
        setPressed(false);
        setReleased(true);
        await wait(480);
        setReleased(false);
        setY(HIDE_Y);
        await wait(650);
        await wait(1_400);     // let the farewell line land
        setCaption("");
        setActive(false);
        if (!demo) localStorage.setItem(FLAG, "1");
      })();
    }, demo ? 1_500 : DELAY_MS);
    timers.current.push(start);

    return () => { timers.current.forEach(clearTimeout); timers.current = []; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-[90] pointer-events-none" aria-hidden>
      {/* the hand */}
      <div
        className="absolute left-0 top-0 text-[var(--ink)]"
        style={{
          transform: `translate(${x}px, ${y + (pressed ? 9 : 0)}px)`,
          transition: pressed ? "transform 120ms ease-in" : "transform 640ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div
          className={released ? "sk-squish" : undefined}
          style={{
            transform: `scale(${pressed ? 1.16 : wind ? 0.92 : 1}, ${pressed ? 0.84 : wind ? 1.09 : 1})`,
            transformOrigin: "50% 100%",
            transition: pressed ? "transform 110ms ease-in" : "transform 170ms ease-out",
          }}
        >
          <HandIllustration />
        </div>
      </div>
      {/* the caption */}
      {caption && (
        <div
          className="sk-pop absolute font-meta text-[10px] px-3 py-2 border border-[var(--line-strong)] whitespace-nowrap"
          style={{
            left: x + 32,
            top: capY,
            transform: "translateX(-50%)",
            background: "var(--bg)",
            color: "var(--ink)",
          }}
        >
          {caption}
        </div>
      )}
    </div>
  );
}
