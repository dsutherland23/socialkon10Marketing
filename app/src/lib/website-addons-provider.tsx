/* ------------------------------------------------------------------
   WEBSITE ADD-ON CATALOG PROVIDER
   Merges Firestore admin overrides over the WEB_ADDON_CATEGORIES
   seed data. Same reactive pattern as DesignCatalogProvider:
   • Firestore doc keyed by "id" overrides the matching seed entry
   • new ids not in seeds are appended
   • active:false hides the entry from the live configurator
   Re-fetches on "sk-content-changed" custom event so admin edits
   appear instantly with no page reload.
------------------------------------------------------------------- */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { listManaged } from "./backend";
import {
  WEB_ADDON_CATEGORIES,
  ALL_WEB_ADDONS,
  DEFAULT_CATEGORIES,
  ADVANCED_CATEGORIES,
  type AddonCategory,
  type WebAddon,
} from "./website-addons";

/* ---------- context shape ---------- */

export interface WebsiteAddonsCatalog {
  /** All categories (default + advanced), filtered to active:true, ordered by sort */
  categories: AddonCategory[];
  /** Flat list of all add-ons from all categories */
  allAddons: WebAddon[];
  /** Same split as the static helpers — for the live configurator */
  defaultCategories: AddonCategory[];
  advancedCategories: AddonCategory[];
  ready: boolean;
}

const seedCatalog: WebsiteAddonsCatalog = {
  categories: WEB_ADDON_CATEGORIES,
  allAddons: ALL_WEB_ADDONS,
  defaultCategories: DEFAULT_CATEGORIES,
  advancedCategories: ADVANCED_CATEGORIES,
  ready: false,
};

const Ctx = createContext<WebsiteAddonsCatalog>(seedCatalog);

/* ---------- helpers ---------- */

function mergeById<T>(seeds: T[], managed: Record<string, unknown>[], idKey: string): T[] {
  const map = new Map<string, T>(seeds.map((s) => [String((s as Record<string, unknown>)[idKey]), s]));
  managed.forEach((m) => {
    const k = String(m[idKey] ?? "").trim();
    if (!k) return;
    const existing = map.get(k);
    map.set(k, { ...(existing ?? {}), ...m, [idKey]: k } as T);
  });
  return [...map.values()];
}

/** Merge Firestore add-on overrides into the seed category list */
function buildCatalog(
  managedCats: Record<string, unknown>[],
  managedAddons: Record<string, unknown>[]
): Pick<WebsiteAddonsCatalog, "categories" | "allAddons" | "defaultCategories" | "advancedCategories"> {
  const bool = (v: unknown, dflt: boolean) =>
    v === undefined ? dflt : v === true || v === "true";
  const num = (v: unknown, dflt: number) =>
    Number.isFinite(Number(v)) && v !== "" ? Number(v) : dflt;

  // 1. Merge category metadata overrides (name, desc, icon, sort, active)
  const mergedCats = mergeById<AddonCategory>(WEB_ADDON_CATEGORIES, managedCats, "id")
    .map((c) => ({
      ...c,
      active: bool((c as never)["active"], true),
      sort: num((c as never)["sort"], 99),
    }));

  // 2. Build a flat map of all add-on overrides (keyed by id)
  const addonOverrides = new Map<string, Record<string, unknown>>();
  managedAddons.forEach((m) => {
    const k = String(m["id"] ?? "").trim();
    if (k) addonOverrides.set(k, m);
  });

  // 3. Merge add-on overrides into each category, then append brand-new ones
  const categories: AddonCategory[] = mergedCats
    .filter((c) => c.active !== false)
    .sort((a, b) => ((a as never)["sort"] as number) - ((b as never)["sort"] as number))
    .map((cat) => {
      // Merge overrides into existing add-ons
      const mergedAddons: WebAddon[] = cat.addons
        .map((a) => {
          const ov = addonOverrides.get(a.id);
          if (!ov) return a;
          addonOverrides.delete(a.id); // mark as consumed
          return {
            ...a,
            ...ov,
            id: a.id,
            categoryId: a.categoryId,
            price: num(ov["price"], a.price),
            eligible: Array.isArray(ov["eligible"]) ? ov["eligible"] as WebAddon["eligible"] : a.eligible,
            billing: (ov["billing"] === "monthly" ? "monthly" : a.billing) as WebAddon["billing"],
            popular: bool(ov["popular"], a.popular ?? false),
            qtyEnabled: bool(ov["qtyEnabled"], a.qtyEnabled ?? false),
            maxQty: num(ov["maxQty"], a.maxQty ?? 100),
            requires: Array.isArray(ov["requires"]) ? ov["requires"] as string[] : a.requires,
            conflicts: Array.isArray(ov["conflicts"]) ? ov["conflicts"] as string[] : a.conflicts,
            active: bool(ov["active"], true),
          } as WebAddon;
        })
        .filter((a) => (a as never)["active"] !== false);

      // Append net-new add-ons that belong to this category
      addonOverrides.forEach((ov, id) => {
        if (String(ov["categoryId"] ?? "") === cat.id && bool(ov["active"], true)) {
          mergedAddons.push({
            id,
            name: String(ov["name"] ?? id),
            desc: String(ov["desc"] ?? ""),
            categoryId: cat.id,
            price: num(ov["price"], 0),
            pricePrefix: ov["pricePrefix"] === "from" ? "from" : undefined,
            priceSuffix: ov["priceSuffix"] ? String(ov["priceSuffix"]) : undefined,
            billing: ov["billing"] === "monthly" ? "monthly" : "one_time",
            eligible: Array.isArray(ov["eligible"]) ? ov["eligible"] as WebAddon["eligible"] : ["SK-WEB-01", "SK-WEB-02", "SK-WEB-03"],
            popular: bool(ov["popular"], false),
            qtyEnabled: bool(ov["qtyEnabled"], false),
            maxQty: num(ov["maxQty"], 100),
            requires: Array.isArray(ov["requires"]) ? ov["requires"] as string[] : undefined,
            conflicts: Array.isArray(ov["conflicts"]) ? ov["conflicts"] as string[] : undefined,
          });
          addonOverrides.delete(id);
        }
      });

      return { ...cat, addons: mergedAddons };
    });

  const allAddons = categories.flatMap((c) => c.addons);
  const defaultCategories = categories.filter((c) => !(c as never)["advanced"]);
  const advancedCategories = categories.filter((c) => !!(c as never)["advanced"]);

  return { categories, allAddons, defaultCategories, advancedCategories };
}

/* ---------- provider ---------- */

export function WebsiteAddonsCatalogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WebsiteAddonsCatalog>(seedCatalog);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [managedCats, managedAddons] = await Promise.all([
          listManaged("websiteAddonCategories"),
          listManaged("websiteAddons"),
        ]);
        if (!alive) return;
        const built = buildCatalog(managedCats, managedAddons);
        setState({ ...built, ready: true });
      } catch {
        setState((s) => ({ ...s, ready: true }));
      }
    };
    void load();
    const onChanged = () => { void load(); };
    window.addEventListener("sk-content-changed", onChanged);
    return () => {
      alive = false;
      window.removeEventListener("sk-content-changed", onChanged);
    };
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

/* ---------- consumer hook ---------- */

export function useWebsiteAddonsCatalog(): WebsiteAddonsCatalog {
  return useContext(Ctx);
}
