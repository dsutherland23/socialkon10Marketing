import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DESIGN_CATEGORIES, DESIGN_DISCOUNTS, DESIGN_OPTIONS, DESIGN_PACKAGES, DESIGN_SERVICES, DESIGN_SIZES,
  bestDiscount, priceLine,
  type ConfigSelection, type DesignCategory, type DesignDiscount, type DesignOption,
  type DesignPackage, type DesignService, type DesignSize, type PricedLine,
} from "./design";
import { listManaged } from "./backend";
import { track } from "./seo";

/* ------------------------------------------------------------------
   DESIGN CATALOG PROVIDER — database is the source of truth (PRD §57).
   Managed docs merge OVER the shipped seeds by slug/id: an admin edit
   to "business-card" overrides the seed; new slugs extend the catalog;
   active:false hides. Refetches live on sk-content-changed.
------------------------------------------------------------------- */

interface Catalog {
  categories: DesignCategory[];
  services: DesignService[];
  sizes: DesignSize[];
  options: DesignOption[];
  packages: DesignPackage[];
  discounts: DesignDiscount[];
  ready: boolean;
}

const seedCatalog: Catalog = {
  categories: DESIGN_CATEGORIES,
  services: DESIGN_SERVICES,
  sizes: DESIGN_SIZES,
  options: DESIGN_OPTIONS,
  packages: DESIGN_PACKAGES,
  discounts: DESIGN_DISCOUNTS,
  ready: false,
};

const CatalogCtx = createContext<Catalog>(seedCatalog);

function mergeBy<T>(seeds: T[], managed: Record<string, unknown>[], key: string): T[] {
  const map = new Map<string, T>(seeds.map((s) => [String((s as Record<string, unknown>)[key]), s]));
  managed.forEach((m) => {
    const k = String(m[key] ?? "").trim();
    if (!k) return;
    const existing = map.get(k);
    map.set(k, { ...(existing ?? {}), ...m, [key]: k } as T);
  });
  return [...map.values()];
}

export function DesignCatalogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Catalog>(seedCatalog);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [cats, svcs, mSizes, mOpts, mPkgs, mDiscs] = await Promise.all([
          listManaged("designCategories"),
          listManaged("designServices"),
          listManaged("designSizes"),
          listManaged("designOptions"),
          listManaged("designPackages"),
          listManaged("designDiscounts"),
        ]);
        if (!alive) return;
        const bool = (v: unknown, dflt: boolean) => (v === undefined ? dflt : v === true || v === "true");
        const num = (v: unknown, dflt: number) => (Number.isFinite(Number(v)) && v !== "" ? Number(v) : dflt);

        const categories = mergeBy<DesignCategory>(DESIGN_CATEGORIES, cats, "slug")
          .map((c) => ({ ...c, active: bool((c as never)["active"], true), sort: num((c as never)["sort"], 99) }))
          .filter((c) => c.active)
          .sort((a, b) => a.sort - b.sort);

        const sizes = mergeBy<DesignSize>(DESIGN_SIZES, mSizes, "id")
          .map((s) => ({ ...s, active: bool((s as never)["active"], true), w: num((s as never)["w"], 0), h: num((s as never)["h"], 0) }))
          .filter((s) => s.active);

        const options = mergeBy<DesignOption>(DESIGN_OPTIONS, mOpts, "id")
          .map((o) => ({ ...o, active: bool((o as never)["active"], true), price: num((o as never)["price"], 0) }))
          .filter((o) => o.active);

        const services = mergeBy<DesignService>(DESIGN_SERVICES, svcs, "slug")
          .map((s) => ({
            ...s,
            active: bool((s as never)["active"], true),
            price: num((s as never)["price"], 0),
            minQty: num((s as never)["minQty"], 1),
            maxQty: num((s as never)["maxQty"], 50),
            revisions: num((s as never)["revisions"], 2),
            sizes: Array.isArray(s.sizes) ? s.sizes : [],
            optionIds: Array.isArray(s.optionIds) ? s.optionIds : [],
            recommended: Array.isArray(s.recommended) ? s.recommended : [],
            tiers: Array.isArray(s.tiers) && s.tiers.length > 0
              ? (s.tiers as { id?: string; name?: string; blurb?: string; price?: number; turnaround?: string; revisions?: number }[])
                  .filter((t) => t && t.name && Number.isFinite(Number(t.price)))
                  .map((t, i) => ({
                    id: String(t.id ?? `tier-${i}`),
                    name: String(t.name),
                    blurb: String(t.blurb ?? ""),
                    price: Number(t.price),
                    turnaround: t.turnaround ? String(t.turnaround) : undefined,
                    revisions: Number.isFinite(Number(t.revisions)) ? Number(t.revisions) : undefined,
                  }))
              : undefined,
            variations: Array.isArray(s.variations) && s.variations.length > 0
              ? (s.variations as { id?: string; name?: string; options?: any[] }[])
                  .filter((g) => g && g.name && Array.isArray(g.options) && g.options.length > 0)
                  .map((g, gi) => ({
                    id: String(g.id ?? `group-${gi}`),
                    name: String(g.name),
                    options: (g.options || [])
                      .filter((o) => o && o.name && Number.isFinite(Number(o.price)))
                      .map((o, oi) => ({
                        id: String(o.id ?? `opt-${oi}`),
                        name: String(o.name),
                        blurb: o.blurb ? String(o.blurb) : undefined,
                        price: Number(o.price),
                        turnaround: o.turnaround ? String(o.turnaround) : undefined,
                        revisions: Number.isFinite(Number(o.revisions)) ? Number(o.revisions) : undefined,
                        isDefault: Boolean(o.isDefault),
                        icon: o.icon ? String(o.icon) : undefined,
                      })),
                  }))
              : undefined,
          }))
          .filter((s) => s.active);

        const packages = mergeBy<DesignPackage>(DESIGN_PACKAGES, mPkgs, "slug")
          .map((p) => ({ ...p, active: bool((p as never)["active"], true), items: Array.isArray(p.items) ? p.items : [] }))
          .filter((p) => p.active);

        const discounts = mergeBy<DesignDiscount>(DESIGN_DISCOUNTS, mDiscs, "id")
          .map((d) => ({ ...d, active: bool((d as never)["active"], true), minSubtotal: num((d as never)["minSubtotal"], 0), minItems: num((d as never)["minItems"], 2), value: num((d as never)["value"], 0), priority: num((d as never)["priority"], 0) }))
          .filter((d) => d.active);

        setState({ categories, services, sizes, options, packages, discounts, ready: true });
      } catch { /* seeds remain */ }
    };
    load();
    window.addEventListener("sk-content-changed", load);
    return () => { alive = false; window.removeEventListener("sk-content-changed", load); };
  }, []);

  return <CatalogCtx.Provider value={state}>{children}</CatalogCtx.Provider>;
}

