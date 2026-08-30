/* ------------------------------------------------------------------
   POWER UP YOUR WEBSITE — add-on configurator (PRD v1.0.0)
   Full-screen sheet on mobile, large dialog on desktop.
   Reads ALL pricing/rules from lib/website-addons.ts (single source).
   Base package prices come from data.ts and are never altered.
   Output feeds the EXISTING cart → checkout flow unchanged.
------------------------------------------------------------------- */

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { serviceBySlug, type ServiceProduct } from "../lib/data";
import { useShop } from "../lib/shop";
import { useMoney } from "../lib/money";
import { track } from "../lib/seo";
import {
  ADVANCED_CATEGORIES,
  DEFAULT_CATEGORIES,
  UPGRADE_MESSAGE,
  addonEligibleFor,
  addonPriceLabel,
  priceConfiguration,
  setAddonQty,
  toggleAddon,
  type AddonSelection,
  type WebAddon,
  type WebPackageId,
} from "../lib/website-addons";
import { useWebsiteAddonsCatalog } from "../lib/website-addons-provider";

const inputBtn = "font-meta text-[10px] px-3 py-2 border border-[var(--line)] hover:border-[var(--dept)] transition-colors";

/** minimal stroke glyphs — no emoji in pricing UI (PRD §visual_direction) */
function CatIcon({ k }: { k: string }) {
  const paths: Record<string, string> = {
    layers: "M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5",
    target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 12h.01",
    chat: "M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5z",
    search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
    chart: "M4 20V10M10 20V4M16 20v-8M22 20H2",
    zap: "M13 2L4 14h6l-1 8 9-12h-6l1-8z",
    pen: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z",
    cart: "M6 6h15l-1.5 9h-12L5 3H2M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM18 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
    flow: "M6 3v6a3 3 0 0 0 3 3h6a3 3 0 0 1 3 3v6M4 3h4M16 21h4",
    spark: "M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8",
    shield: "M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z",
  };
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={paths[k] ?? paths.layers} />
    </svg>
  );
}

export interface WebConfiguratorProps {
  pkg: ServiceProduct;             // base package from data.ts (prices untouched)
  onClose: () => void;
}

