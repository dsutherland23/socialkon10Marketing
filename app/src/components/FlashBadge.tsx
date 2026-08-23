import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useShop } from "../lib/shop";
import { useMoney } from "../lib/money";

/* ------------------------------------------------------------------
   FLASH DISCOUNT BADGE — visible countdown after winning the
   "Catch me" easter egg. Ticks every second, expires the discount
   at zero, and links straight to checkout while live.
------------------------------------------------------------------- */

export default function FlashBadge() {
  const { flash, clearFlash, subtotal } = useShop();
  const money = useMoney();
  const [, tick] = useState(0);

  const live = flash && Date.now() < flash.expiresAt;

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [live]);

  useEffect(() => {
    if (flash && Date.now() >= flash.expiresAt) {
      clearFlash();
      toast("Flash discount expired — catch the token again next visit.");
    }
  }, [flash, clearFlash]);

  if (!live || !flash) return null;

  const remain = Math.max(0, Math.ceil((flash.expiresAt - Date.now()) / 1000));
  const mm = Math.floor(remain / 60);
  const ss = String(remain % 60).padStart(2, "0");
  const urgent = remain <= 30;

  return (
    <Link
      to="/checkout"
      className="fixed bottom-4 left-4 z-[85] flex items-center gap-3 px-4 py-3 border border-[var(--line-strong)] shadow-lg"
      style={{ background: "var(--ink)", color: "var(--bg)" }}
      aria-label={`Flash discount ${flash.pct}% off, ${mm}:${ss} remaining — go to checkout`}
    >
      <span className={`font-display-wide text-base font-bold tabular-nums ${urgent ? "text-red-400" : "dept-accent"}`}>{mm}:{ss}</span>
      <span className="font-meta text-[9px] leading-snug">
        CATCH-ME −{flash.pct}% · saving {money(subtotal * (flash.pct / 100))}
        <span className="block opacity-60">checkout before it runs out →</span>
      </span>
    </Link>
  );
}
