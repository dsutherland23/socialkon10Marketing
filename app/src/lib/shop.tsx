import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { PROMO_CODES, serviceBySlug, type CurrencyCode, type ServiceProduct } from "./data";
import { useContent } from "./content";
import { refreshRates, fxStatus } from "./rates";
import { track } from "./seo";

export interface CartItem {
  key: string;              // unique line key
  serviceSlug: string;
  name: string;
  unitPrice: number;        // USD base (after fixed-tier or variant choice)
  tierLabel?: string;       // e.g. "Event Pro"
  variantLabel?: string;    // e.g. "Tri-Fold (6 Panels)"
  addons: { id: string; name: string; price: number }[];
  rush: boolean;
  billing: ServiceProduct["billing"];
  depositPct: number;
  templateSlug?: string;    // template marketplace entitlement (Templates PRD §54)
  license?: string;         // purchased license name, stored with the order
  version?: string;         // template version at purchase time (update notices §26)
}

interface ShopState {
  items: CartItem[];
  currency: CurrencyCode;
  setCurrency: (c: CurrencyCode) => void;
  /** bumps when live FX rates load — consumers re-render converted prices */
  fxTick: number;
  fxLive: boolean;
  add: (item: Omit<CartItem, "key">) => void;
  toggleServiceAddon: (
    serviceSlug: string,
    addon: { id: string; name: string; price: number },
    fallbackItem: Omit<CartItem, "key">
  ) => void;
  remove: (key: string) => void;
  clear: () => void;
  promo: string | null;
  applyPromo: (code: string) => string | null; // returns error or null
  clearPromo: () => void;
  flash: { pct: number; expiresAt: number } | null;   // "Catch me" easter-egg discount
  applyFlash: (pct: number, ttlMs: number) => void;
  clearFlash: () => void;
  subtotal: number;
  discount: number;
  total: number;
  count: number;
}

const ShopCtx = createContext<ShopState | null>(null);
const CART_KEY = "sk-cart";
const CUR_KEY = "sk-currency";

/** First-visit currency guess from timezone/locale — the selector always wins afterwards. */
function guessCurrency(): CurrencyCode {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    const lang = (navigator.language ?? "").toUpperCase();
    if (tz.includes("Jamaica") || lang.endsWith("-JM")) return "JMD";
    if (tz.includes("Bermuda") || lang.endsWith("-BM")) return "BMD";
    if (/^(America\/(Toronto|Vancouver|Montreal|Winnipeg|Halifax|Edmonton|Regina))/.test(tz) || lang.endsWith("-CA")) return "CAD";
  } catch { /* fall through to USD */ }
  return "USD";
}

