import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  priceLabel, sizeById, validateCustomSize, priceLine,
  type ConfigSelection, type DesignService,
} from "../lib/design";
import { useDesignCatalog, useDesignPackage } from "../lib/design-shop";
import { useDepartment } from "../lib/dept";
import { useSEO, track } from "../lib/seo";
import { Reveal } from "../lib/motion";
import { FinalCta } from "../components/blocks";
import { CustomProjectCta, TalkToUs } from "../components/TalkToUs";
import { useMoney } from "../lib/money";
import { useShop } from "../lib/shop";
import { CartConflictModal } from "../components/CartConflictModal";
import { detectPackageOverlap } from "../lib/orderConflict";

/* ------------------------------------------------------------------
   DESIGN SERVICE PAGE (PRD §5/§10/§11/§16/§25/§48) — hybrid commerce:
   Journey A (direct purchase): tier → size → add-ons → qty, live
   price, Order Now straight to checkout or Add to package.
   Journey B (quote-only): Request a Quote + contextual WhatsApp/Call.
------------------------------------------------------------------- */

export function Configurator({ s, onAdd, onOrder }: {
  s: DesignService;
  onAdd: (sel: ConfigSelection) => void;
  onOrder?: (sel: ConfigSelection) => void;
}) {
  const { sizes, options } = useDesignCatalog();
  const money = useMoney();
  const tiers = s.tiers ?? [];
  const variationGroups = s.variations ?? [];

  // Initialize selected variations for each group
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    variationGroups.forEach((g) => {
      const defOpt = g.options.find((o) => o.isDefault) || g.options[0];
      if (defOpt) initial[g.id] = defOpt.id;
    });
    return initial;
  });

  const def = s.sizes.find((x) => x.isDefault) ?? s.sizes[0];
  const [tierId, setTierId] = useState<string | undefined>(
    tiers.length ? (tiers[1]?.id ?? tiers[0]?.id) : undefined   // default to the middle tier
  );
  const [sizeId, setSizeId] = useState<string | undefined>(def?.sizeId);
  const [useCustom, setUseCustom] = useState(false);
  const [cw, setCw] = useState("");
  const [ch, setCh] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [qty, setQty] = useState(s.minQty);

  const customError = useCustom && (cw || ch)
    ? validateCustomSize(s, Number(cw), Number(ch))
    : null;

  const sel: ConfigSelection = useMemo(() => ({
    sizeId: useCustom ? undefined : sizeId,
    customSize: useCustom && cw && ch && !customError
      ? { w: Number(cw), h: Number(ch), unit: s.customLimits?.unit ?? "in" }
      : undefined,
    optionIds: picked,
    qty,
    tierId,
    selectedVariants,
  }), [useCustom, sizeId, cw, ch, customError, picked, qty, tierId, selectedVariants, s]);

  const line = useMemo(() => priceLine(s, sel, { sizes, options }), [s, sel, sizes, options]);
  const selSize = sizeById(sizeId, sizes);
  const blockAdd = useCustom && (!cw || !ch || !!customError);

  const toggleOption = (id: string) => {
    const on = !picked.includes(id);
    setPicked((xs) => (on ? [...xs, id] : xs.filter((x) => x !== id)));
    track("design_addon_toggle", { service: s.slug, addon: id, on });
  };

  const selectVariant = (groupId: string, optionId: string, optPrice: number) => {
    setSelectedVariants((prev) => ({ ...prev, [groupId]: optionId }));
    track("design_variant_select", { service: s.slug, group: groupId, option: optionId, price: optPrice });
  };

  return (
    <div className="grid lg:grid-cols-12 gap-10">
      {/* configuration */}
      <div className="lg:col-span-7 space-y-10">
        {/* variation groups (e.g. Folding Style, Sides, Color Mode, Page Count) */}
        {variationGroups.length > 0 && variationGroups.map((group) => {
          const currentOptId = selectedVariants[group.id] || group.options[0]?.id;
          return (
            <fieldset key={group.id} className="space-y-4">
              <div className="flex items-center justify-between">
                <legend className="idx">/{group.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")} — choose your variation</legend>
                <span className="font-meta text-[9px] text-[var(--muted)]">{group.options.length} options</span>
              </div>
              <div
                className={`grid gap-3 ${
                  group.options.length <= 2
                    ? "grid-cols-1 sm:grid-cols-2"
                    : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                }`}
                role="group"
                aria-label={group.name}
              >
                {group.options.map((opt) => {
                  const active = currentOptId === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => selectVariant(group.id, opt.id, opt.price)}
                      aria-pressed={active}
                      className={`text-left border p-4 sm:p-4.5 transition-all rounded-2xl relative flex flex-col justify-between overflow-hidden ${
                        active
                          ? "border-[var(--dept)] bg-[var(--dept-soft)] ring-2 ring-[var(--dept)]/40 shadow-sm"
                          : "border-[var(--line)] bg-[var(--panel)] hover:border-[var(--line-strong)] hover:shadow-xs"
                      }`}
                    >
                      <div className="w-full min-w-0">
                        {/* Header: Title + Radio */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 min-w-0 flex-1">
                            {opt.icon && <span className="text-base shrink-0 mt-0.5">{opt.icon}</span>}
                            <span className="font-display text-xs sm:text-sm font-bold uppercase tracking-tight leading-snug break-words">
                              {opt.name}
                            </span>
                          </div>
                          <span
                            className={`w-4 h-4 rounded-full border shrink-0 mt-0.5 flex items-center justify-center transition-colors ${
                              active
                                ? "border-[var(--dept)] bg-[var(--dept)]"
                                : "border-[var(--line-strong)] bg-transparent"
                            }`}
                          >
                            {active && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </span>
                        </div>

                        {/* Dedicated Price Block (Never overlaps with title) */}
                        <div className="mt-2.5 flex items-baseline gap-2 flex-wrap">
                          <span className="font-display-wide text-base sm:text-lg font-bold dept-accent tracking-tight">
                            {money(opt.price)}
                          </span>
                          {opt.isDefault && (
                            <span className="font-meta text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-[var(--dept)]/10 text-[var(--dept)] border border-[var(--dept)]/25 font-semibold">
                              Standard
                            </span>
                          )}
                        </div>

                        {/* Description */}
                        {opt.blurb && (
                          <p className="text-[11px] text-[var(--muted)] mt-2 leading-relaxed break-words">
                            {opt.blurb}
                          </p>
                        )}
                      </div>

                      {/* Footer Badges */}
                      {(opt.turnaround || opt.revisions !== undefined) && (
                        <div className="mt-3.5 pt-2.5 border-t border-[var(--line)]/60 flex flex-wrap items-center justify-between gap-1.5 font-meta text-[8.5px] text-[var(--muted)]">
                          {opt.turnaround && <span className="inline-flex items-center gap-1">⏱️ {opt.turnaround}</span>}
                          {opt.revisions !== undefined && <span className="inline-flex items-center gap-1">🔄 {opt.revisions} revisions</span>}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          );
        })}

        {/* package tier (journey A — choose your tier) */}
        {tiers.length > 0 && (
          <fieldset>
            <legend className="idx">/package — choose your tier</legend>
            <div
              className={`mt-4 grid gap-3 ${
                tiers.length <= 2
                  ? "grid-cols-1 sm:grid-cols-2"
                  : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
              }`}
              role="group"
              aria-label="Package tier"
            >
              {tiers.map((t) => {
                const active = tierId === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => { setTierId(t.id); track("design_tier_select", { service: s.slug, tier: t.id, price: t.price }); }}
                    aria-pressed={active}
                    className={`text-left border p-4 sm:p-4.5 transition-all rounded-2xl relative flex flex-col justify-between overflow-hidden ${
                      active
                        ? "border-[var(--dept)] bg-[var(--dept-soft)] ring-2 ring-[var(--dept)]/40 shadow-sm"
                        : "border-[var(--line)] bg-[var(--panel)] hover:border-[var(--line-strong)] hover:shadow-xs"
                    }`}
                  >
                    <div className="w-full min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-display text-xs sm:text-sm font-bold uppercase tracking-tight leading-snug break-words">
                          {t.name}
                        </span>
                        <span
                          className={`w-4 h-4 rounded-full border shrink-0 mt-0.5 flex items-center justify-center transition-colors ${
                            active
                              ? "border-[var(--dept)] bg-[var(--dept)]"
                              : "border-[var(--line-strong)] bg-transparent"
                          }`}
                        >
                          {active && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </span>
                      </div>

                      <div className="mt-2.5 flex items-baseline gap-2 flex-wrap">
                        <span className="font-display-wide text-base sm:text-lg font-bold dept-accent tracking-tight">
                          {money(t.price)}
                        </span>
                      </div>

                      {t.blurb && (
                        <p className="text-[11px] text-[var(--muted)] mt-2 leading-relaxed break-words">
                          {t.blurb}
                        </p>
                      )}
                    </div>

                    {(t.turnaround || t.revisions !== undefined) && (
                      <div className="mt-3.5 pt-2.5 border-t border-[var(--line)]/60 flex flex-wrap items-center justify-between gap-1.5 font-meta text-[8.5px] text-[var(--muted)]">
                        {t.turnaround && <span className="inline-flex items-center gap-1">⏱️ {t.turnaround}</span>}
                        {t.revisions !== undefined && <span className="inline-flex items-center gap-1">🔄 {t.revisions} revisions</span>}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        {/* size */}
        {(s.sizes.length > 0 || s.allowCustomSize) && (
          <fieldset>
            <legend className="idx">/size — choose a format</legend>
            <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Size">
              {s.sizes.map((rel) => {
                const z = sizeById(rel.sizeId, sizes);
                if (!z) return null;
                const active = !useCustom && sizeId === rel.sizeId;
                return (
                  <button
                    key={rel.sizeId}
                    onClick={() => { setSizeId(rel.sizeId); setUseCustom(false); }}
                    aria-pressed={active}
                    className="relative font-meta text-[10px] px-3 py-2.5 border transition-colors"
                    style={active ? { background: "var(--ink)", borderColor: "var(--ink)", color: "var(--bg)" } : { borderColor: "var(--line)" }}
                  >
                    {z.name}
                    {rel.isRecommended && <span className="absolute -top-2 -right-1 font-meta text-[7px] dept-bg px-1">REC</span>}
                    {rel.adj ? <span className="block text-[8px] opacity-70">+{rel.adjType === "percentage" ? `${rel.adj}%` : money(rel.adj)}</span> : null}
                  </button>
                );
              })}
              {s.allowCustomSize && (
                <button
                  onClick={() => setUseCustom(true)}
                  aria-pressed={useCustom}
                  className="font-meta text-[10px] px-3 py-2.5 border transition-colors"
                  style={useCustom ? { background: "var(--ink)", borderColor: "var(--ink)", color: "var(--bg)" } : { borderColor: "var(--line)" }}
                >
                  Custom Size
                </button>
              )}
            </div>

            {useCustom && s.customLimits && (
              <div className="mt-4 border border-[var(--line)] p-4" style={{ background: "var(--panel)" }}>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="font-meta text-[9px] text-[var(--muted)] block">WIDTH ({s.customLimits.unit})
                    <input type="number" inputMode="decimal" value={cw} onChange={(e) => setCw(e.target.value)}
                      min={s.customLimits.minW} max={s.customLimits.maxW} step="any"
                      className="mt-1 bg-transparent border border-[var(--line)] px-3 py-2 text-sm outline-none focus:border-[var(--dept)] w-28" />
                  </label>
                  <label className="font-meta text-[9px] text-[var(--muted)] block">HEIGHT ({s.customLimits.unit})
                    <input type="number" inputMode="decimal" value={ch} onChange={(e) => setCh(e.target.value)}
                      min={s.customLimits.minH} max={s.customLimits.maxH} step="any"
                      className="mt-1 bg-transparent border border-[var(--line)] px-3 py-2 text-sm outline-none focus:border-[var(--dept)] w-28" />
                  </label>
                  <span className="font-meta text-[8px] text-[var(--muted)] pb-2">
                    {s.customLimits.minW}–{s.customLimits.maxW} × {s.customLimits.minH}–{s.customLimits.maxH} {s.customLimits.unit}
                  </span>
                </div>
                {customError && <p className="font-meta text-[9px] text-red-600 mt-2" role="alert">{customError}</p>}
              </div>
            )}

            {/* print specifications — progressive disclosure (PRD §11) */}
            {selSize && !useCustom && (selSize.bleed || selSize.dpi) && (
              <details className="mt-4">
                <summary className="font-meta text-[9px] text-[var(--muted)] cursor-pointer hover:text-[var(--dept)] transition-colors">View print specifications</summary>
                <dl className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-3 font-meta text-[9px] border border-[var(--line)] p-4" style={{ background: "var(--panel)" }}>
                  {[["Finished", selSize.name], ["Bleed", selSize.bleed], ["Safe area", selSize.safeArea], ["DPI", selSize.dpi], ["Colour", selSize.colorMode], ["Format", selSize.fileFormat]]
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <div key={String(k)}><dt className="text-[var(--muted)]">{k}</dt><dd className="mt-0.5">{String(v)}</dd></div>
                    ))}
                </dl>
              </details>
            )}
          </fieldset>
        )}

        {/* options */}
        {s.optionIds.length > 0 && (
          <fieldset className="mt-10">
            <legend className="idx">/options — production add-ons</legend>
            <div className="mt-4 flex flex-col gap-2">
              {s.optionIds.map((id) => {
                const o = options.find((x) => x.id === id);
                if (!o) return null;
                const on = picked.includes(id);
                return (
                  <label key={id} className="flex items-start gap-3 border border-[var(--line)] px-4 py-3 cursor-pointer hover:border-[var(--line-strong)] transition-colors" style={{ background: on ? "var(--dept-soft)" : "transparent" }}>
                    <input type="checkbox" checked={on} onChange={() => toggleOption(id)} className="mt-1 accent-[var(--dept)]" />
                    <span className="flex-1">
                      <span className="text-sm font-semibold">{o.name}</span>
                      <span className="block text-[12px] text-[var(--muted)]">{o.description}</span>
                    </span>
                    <span className="font-meta text-[10px] dept-accent shrink-0">+{o.pricing === "percentage" ? `${o.price}%` : money(o.price)}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        {/* quantity */}
        <fieldset className="mt-10">
          <legend className="idx">/quantity</legend>
          <div className="mt-4 inline-flex items-center border border-[var(--line-strong)]">
            <button className="px-4 py-2.5 text-lg disabled:opacity-30" onClick={() => setQty((q) => Math.max(s.minQty, q - 1))} disabled={qty <= s.minQty} aria-label="Decrease quantity">−</button>
            <span className="px-5 font-display-wide font-bold" aria-live="polite">{qty}</span>
            <button className="px-4 py-2.5 text-lg disabled:opacity-30" onClick={() => setQty((q) => Math.min(s.maxQty, q + 1))} disabled={qty >= s.maxQty} aria-label="Increase quantity">+</button>
          </div>
          <span className="font-meta text-[8px] text-[var(--muted)] ml-3">{s.minQty}–{s.maxQty}</span>
        </fieldset>
      </div>

      {/* live price card */}
      <div className="lg:col-span-5">
        <div className="lg:sticky lg:top-28 border border-[var(--line-strong)] p-6" style={{ background: "var(--panel)" }}>
          <span className="idx">/live-price</span>
          <dl className="mt-4 flex flex-col gap-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-[var(--muted)]">{line.tier ? `${line.tier.name} — ${s.name}` : `Base — ${s.name}`}</dt>
              <dd>{line.isQuote ? "Quote" : money(line.tier ? line.tier.price : s.price)}</dd>
            </div>
            {line.variantLabel && (
              <div className="flex justify-between font-meta text-[10px]">
                <dt className="text-[var(--muted)]">
                  {line.selectedVariants?.map((v) => v.groupName).join(" / ") ?? "Variation"}
                </dt>
                <dd className="dept-accent font-bold text-right">{line.variantLabel} — {money(line.unitBase - line.sizeAdj)}</dd>
              </div>
            )}
            {line.sizeAdj !== 0 && <div className="flex justify-between"><dt className="text-[var(--muted)]">Size — {line.sizeLabel}</dt><dd>+{money(line.sizeAdj)}</dd></div>}
            {line.sizeAdj === 0 && line.sizeLabel && <div className="flex justify-between font-meta text-[10px]"><dt className="text-[var(--muted)]">Size</dt><dd>{line.sizeLabel}</dd></div>}
            {line.options.map((o) => (
              <div key={o.id} className="flex justify-between"><dt className="text-[var(--muted)]">{o.name}</dt><dd>+{money(o.amount)}</dd></div>
            ))}
            {qty > 1 && <div className="flex justify-between"><dt className="text-[var(--muted)]">× {qty} design{qty === 1 ? "" : "s"}</dt><dd></dd></div>}
          </dl>
          <div className="flex justify-between items-baseline border-t border-[var(--line-strong)] mt-4 pt-4">
            <span className="font-meta text-[10px]">{line.isQuote ? "PRICED PER PROJECT" : "TOTAL"}</span>
            <span className="font-display-wide text-3xl font-bold">{line.isQuote ? "Quote" : money(line.lineTotal)}</span>
          </div>

          {line.isQuote ? (
            /* Journey B — conversation-driven */
            <div className="mt-6">
              <Link
                to={`/start?intent=quote&service=${encodeURIComponent(s.name)}`}
                className="btn btn-dept w-full justify-center"
                onClick={() => track("quote_cta_click", { service: s.slug, via: "service-page" })}
              >
                Request a quote <span className="btn-arrow" aria-hidden>→</span>
              </Link>
              <p className="font-meta text-[9px] text-[var(--muted)] mt-3 text-center">Scoped and priced by the creative team — usually within one business day.</p>
              <TalkToUs serviceName={s.name} className="mt-4 justify-center" />
            </div>
          ) : (
            /* Journey A — pay online */
            <>
              <button
                className="btn btn-dept w-full justify-center mt-6 disabled:opacity-40"
                disabled={blockAdd}
                onClick={() => { (onOrder ?? onAdd)(sel); track("order_now_click", { service: s.slug, value: line.lineTotal, tier: line.tier?.id }); }}
              >
                Order now — pay online <span className="btn-arrow" aria-hidden>→</span>
              </button>
              <button
                className="btn btn-ghost w-full justify-center mt-2 disabled:opacity-40"
                disabled={blockAdd}
                onClick={() => { onAdd(sel); track("package_add", { service: s.slug, value: line.lineTotal, tier: line.tier?.id }); }}
              >
                Add to package
              </button>
              <Link to="/custom-package" className="block text-center font-meta text-[10px] u-line mt-3 text-[var(--muted)] hover:text-[var(--dept)] transition-colors">
                Review your package →
              </Link>
            </>
          )}
          <p className="font-meta text-[8px] text-[var(--muted)] mt-3">{line.turnaround} · {line.revisions} revision rounds included · Bundle 2+ services and package discounts apply automatically.</p>
        </div>
      </div>

      {/* mobile sticky order bar (journey A) / quote bar (journey B) */}
      <div className="fixed bottom-0 inset-x-0 z-40 lg:hidden border-t border-[var(--line-strong)] px-5 py-3.5 flex items-center justify-between gap-3" style={{ background: "var(--bg)" }}>
        <span>
          <span className="block font-meta text-[8px] text-[var(--muted)] truncate max-w-[200px]">
            {line.variantLabel ?? (line.tier ? `${line.tier.name} tier` : s.name)}
          </span>
          <span className="font-display-wide text-lg font-bold">{line.isQuote ? "Custom quote" : money(line.lineTotal)}</span>
        </span>
        {line.isQuote ? (
          <Link
            to={`/start?intent=quote&service=${encodeURIComponent(s.name)}`}
            className="btn btn-dept !py-2.5 font-meta text-[10px]"
            onClick={() => track("quote_cta_click", { service: s.slug, via: "sticky" })}
          >
            Request a Quote →
          </Link>
        ) : (
          <button
            className="btn btn-dept !py-2.5 font-meta text-[10px] disabled:opacity-40"
            disabled={blockAdd}
            onClick={() => { (onOrder ?? onAdd)(sel); track("order_now_click", { service: s.slug, value: line.lineTotal, tier: line.tier?.id, via: "sticky" }); }}
          >
            Order Now →
          </button>
        )}
      </div>
      {/* spacer so the sticky bar never covers page-end content on mobile */}
      <div className="h-20 lg:hidden" aria-hidden />
    </div>
  );
}

export default function DesignServicePage() {
  const money = useMoney();
  const { slug } = useParams();
  const navigate = useNavigate();
  useDepartment("brand");
  const { services, categories, sizes, options } = useDesignCatalog();
  const pkg = useDesignPackage();
  const { add: addToShop } = useShop();
  const s = services.find((x) => x.slug === slug);

  useSEO({
    title: s ? `${s.name} — ${priceLabel(s, money)} | Social Kon10 Design Store` : "Design service — Social Kon10",
    description: s?.short ?? "",
    path: s ? `/design-services/${s.slug}` : undefined,
    jsonLd: s && s.price > 0 ? ({
      "@context": "https://schema.org",
      "@type": "Product",
      name: s.name,
      description: s.short,
      offers: { "@type": "Offer", priceCurrency: "USD", price: s.price },
    } as object) : undefined,
  });

  if (!s) return <Navigate to="/graphic-design-branding/design-store" replace />;

  const recommended = s.recommended
    .map((r) => services.find((x) => x.slug === r))
    .filter(Boolean) as DesignService[];

  const [conflictModal, setConflictModal] = useState<{
    isOpen: boolean;
    packageName: string;
    action: () => void;
  }>({ isOpen: false, packageName: "", action: () => {} });

  const executeAdd = (sel: ConfigSelection) => {
    pkg.add(s.slug, sel);
    toast.success(`Added "${s.name}" to package & cart`, {
      action: { label: "Checkout →", onClick: () => navigate("/checkout") },
    });
  };

  const add = (sel: ConfigSelection) => {
    const overlap = detectPackageOverlap(s.slug, pkg.items);
    if (overlap.hasOverlap) {
      setConflictModal({
        isOpen: true,
        packageName: overlap.originPackageName || "your active package",
        action: () => executeAdd(sel),
      });
      return;
    }
    executeAdd(sel);
  };

  /** Journey A fast path: add the configured service directly to cart and go straight to checkout. */
  const executeOrder = (sel: ConfigSelection) => {
    const line = priceLine(s, sel, { sizes, options });
    const selectedOptions = (line.options || []).map((opt) => ({
      id: opt.id,
      name: opt.name,
      price: opt.amount,
    }));

    addToShop({
      serviceSlug: s.slug,
      name: `${s.name}${line.variantLabel ? ` · ${line.variantLabel}` : ""}${line.tier ? ` · ${line.tier.name}` : ""}${line.size ? ` · ${line.size.name}` : ""}`,
      unitPrice: line.unitBase,
      tierLabel: line.tier?.name,
      variantLabel: line.variantLabel,
      addons: selectedOptions,
      rush: false,
      billing: "one_time",
      depositPct: 100,
    });

    pkg.add(s.slug, sel);
    sessionStorage.setItem("sk_quick_checkout", "1");
    track("checkout_start", { service: s.slug, via: "order-now" });
    toast.success(`${s.name} added to cart — proceeding to checkout`);
    navigate("/checkout");
  };

  const order = (sel: ConfigSelection) => {
    const overlap = detectPackageOverlap(s.slug, pkg.items);
    if (overlap.hasOverlap) {
      setConflictModal({
        isOpen: true,
        packageName: overlap.originPackageName || "your active package",
        action: () => executeOrder(sel),
      });
      return;
    }
    executeOrder(sel);
  };

  return (
    <>
      <section className="wrap pt-14 md:pt-20 pb-12">
        <Reveal>
          <div className="flex flex-wrap justify-between gap-3 font-meta text-[10px] text-[var(--muted)]">
            <span><Link to="/graphic-design-branding/design-store" className="u-line">← /design-store</Link></span>
            <span className="idx">/{categories.find((c) => c.slug === s.category)?.name ?? s.category}</span>
          </div>
        </Reveal>
        <h1 className="display-section mt-6 max-w-[16ch]">{s.name}</h1>
        <Reveal delay={160}>
          <p className="mt-4 max-w-xl text-[var(--muted)]">{s.short}</p>
        </Reveal>
        <Reveal delay={220}>
          <div className="mt-5 flex flex-wrap gap-5 font-meta text-[10px] text-[var(--muted)]">
            <span className="dept-accent">{priceLabel(s, money)}</span>
            <span>Turnaround {s.turnaround}</span>
            <span>{s.revisions} revisions included</span>
          </div>
        </Reveal>
      </section>

      <section className="wrap rule-t pt-12 pb-20" aria-label="Configure">
        <Configurator s={s} onAdd={add} onOrder={order} />
      </section>

      {/* smart recommendations / upsell (PRD §24/§25) */}
      {recommended.length > 0 && (
        <section className="rule-t" aria-label="Recommended additions">
          <div className="wrap py-16">
            <Reveal>
              <span className="idx">/complete-the-set</span>
              <h2 className="display-sub mt-4">Goes well with {s.name.toLowerCase()}</h2>
            </Reveal>
            <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {recommended.map((r) => (
                <div key={r.slug} className="border border-[var(--line)] p-5 flex flex-col" style={{ background: "var(--panel)" }}>
                  <h3 className="font-display text-base font-bold uppercase leading-tight">{r.name}</h3>
                  <p className="font-meta text-[9px] text-[var(--muted)] mt-2 flex-1">{priceLabel(r, money)}</p>
                  <div className="flex gap-2 mt-4">
                    <button className="font-meta text-[9px] px-3 py-2 border border-[var(--line-strong)] hover:bg-[var(--ink)] hover:text-[var(--bg)] transition-colors flex-1"
                      onClick={() => { pkg.add(r.slug); toast.success(`${r.name} added`); }}>
                      Add +
                    </button>
                    <Link to={`/design-services/${r.slug}`} className="font-meta text-[9px] px-3 py-2 border border-[var(--line)] hover:border-[var(--line-strong)] transition-colors">View</Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
      <CustomProjectCta serviceName={s.name} />
      <FinalCta />
      <CartConflictModal
        isOpen={conflictModal.isOpen}
        onClose={() => setConflictModal((prev) => ({ ...prev, isOpen: false }))}
        itemName={s.name}
        packageName={conflictModal.packageName}
        onAddAnyway={conflictModal.action}
        packageUrl="/custom-package"
      />
    </>
  );
}