export function WebConfigurator({ pkg, onClose }: WebConfiguratorProps) {
  const money = useMoney();
  const { add } = useShop();
  const navigate = useNavigate();
  const pkgId = pkg.id as WebPackageId;
  const dialogRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const { defaultCategories, advancedCategories, allAddons } = useWebsiteAddonsCatalog();

  /* selections persist for the session per package (PRD: no data loss on close) */
  const storeKey = `sk-web-config-${pkgId}`;
  const [sel, setSel] = useState<AddonSelection>(() => {
    try { return JSON.parse(sessionStorage.getItem(storeKey) || "{}"); } catch { return {}; }
  });
  const [care, setCare] = useState(() => sessionStorage.getItem(`${storeKey}-care`) === "1");
  const [cat, setCat] = useState(() => defaultCategories[0]?.id || DEFAULT_CATEGORIES[0].id);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => { try { sessionStorage.setItem(storeKey, JSON.stringify(sel)); } catch { /* best-effort */ } }, [sel, storeKey]);
  useEffect(() => { try { sessionStorage.setItem(`${storeKey}-care`, care ? "1" : "0"); } catch { /* best-effort */ } }, [care, storeKey]);

  /* modal behavior: Escape + scroll lock + initial focus */
  useEffect(() => {
    track("addon_configurator_opened", { package_id: pkg.id, package_name: pkg.name });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLElement>("button")?.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const priced = useMemo(() => priceConfiguration(sel, allAddons), [sel, allAddons]);
  const carePlan = serviceBySlug("website-care-plan");
  const careMonthly = care && carePlan ? carePlan.price : 0;
  const projectTotal = pkg.price + priced.oneTime;
  const monthlyTotal = priced.monthly + careMonthly;
  const selectionCount = Object.keys(sel).length;

  const currentDefaultCats = defaultCategories.length > 0 ? defaultCategories : DEFAULT_CATEGORIES;
  const currentAdvCats = advancedCategories.length > 0 ? advancedCategories : ADVANCED_CATEGORIES;
  const categories = showAdvanced ? [...currentDefaultCats, ...currentAdvCats] : currentDefaultCats;
  const activeCat = categories.find((c) => c.id === cat) ?? categories[0];

  const onToggle = (a: WebAddon) => {
    const { next, notes } = toggleAddon(sel, a, allAddons);
    const turningOn = !sel[a.id];
    setSel(next);
    notes.forEach((n) => toast.info(n));
    track(turningOn ? "addon_selected" : "addon_removed", {
      package_id: pkg.id, addon_id: a.id, addon_name: a.name, addon_category: a.categoryId, addon_price: a.price,
    });
  };

  const onQty = (a: WebAddon, qty: number) => {
    setSel((s) => setAddonQty(s, a, qty));
    track("addon_quantity_changed", { addon_id: a.id, addon_name: a.name, quantity: qty });
  };

  const clearAll = () => { setSel({}); setCare(false); track("addon_removed", { package_id: pkg.id, clear_all: true }); };

  const startProject = () => {
    // Base package + one-time add-ons → one cart line (existing checkout reads this shape)
    add({
      serviceSlug: pkg.slug,
      name: pkg.name,
      unitPrice: pkg.price,
      addons: priced.oneTimeLines.map((l) => ({
        id: l.addon.id,
        name: l.qty > 1 ? `${l.addon.name} ×${l.qty}` : l.addon.name,
        price: l.lineTotal,
      })),
      rush: false,
      billing: pkg.billing,
      depositPct: pkg.depositPct,
    });
    // Monthly services → their own recurring lines (never mixed into the project total)
    for (const l of priced.monthlyLines) {
      add({ serviceSlug: l.addon.id, name: l.addon.name, unitPrice: l.lineTotal, addons: [], rush: false, billing: "monthly", depositPct: 100 });
    }
    if (care && carePlan) {
      add({ serviceSlug: carePlan.slug, name: carePlan.name, unitPrice: carePlan.price, addons: [], rush: false, billing: "monthly", depositPct: 100 });
      track("care_plan_selected", { package_id: pkg.id });
    }
    track("configuration_completed", {
      package_id: pkg.id, package_name: pkg.name,
      one_time_total: priced.oneTime, monthly_total: monthlyTotal, project_total: projectTotal,
    });
    sessionStorage.removeItem(storeKey);
    sessionStorage.removeItem(`${storeKey}-care`);
    navigate("/checkout");
  };

  const scrollToSummary = () => summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="fixed inset-0 z-[80] flex items-stretch sm:items-center justify-center p-0 sm:p-6" role="dialog" aria-modal="true" aria-label={`Customize ${pkg.name}`}>
      <button className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-default" onClick={onClose} aria-label="Close configurator" />
      <div ref={dialogRef} className="relative w-full max-w-5xl max-h-full sm:max-h-[92vh] flex flex-col border border-[var(--line-strong)] shadow-2xl" style={{ background: "var(--bg)" }}>

        {/* header */}
        <div className="px-5 sm:px-8 pt-5 pb-4 border-b border-[var(--line)] shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="idx">CUSTOMIZE YOUR BUILD · {pkg.id}</span>
              <h2 className="font-display text-xl md:text-2xl font-bold uppercase mt-1">Power Up Your Website</h2>
              <p className="font-meta text-[9px] text-[var(--muted)] mt-1">
                {pkg.name} — {pkg.priceType === "starting" ? "from " : ""}{money(pkg.price)} base · Add the tools you want. Scale when you're ready.
              </p>
            </div>
            <button className="font-meta text-[10px] px-3 py-1.5 border border-[var(--line)] hover:border-[var(--dept)] transition-colors shrink-0" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>

        {/* body */}
        <div className="overflow-y-auto grow px-5 sm:px-8 py-6 pb-24 lg:pb-6">
          <div className="grid lg:grid-cols-[1fr_300px] gap-8 items-start">

            {/* LEFT: categories + add-on cards */}
            <div>
              {/* category pills — progressive disclosure (PRD: never show everything at once) */}
              <div className="flex flex-wrap gap-2" role="tablist" aria-label="Add-on categories">
                {categories.map((c) => (
                  <button key={c.id} role="tab" aria-selected={cat === c.id} data-cat={c.id} onClick={() => setCat(c.id)}
                    className={`flex items-center gap-1.5 ${inputBtn} ${cat === c.id ? "!border-[var(--dept)] bg-[var(--dept-soft)]" : ""}`}>
                    <CatIcon k={c.icon} />{c.name}
                  </button>
                ))}
                {!showAdvanced && (
                  <button className={`${inputBtn} dept-accent`} onClick={() => setShowAdvanced(true)}>
                    More ways to power up ↓
                  </button>
                )}
              </div>

              {/* active category */}
              <div className="mt-6">
                <p className="text-sm text-[var(--muted)]">{activeCat.desc}</p>
                <div className="grid sm:grid-cols-2 gap-3 mt-4">
                  {activeCat.addons.map((a) => {
                    const eligible = addonEligibleFor(a, pkgId);
                    const active = !!sel[a.id];
                    return (
                      <div key={a.id} data-addon-card={a.id}
                        className={`border p-4 text-left transition-colors ${active ? "border-[var(--dept)] bg-[var(--dept-soft)]" : "border-[var(--line)]"} ${!eligible ? "opacity-55" : ""}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <span className="font-display text-[13px] font-bold uppercase flex items-center gap-2 flex-wrap">
                              {a.name}
                              {a.popular && <span className="dept-bg font-meta text-[8px] px-2 py-0.5">MOST POPULAR</span>}
                            </span>
                            <p className="font-meta text-[9px] text-[var(--muted)] mt-1 leading-relaxed">{a.desc}</p>
                          </div>
                          <span className="font-meta text-[10px] whitespace-nowrap dept-accent">{addonPriceLabel(a, money)}</span>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          {eligible ? (
                            <>
                              <button type="button" aria-pressed={active} data-addon-toggle={a.id} onClick={() => onToggle(a)}
                                className={`${inputBtn} ${active ? "!border-[var(--dept)] dept-accent" : ""}`}>
                                {active ? "✓ Added" : "Add"}
                              </button>
                              {active && a.qtyEnabled && (
                                <span className="flex items-center gap-1 font-meta text-[10px]" aria-label={`Quantity for ${a.name}`}>
                                  <button className={inputBtn} data-qty-dec={a.id} aria-label="Decrease quantity" onClick={() => onQty(a, (sel[a.id] ?? 1) - 1)}>−</button>
                                  <span className="px-2 min-w-6 text-center" aria-live="polite">{sel[a.id]}</span>
                                  <button className={inputBtn} data-qty-inc={a.id} aria-label="Increase quantity" onClick={() => onQty(a, (sel[a.id] ?? 1) + 1)}>+</button>
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="font-meta text-[9px] text-[var(--muted)]">{UPGRADE_MESSAGE}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* RIGHT: sticky project summary */}
            <aside ref={summaryRef} className="border border-[var(--line-strong)] p-5 lg:sticky lg:top-0" style={{ background: "var(--panel)" }} aria-live="polite" aria-label="Your website build summary">
              <span className="idx">/your-website</span>
              <div className="flex justify-between items-baseline mt-3 text-sm">
                <span>Base Package</span>
                <span className="font-bold">{money(pkg.price)}</span>
              </div>
              <p className="font-meta text-[9px] text-[var(--muted)]">{pkg.name}</p>

              {selectionCount === 0 && !care ? (
                <div className="mt-5 border border-dashed border-[var(--line-strong)] p-4">
                  <p className="font-display text-[13px] font-bold uppercase">Make your website work harder.</p>
                  <p className="font-meta text-[9px] text-[var(--muted)] mt-1">Choose the features that fit your business. Your project total updates automatically.</p>
                </div>
              ) : (
                <div className="mt-4 flex flex-col gap-1.5 text-[13px]">
                  {priced.oneTimeLines.map((l) => (
                    <div key={l.addon.id} className="flex justify-between gap-3">
                      <span className="text-[var(--muted)]">{l.addon.name}{l.qty > 1 ? ` ×${l.qty}` : ""}</span>
                      <span>{money(l.lineTotal)}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-5 pt-4 rule-t">
                <div className="flex justify-between items-baseline">
                  <span className="font-meta text-[10px] text-[var(--muted)]">PROJECT TOTAL</span>
                  <span className="font-display-wide text-2xl font-bold transition-all" data-project-total>{money(projectTotal)}</span>
                </div>
                <p className="font-meta text-[8.5px] text-[var(--muted)]">one-time · {pkg.depositPct}% deposit secures kickoff</p>
              </div>

              {/* recurring — always separate (PRD §addon_rules) */}
              <div className="mt-4 border border-[var(--line)] p-3.5">
                <label className="flex items-center justify-between gap-3 cursor-pointer text-[13px]">
                  <span className="flex items-center gap-2.5">
                    <input type="checkbox" className="w-4 h-4 accent-[var(--dept)]" checked={care} onChange={(e) => setCare(e.target.checked)} />
                    Add Website Care
                  </span>
                  <span className="font-meta text-[10px] dept-accent">{carePlan ? money(carePlan.price) : "$250"}/mo</span>
                </label>
                <p className="font-meta text-[8.5px] text-[var(--muted)] mt-1.5">Kept fast, secure and current after launch.</p>
                {monthlyTotal > 0 && (
                  <div className="mt-2.5 pt-2.5 border-t border-[var(--line)]">
                    {priced.monthlyLines.map((l) => (
                      <div key={l.addon.id} className="flex justify-between text-[12px] text-[var(--muted)]">
                        <span>{l.addon.name}</span><span>{money(l.lineTotal)}/mo</span>
                      </div>
                    ))}
                    <div className="flex justify-between items-baseline mt-1.5">
                      <span className="font-meta text-[10px] text-[var(--muted)]">MONTHLY SERVICES</span>
                      <span className="font-display text-base font-bold" data-monthly-total>{money(monthlyTotal)}/mo</span>
                    </div>
                  </div>
                )}
              </div>

              <p className="font-meta text-[8.5px] text-[var(--muted)] mt-4 leading-relaxed">
                Final pricing may vary for complex integrations, third-party services, custom functionality or requirements outside the selected scope. Third-party subscriptions, API usage, hosting and processor fees are separate.
              </p>

              <button className="btn btn-dept w-full justify-center mt-4" onClick={startProject}>
                Start Your Project <span className="btn-arrow" aria-hidden>→</span>
              </button>
              {(selectionCount > 0 || care) && (
                <button className="font-meta text-[10px] text-[var(--muted)] hover:text-[var(--dept)] transition-colors underline mt-3 w-full text-center" onClick={clearAll}>
                  Clear selections
                </button>
              )}
            </aside>
          </div>
        </div>

        {/* mobile sticky bottom summary */}
        <div className="lg:hidden absolute bottom-0 inset-x-0 border-t border-[var(--line-strong)] px-5 py-3 flex items-center justify-between gap-4" style={{ background: "var(--panel)" }}>
          <div>
            <span className="font-display text-lg font-bold">{money(projectTotal)}</span>
            {monthlyTotal > 0 && <span className="font-meta text-[9px] text-[var(--muted)] block">+ {money(monthlyTotal)}/mo</span>}
          </div>
          <button className="btn btn-dept !py-2.5" onClick={scrollToSummary}>Review your build <span className="btn-arrow" aria-hidden>→</span></button>
        </div>
      </div>
    </div>
  );
}