export function ShopProvider({ children }: { children: ReactNode }) {
  const { promos: managedPromos } = useContent();
  // shipped defaults + admin-managed codes (PRD §34/§85)
  const allPromos = useMemo(() => ({ ...PROMO_CODES, ...managedPromos }), [managedPromos]);
  const [items, setItems] = useState<CartItem[]>(() => {
    try { return JSON.parse(localStorage.getItem(CART_KEY) || "[]"); } catch { return []; }
  });
  const [currency, setCurrency] = useState<CurrencyCode>(() => (localStorage.getItem(CUR_KEY) as CurrencyCode) || guessCurrency());
  const [promo, setPromo] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ pct: number; expiresAt: number } | null>(() => {
    // survives page reloads — the 2-minute clock keeps running (PRD: session-scoped)
    try {
      const f = JSON.parse(sessionStorage.getItem("sk-flash") || "null");
      return f && Date.now() < f.expiresAt ? f : null;
    } catch { return null; }
  });

  useEffect(() => { localStorage.setItem(CART_KEY, JSON.stringify(items)); }, [items]);
  useEffect(() => { localStorage.setItem(CUR_KEY, currency); }, [currency]);
  useEffect(() => {
    if (flash) sessionStorage.setItem("sk-flash", JSON.stringify(flash));
    else sessionStorage.removeItem("sk-flash");
  }, [flash]);

  // Live FX: refresh on boot, re-render consumers if converted prices moved
  const [fxTick, setFxTick] = useState(0);
  useEffect(() => {
    void refreshRates().then((changed) => { if (changed) setFxTick((v) => v + 1); });
  }, []);

  const add: ShopState["add"] = (item) => {
    const existingCount = items.filter(
      (x) => x.serviceSlug === item.serviceSlug && x.tierLabel === item.tierLabel && x.variantLabel === item.variantLabel
    ).length;

    const key = `${item.serviceSlug}-${item.tierLabel ?? ""}-${Date.now()}`;
    setItems((xs) => [...xs, { ...item, key }]);
    track("add_to_cart", { service: item.serviceSlug, tier: item.tierLabel, value: item.unitPrice });

    if (existingCount > 0) {
      toast.info(`"${item.name}" is already in your cart (now ×${existingCount + 1})`, {
        description: "An additional deliverable was added. Review in cart if you only need one.",
        action: {
          label: "View Cart →",
          onClick: () => { window.location.pathname = "/checkout"; },
        },
      });
    } else {
      toast.success(`Added "${item.name}" to cart`, {
        action: {
          label: "Checkout →",
          onClick: () => { window.location.pathname = "/checkout"; },
        },
      });
    }
  };

  const toggleServiceAddon: ShopState["toggleServiceAddon"] = (serviceSlug, addon, fallbackItem) => {
    setItems((xs) => {
      const idx = xs.findIndex((x) => x.serviceSlug === serviceSlug);
      if (idx === -1) {
        // Base item not in cart yet: add item with this addon attached directly
        const key = `${fallbackItem.serviceSlug}-${fallbackItem.tierLabel ?? ""}-${Date.now()}`;
        const newItem: CartItem = {
          ...fallbackItem,
          key,
          addons: [addon],
          rush: addon.id === "rush",
        };
        track("add_to_cart", { service: fallbackItem.serviceSlug, tier: fallbackItem.tierLabel, value: fallbackItem.unitPrice });
        toast.success(`Added "${fallbackItem.name}" with "${addon.name}" to cart`, {
          action: {
            label: "Checkout →",
            onClick: () => { window.location.pathname = "/checkout"; },
          },
        });
        return [...xs, newItem];
      }

      // Base item already in cart: toggle addon without creating duplicate base services
      const existing = xs[idx];
      const hasAddon = existing.addons.some((a) => a.id === addon.id);
      let updatedAddons: { id: string; name: string; price: number }[];

      if (hasAddon) {
        updatedAddons = existing.addons.filter((a) => a.id !== addon.id);
        toast.success(`Removed "${addon.name}" from "${existing.name}"`);
      } else {
        updatedAddons = [...existing.addons, addon];
        toast.success(`Added "${addon.name}" to "${existing.name}" in cart`, {
          action: {
            label: "Checkout →",
            onClick: () => { window.location.pathname = "/checkout"; },
          },
        });
      }

      const updatedItem: CartItem = {
        ...existing,
        addons: updatedAddons,
        rush: updatedAddons.some((a) => a.id === "rush"),
      };

      const copy = [...xs];
      copy[idx] = updatedItem;
      return copy;
    });
  };

  const remove = (key: string) => setItems((xs) => xs.filter((x) => x.key !== key));
  const clear = () => { setItems([]); setPromo(null); setFlash(null); };

  const applyPromo = (code: string) => {
    const c = code.trim().toUpperCase();
    if (!allPromos[c]) return "That code isn't valid.";
    setPromo(c);
    return null;
  };

  const applyFlash: ShopState["applyFlash"] = (pct, ttlMs) => {
    setFlash({ pct, expiresAt: Date.now() + ttlMs });
    track("flash_discount_won", { pct });
  };
  const clearFlash = () => setFlash(null);

  const { subtotal, discount, total } = useMemo(() => {
    const line = (i: CartItem) => {
      const base = i.unitPrice + i.addons.reduce((s, a) => s + a.price, 0);
      return i.rush ? base * 1.25 : base;
    };
    const sub = items.reduce((s, i) => s + line(i), 0);
    let disc = 0;
    if (promo && allPromos[promo]) {
      const p = allPromos[promo];
      // scoped codes only discount matching items
      const scoped = items.filter((i) => {
        if (promo === "EVENT2026") return i.serviceSlug.includes("event");
        if (promo === "BRAND20") return i.serviceSlug === "brand-identity";
        return true;
      });
      const base = scoped.reduce((s, i) => s + line(i), 0);
      disc = p.type === "pct" ? base * (p.value / 100) : Math.min(p.value, base);
    }
    // "Catch me" flash discount — stacks, whole cart, only while unexpired
    if (flash && Date.now() < flash.expiresAt) disc += sub * (flash.pct / 100);
    return { subtotal: sub, discount: disc, total: Math.max(0, sub - disc) };
  }, [items, promo, allPromos, flash]);

  const value: ShopState = {
    items, currency, setCurrency, fxTick, fxLive: fxStatus().live, add, toggleServiceAddon, remove, clear,
    promo, applyPromo, clearPromo: () => setPromo(null),
    flash, applyFlash, clearFlash,
    subtotal, discount, total, count: items.length,
  };
  return <ShopCtx.Provider value={value}>{children}</ShopCtx.Provider>;
}

export function useShop() {
  const ctx = useContext(ShopCtx);
  if (!ctx) throw new Error("useShop outside ShopProvider");
  return ctx;
}

/** Deposit due today for a cart line. */
export function depositFor(item: CartItem, pctOverride?: number): number {
  const svc = serviceBySlug(item.serviceSlug);
  const pct = pctOverride ?? svc?.depositPct ?? item.depositPct;
  const base = item.unitPrice + item.addons.reduce((s, a) => s + a.price, 0);
  const priced = item.rush ? base * 1.25 : base;
  return Math.round(priced * (pct / 100));
}
