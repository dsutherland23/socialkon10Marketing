import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { isQuoteOnly, priceLabel, type DesignService } from "../lib/design";
import { useDesignCatalog, useDesignPackage } from "../lib/design-shop";
import { useDepartment } from "../lib/dept";
import { useSEO, track } from "../lib/seo";
import { useMoney } from "../lib/money";
import { waLink, waServiceMessage } from "../lib/data";
import { Reveal } from "../lib/motion";
import { FinalCta } from "../components/blocks";
import { CustomProjectCta, DesignJourneys } from "../components/TalkToUs";

/* ------------------------------------------------------------------
   DESIGN STORE (PRD §5/§49/§50) — full graphic design catalog with
   category filtering and debounced search. All values come from the
   Studio-managed catalog, never hard-coded.
------------------------------------------------------------------- */

export function ServiceCard({ s, delay = 0, onAdd }: { s: DesignService; delay?: number; onAdd: () => void }) {
  const money = useMoney();
  return (
    <Reveal delay={delay}>
      <div className="group border border-[var(--line)] hover:border-[var(--line-strong)] transition-colors duration-200 flex flex-col h-full" style={{ background: "var(--panel)" }}>
        <Link to={`/design-services/${s.slug}`} className="block p-5 flex-1" onClick={() => track("design_service_view", { service: s.slug })}>
          <div className="flex items-start justify-between gap-3">
            <span className="idx">/{s.category}</span>
            {s.popular && <span className="font-meta text-[8px] dept-accent border border-[var(--dept)] px-1.5 py-0.5">POPULAR</span>}
          </div>
          <h3 className="font-display text-lg font-bold uppercase mt-3 leading-tight group-hover:text-[var(--dept)] transition-colors">{s.name}</h3>
          <p className="text-[13px] text-[var(--muted)] mt-2 leading-relaxed">{s.short}</p>
        </Link>
        <div className="px-5 py-3.5 border-t border-[var(--line)]">
          <div className="flex items-center justify-between gap-3">
            <span>
              <span className="font-display-wide text-base font-bold">{priceLabel(s, money)}</span>
              <span className="block font-meta text-[8px] text-[var(--muted)] mt-0.5">{s.turnaround} · {s.revisions} revisions</span>
            </span>
            {isQuoteOnly(s) ? (
              <Link
                to={`/start?intent=quote&service=${encodeURIComponent(s.name)}`}
                className="font-meta text-[9px] px-3 py-2 border border-[var(--dept)] dept-accent hover:bg-[var(--dept)] hover:text-[var(--on-dept,var(--bg))] transition-colors shrink-0"
                onClick={() => track("quote_cta_click", { service: s.slug, via: "card" })}
              >
                Request a Quote →
              </Link>
            ) : (
              <Link
                to={`/design-services/${s.slug}`}
                className="btn btn-dept !py-2 !px-3.5 font-meta text-[9px] shrink-0"
                onClick={() => track("order_now_click", { service: s.slug, via: "card" })}
              >
                Order Now →
              </Link>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 mt-2.5">
            <a
              href={waLink(waServiceMessage(s.name))}
              target="_blank"
              rel="noopener noreferrer"
              className="font-meta text-[8px] text-[var(--muted)] u-line hover:text-[var(--dept)] transition-colors"
              onClick={() => track("whatsapp_click", { service: s.slug, via: "card" })}
            >
              Talk to us on WhatsApp
            </a>
            {!isQuoteOnly(s) && s.packageEligible !== false && (
              <button
                className="font-meta text-[8px] text-[var(--muted)] u-line hover:text-[var(--dept)] transition-colors"
                onClick={onAdd}
                aria-label={`Add ${s.name} to package`}
              >
                or add to package +
              </button>
            )}
          </div>
        </div>
      </div>
    </Reveal>
  );
}

/* ------------------------------------------------------------------
   FILTER DROPDOWN (2026 pattern) — labelled trigger, option counts,
   checkmark on active, closes on outside click / Escape, full ARIA.
------------------------------------------------------------------- */
export function FilterDropdown({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: { value: string; label: string; count?: number }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const current = options.find((o) => o.value === value);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 font-meta text-[10px] px-3.5 py-2.5 border transition-colors whitespace-nowrap"
        style={{ borderColor: open ? "var(--dept)" : "var(--line-strong)", background: "var(--bg)" }}
      >
        <span className="text-[var(--muted)]">{label}</span>
        <span className="font-bold uppercase">{current?.label ?? value}</span>
        {current?.count !== undefined && <span className="dept-accent">{current.count}</span>}
        <svg width="8" height="5" viewBox="0 0 8 5" fill="none" aria-hidden className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
          <path d="M1 1l3 3 3-3" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={label}
          className="absolute left-0 top-full mt-1 min-w-[220px] max-h-[320px] overflow-auto border border-[var(--line-strong)] shadow-lg z-50"
          style={{ background: "var(--bg)" }}
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              onClick={() => { onChange(o.value); setOpen(false); }}
              className="w-full flex items-center justify-between gap-4 px-3.5 py-2.5 font-meta text-[10px] text-left uppercase transition-colors hover:bg-[var(--panel)]"
              style={o.value === value ? { color: "var(--dept)" } : undefined}
            >
              <span className="flex items-center gap-2">
                <span className="w-3" aria-hidden>{o.value === value ? "✓" : ""}</span>
                {o.label}
              </span>
              {o.count !== undefined && <span className="text-[var(--muted)]">{o.count}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* list-view row — same data, editorial index-row layout */
function ServiceRow({ s, onAdd }: { s: DesignService; onAdd: () => void }) {
  const money = useMoney();
  return (
    <Reveal>
      <div className="group flex flex-wrap items-center gap-x-6 gap-y-2 px-3 md:px-5 py-4 border-t border-[var(--line)] hover:bg-[var(--panel)] transition-colors">
        <Link to={`/design-services/${s.slug}`} className="flex-1 min-w-[220px]" onClick={() => track("design_service_view", { service: s.slug })}>
          <span className="idx">/{s.category}{s.popular ? " · popular" : ""}</span>
          <h3 className="font-display text-base font-bold uppercase mt-1 leading-tight group-hover:text-[var(--dept)] transition-colors">{s.name}</h3>
          <p className="text-[12px] text-[var(--muted)] mt-0.5 line-clamp-1">{s.short}</p>
        </Link>
        <span className="hidden md:block font-meta text-[9px] text-[var(--muted)] w-32 shrink-0">{s.turnaround} · {s.revisions} revisions</span>
        <span className="font-display-wide text-base font-bold w-28 shrink-0">{priceLabel(s, money)}</span>
        {isQuoteOnly(s) ? (
          <Link
            to={`/start?intent=quote&service=${encodeURIComponent(s.name)}`}
            className="font-meta text-[9px] px-3 py-2 border border-[var(--dept)] dept-accent hover:bg-[var(--dept)] hover:text-[var(--on-dept,var(--bg))] transition-colors shrink-0"
            onClick={() => track("quote_cta_click", { service: s.slug, via: "row" })}
          >
            Request a Quote →
          </Link>
        ) : (
          <span className="flex items-center gap-2 shrink-0">
            {!isQuoteOnly(s) && s.packageEligible !== false && (
              <button
                className="font-meta text-[9px] px-2.5 py-2 border border-[var(--line)] text-[var(--muted)] hover:border-[var(--line-strong)] hover:text-[var(--ink)] transition-colors"
                onClick={onAdd}
                aria-label={`Add ${s.name} to package`}
              >
                +
              </button>
            )}
            <Link
              to={`/design-services/${s.slug}`}
              className="btn btn-dept !py-2 !px-3.5 font-meta text-[9px]"
              onClick={() => track("order_now_click", { service: s.slug, via: "row" })}
            >
              Order Now →
            </Link>
          </span>
        )}
      </div>
    </Reveal>
  );
}

/* grid / list toggle icons */
const GridIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
    <rect x="1" y="1" width="4" height="4" stroke="currentColor" /><rect x="7" y="1" width="4" height="4" stroke="currentColor" />
    <rect x="1" y="7" width="4" height="4" stroke="currentColor" /><rect x="7" y="7" width="4" height="4" stroke="currentColor" />
  </svg>
);
const ListIcon = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
    <path d="M1 2.5h10M1 6h10M1 9.5h10" stroke="currentColor" />
  </svg>
);

export default function DesignStore() {
  useDepartment("brand");
  const { categories, services } = useDesignCatalog();
  const pkg = useDesignPackage();
  const money = useMoney();
  const [cat, setCat] = useState("all");
  const [sort, setSort] = useState("featured");
  const [rawQuery, setRawQuery] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">(() =>
    (typeof window !== "undefined" && window.localStorage.getItem("sk-store-view") === "list") ? "list" : "grid"
  );

  // persist view preference (2026 pattern — respect returning visitors)
  useEffect(() => { window.localStorage.setItem("sk-store-view", view); }, [view]);

  useSEO({
    title: "Graphic Design Services — Catalog & Pricing | Social Kon10 Marketing",
    description: "Flyers, logos, business cards, social media design, banners and more — transparent pricing, custom sizes, and a build-your-own package system.",
    path: "/graphic-design-branding/design-store",
  });

  // debounced search (PRD §49)
  useEffect(() => {
    const t = setTimeout(() => setQuery(rawQuery.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [rawQuery]);

  const visible = useMemo(() => {
    let xs = services;
    if (cat !== "all") xs = xs.filter((s) => s.category === cat);
    if (query) xs = xs.filter((s) => `${s.name} ${s.short}`.toLowerCase().includes(query));
    const by = {
      "featured": (a: DesignService, b: DesignService) => Number(b.featured ?? false) - Number(a.featured ?? false) || a.name.localeCompare(b.name),
      "price-asc": (a: DesignService, b: DesignService) => a.price - b.price,
      "price-desc": (a: DesignService, b: DesignService) => b.price - a.price,
      "name": (a: DesignService, b: DesignService) => a.name.localeCompare(b.name),
    }[sort] ?? (() => 0);
    return [...xs].sort(by);
  }, [services, cat, query, sort]);

  const catOptions = useMemo(() => [
    { value: "all", label: "All", count: services.length },
    ...categories.map((c) => ({ value: c.slug, label: c.name, count: services.filter((s) => s.category === c.slug).length })),
  ], [categories, services]);

  const SORT_OPTIONS = [
    { value: "featured", label: "Featured" },
    { value: "price-asc", label: "Price · low → high" },
    { value: "price-desc", label: "Price · high → low" },
    { value: "name", label: "Name · A–Z" },
  ];

  const featured = services.filter((s) => s.featured).slice(0, 6);
  const catName = (slug: string) => categories.find((c) => c.slug === slug)?.name ?? slug;

  const add = (s: DesignService) => {
    pkg.add(s.slug);
    toast.success(`${s.name} added to your package`, { action: { label: "Review", onClick: () => (window.location.href = "/custom-package") } });
  };

  return (
    <>
      <section className="wrap pt-14 md:pt-20 pb-10">
        <Reveal>
          <div className="flex flex-wrap justify-between gap-3 font-meta text-[10px] text-[var(--muted)]">
            <span className="idx">/graphic-design /design-store</span>
            <span>{services.length} services · {categories.length} categories</span>
          </div>
        </Reveal>
        <h1 className="display-hero mt-6 max-w-[12ch]">Design, priced like a product.</h1>
        <Reveal delay={200}>
          <p className="mt-6 max-w-xl text-[var(--muted)]">
            Pick a service, choose a size, add options, see the price live. Bundle services into a custom package and the bundle discount applies itself.
          </p>
        </Reveal>
        <Reveal delay={280}>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link to="/custom-package" className="btn btn-fill">Build my package <span className="btn-arrow" aria-hidden>→</span></Link>
            <Link to="/graphic-design-branding" className="btn btn-ghost">Department overview</Link>
          </div>
        </Reveal>
      </section>

      <DesignJourneys />

      {/* featured strip */}
      {featured.length > 0 && (
        <section className="rule-t" aria-label="Featured services">
          <div className="wrap py-12">
            <Reveal><span className="idx">/featured</span></Reveal>
            <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {featured.map((s, i) => <ServiceCard key={s.slug} s={s} delay={i * 60} onAdd={() => add(s)} />)}
            </div>
          </div>
        </section>
      )}

      {/* filter bar — dropdown filters + view toggle */}
      <section className="rule-t sticky top-[68px] z-30" style={{ background: "var(--bg)" }} aria-label="Catalog filters">
        <div className="wrap py-4 flex flex-wrap items-center gap-3">
          <FilterDropdown label="Category" value={cat} options={catOptions} onChange={(v) => { setCat(v); track("design_filter", { category: v }); }} />
          <FilterDropdown label="Sort" value={sort} options={SORT_OPTIONS} onChange={setSort} />
          <input
            type="search"
            value={rawQuery}
            onChange={(e) => setRawQuery(e.target.value)}
            placeholder="Search services…"
            aria-label="Search design services"
            className="bg-transparent border border-[var(--line)] px-3 py-2 text-sm outline-none focus:border-[var(--dept)] transition-colors w-full sm:w-56 sm:ml-auto"
          />
          {/* grid / list view toggle */}
          <div className="flex border border-[var(--line-strong)]" role="group" aria-label="Change layout">
            {([["grid", <GridIcon key="g" />], ["list", <ListIcon key="l" />]] as const).map(([v, icon]) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                aria-label={`${v} view`}
                onClick={() => setView(v)}
                className="px-3 py-2.5 transition-colors"
                style={view === v ? { background: "var(--ink)", color: "var(--bg)" } : undefined}
              >
                {icon}
              </button>
            ))}
          </div>
          {/* persistent package chip — keeps the builder one click away (desktop) */}
          {pkg.count > 0 && (
            <Link to="/custom-package"
              className="hidden lg:flex items-center gap-2.5 font-meta text-[10px] px-3.5 py-2 border border-[var(--line-strong)] hover:bg-[var(--ink)] hover:text-[var(--bg)] transition-colors shrink-0"
              aria-label={`Review package, ${pkg.count} items`}>
              <span className="dept-bg w-4 h-4 grid place-items-center text-[9px]">{pkg.count}</span>
              {money(pkg.total)} — REVIEW →
            </Link>
          )}
        </div>
      </section>

      {/* catalog — grid or list */}
      <section className="wrap py-12 pb-28" aria-label="Service catalog">
        <p className="font-meta text-[10px] text-[var(--muted)] mb-6">
          {cat !== "all" ? `${catName(cat)} — ` : ""}{visible.length} service{visible.length === 1 ? "" : "s"}
        </p>
        {view === "grid" ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visible.map((s, i) => <ServiceCard key={s.slug} s={s} delay={(i % 3) * 50} onAdd={() => add(s)} />)}
          </div>
        ) : (
          <div className="border-b border-[var(--line)]">
            {visible.map((s) => <ServiceRow key={s.slug} s={s} onAdd={() => add(s)} />)}
          </div>
        )}
        {visible.length === 0 && <p className="font-meta text-[11px] text-[var(--muted)] py-16 text-center">Nothing matches — try another category or search.</p>}
      </section>

      {/* mobile sticky package bar (PRD §50) */}
      {pkg.count > 0 && (
        <Link
          to="/custom-package"
          className="fixed bottom-0 inset-x-0 z-40 flex items-center justify-between px-5 py-4 border-t border-[var(--line-strong)] lg:hidden"
          style={{ background: "var(--ink)", color: "var(--bg)" }}
        >
          <span className="font-meta text-[10px]">{pkg.count} item{pkg.count === 1 ? "" : "s"} · {money(pkg.total)}</span>
          <span className="font-meta text-[10px] dept-accent">REVIEW PACKAGE →</span>
        </Link>
      )}
      <CustomProjectCta />
      <FinalCta />
    </>
  );
}