export function useDesignCatalog() {
  return useContext(CatalogCtx);
}

/* ------------------------------------------------------------------
   CUSTOM PACKAGE (cart) — stores CONFIGURATION only; prices are always
   recomputed live from the catalog (PRD §52/§57). Persisted locally.
------------------------------------------------------------------- */

export interface PackageItem {
  key: string;
  slug: string;
  sel: ConfigSelection;
}

interface PackageState {
  items: PackageItem[];
  add: (slug: string, sel?: ConfigSelection) => void;
  remove: (key: string) => void;
  setQty: (key: string, qty: number) => void;
  clear: () => void;
  loadPackage: (pkg: DesignPackage) => void;
  count: number;
  lines: (PricedLine & { key: string })[];
  subtotal: number;
  discount: { name: string; amount: number } | null;
  total: number;
  hasQuoteOnly: boolean;
}

const PackageCtx = createContext<PackageState | null>(null);
const KEY = "sk-design-package";

export function DesignPackageProvider({ children }: { children: ReactNode }) {
  const { services, sizes, options, discounts } = useDesignCatalog();
  const [items, setItems] = useState<PackageItem[]>(() => {
    try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
  });
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(items)); }, [items]);

  const defaultSel = (slug: string): ConfigSelection => {
    const s = services.find((x) => x.slug === slug);
    const def = s?.sizes.find((x) => x.isDefault) ?? s?.sizes[0];
    const defTier = s?.tiers && s.tiers.length > 0 ? s.tiers[0].id : undefined;
    return { sizeId: def?.sizeId, tierId: defTier, optionIds: [], qty: s?.minQty ?? 1 };
  };

  const add: PackageState["add"] = (slug, sel) => {
    setItems((xs) => [...xs, { key: `${slug}-${Date.now()}`, slug, sel: sel ?? defaultSel(slug) }]);
    track("package_add", { service: slug });
  };
  const remove = (key: string) => setItems((xs) => xs.filter((x) => x.key !== key));
  const setQty = (key: string, qty: number) =>
    setItems((xs) => xs.map((x) => (x.key === key ? { ...x, sel: { ...x.sel, qty } } : x)));
  const clear = () => setItems([]);
  const loadPackage = (pkg: DesignPackage) => {
    setItems(pkg.items.filter((it) => services.some((s) => s.slug === it.slug))
      .map((it, i) => ({ key: `${it.slug}-${Date.now()}-${i}`, slug: it.slug, sel: { ...defaultSel(it.slug), qty: it.qty } })));
    track("package_load_predefined", { package: pkg.slug });
  };

  const { lines, subtotal, discount, total, hasQuoteOnly } = useMemo(() => {
    const lines = items
      .map((it) => {
        const s = services.find((x) => x.slug === it.slug);
        return s ? { ...priceLine(s, it.sel, { sizes, options }), key: it.key } : null;
      })
      .filter(Boolean) as (PricedLine & { key: string })[];
    const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
    const d = bestDiscount(subtotal, lines.length, discounts);
    return {
      lines, subtotal,
      discount: d ? { name: d.discount.name, amount: d.amount } : null,
      total: Math.max(0, subtotal - (d?.amount ?? 0)),
      hasQuoteOnly: lines.some((l) => l.isQuote),
    };
  }, [items, services, sizes, options, discounts]);

  const value: PackageState = {
    items, add, remove, setQty, clear, loadPackage,
    count: items.length, lines, subtotal, discount, total, hasQuoteOnly,
  };
  return <PackageCtx.Provider value={value}>{children}</PackageCtx.Provider>;
}

export function useDesignPackage() {
  const ctx = useContext(PackageCtx);
  if (!ctx) throw new Error("useDesignPackage outside provider");
  return ctx;
}
