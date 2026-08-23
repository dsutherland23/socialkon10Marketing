import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useDepartment } from "../lib/dept";
import { useSEO, track } from "../lib/seo";
import { Reveal } from "../lib/motion";
import { useMoney } from "../lib/money";
import { useShop } from "../lib/shop";
import { listManaged } from "../lib/backend";
import {
  bundleCartItem, bundleValue, effectivePrice, matchesQuery, templateCartItem,
  usePublishedTemplates, type Template, type TemplateReview,
} from "../lib/templates";
import { TemplateCard, TemplatePreview } from "../components/Watermark";
import { FilterDropdown } from "./DesignStore";
import { TalkToUs } from "../components/TalkToUs";

/* ------------------------------------------------------------------
   TEMPLATE MARKETPLACE (Templates PRD §2–§7)
   /templates — hero, search, filters, sorting, cards, bundles,
   free templates. Data: seed catalog + admin-managed overrides.
------------------------------------------------------------------- */

const PRICE_BANDS = [
  { value: "all", label: "Any price" },
  { value: "free", label: "Free" },
  { value: "under10", label: "Under $10" },
  { value: "10-25", label: "$10 – $25" },
  { value: "25-50", label: "$25 – $50" },
  { value: "50plus", label: "$50+" },
];

const SORTS = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "bestselling", label: "Best Selling" },
  { value: "popular", label: "Most Popular" },
  { value: "rated", label: "Highest Rated" },
  { value: "priceAsc", label: "Price: Low → High" },
  { value: "priceDesc", label: "Price: High → Low" },
];

function inPriceBand(p: number, band: string): boolean {
  if (band === "free") return p === 0;
  if (band === "under10") return p > 0 && p < 10;
  if (band === "10-25") return p >= 10 && p <= 25;
  if (band === "25-50") return p > 25 && p <= 50;
  if (band === "50plus") return p > 50;
  return true;
}

function QuickView({ tpl, categoryName, onClose }: { tpl: Template; categoryName?: string; onClose: () => void }) {
  const money = useMoney();
  const { add } = useShop();
  const navigate = useNavigate();
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = ""; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={`${tpl.name} — quick view`}
      style={{ background: "rgb(0 0 0 / 0.72)" }} onClick={onClose}>
      <div className="w-full max-w-3xl grid md:grid-cols-2 border border-[var(--line-strong)]" style={{ background: "var(--bg)" }}
        onClick={(e) => e.stopPropagation()}>
        <TemplatePreview tpl={tpl} className="aspect-[4/5]" />
        <div className="p-7 flex flex-col">
          <span className="font-meta text-[9px] text-[var(--muted)]">{categoryName ?? tpl.category} · {tpl.software}</span>
          <h3 className="font-display text-2xl font-bold uppercase mt-2 leading-tight">{tpl.name}</h3>
          <p className="text-sm text-[var(--muted)] mt-3 leading-relaxed line-clamp-4">{tpl.description}</p>
          <p className="font-display text-xl font-bold mt-4">
            {effectivePrice(tpl) === 0 ? "Free" : money(effectivePrice(tpl))}
            {tpl.salePrice !== undefined && tpl.salePrice < tpl.price && (
              <span className="text-[var(--muted)] line-through font-normal text-sm ml-2">{money(tpl.price)}</span>
            )}
          </p>
          <div className="mt-auto pt-6 flex flex-col gap-2">
            <button className="btn btn-dept justify-center" onClick={() => {
              add(templateCartItem(tpl, "personal", false));
              toast.success(`${tpl.name} added to cart`, { description: "Personal License — change options on the template page." });
              track("template_add_to_cart", { template: tpl.slug, source: "quick_view" });
            }}>
              Add to cart <span className="btn-arrow" aria-hidden>→</span>
            </button>
            <button className="btn btn-ghost justify-center" onClick={() => navigate(`/templates/${tpl.slug}`)}>View full details</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Templates() {
  useDepartment("brand");
  useSEO({
    title: "Design Templates Marketplace — Social Kon10 Marketing",
    description: "Shop professionally designed templates for events, business, social media, music and more. Instant download or designer customization.",
    path: "/templates",
  });

  const { templates, categories, bundles } = usePublishedTemplates();
  const { add } = useShop();
  const money = useMoney();
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [cat, setCat] = useState("all");
  const [software, setSoftware] = useState("all");
  const [priceBand, setPriceBand] = useState("all");
  const [orientation, setOrientation] = useState("all");
  const [feature, setFeature] = useState("all");
  const [availability, setAvailability] = useState("all");
  const [sort, setSort] = useState("featured");
  const [quickView, setQuickView] = useState<Template | null>(null);
  const [ratings, setRatings] = useState<Record<string, number>>({});

  // verified-review averages power "Highest Rated" sort — no fabricated ratings
  useEffect(() => {
    (async () => {
      const rows = await listManaged("templateReviews") as unknown as TemplateReview[];
      const acc = new Map<string, { sum: number; n: number }>();
      rows.filter((r) => r.status === "approved").forEach((r) => {
        const a = acc.get(r.templateSlug) ?? { sum: 0, n: 0 };
        a.sum += Number(r.rating) || 0; a.n += 1;
        acc.set(r.templateSlug, a);
      });
      const out: Record<string, number> = {};
      acc.forEach((v, k) => { out[k] = v.n ? v.sum / v.n : 0; });
      setRatings(out);
    })();
  }, []);

  // debounce search (§5)
  const debRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    clearTimeout(debRef.current);
    debRef.current = setTimeout(() => {
      setDebounced(query);
      if (query.trim().length >= 3) track("template_search", { query: query.trim() });
    }, 280);
    return () => clearTimeout(debRef.current);
  }, [query]);

  const softwareOptions = useMemo(() => {
    const counts = new Map<string, number>();
    templates.forEach((t) => counts.set(t.software, (counts.get(t.software) ?? 0) + 1));
    return [{ value: "all", label: "All software", count: templates.length },
      ...[...counts.entries()].map(([s, n]) => ({ value: s, label: s, count: n }))];
  }, [templates]);

  const categoryOptions = useMemo(() => [
    { value: "all", label: "All categories", count: templates.length },
    ...categories.filter((c) => c.active !== false).map((c) => ({
      value: c.slug, label: c.name, count: templates.filter((t) => t.category === c.slug).length,
    })),
  ], [categories, templates]);

  const filtered = useMemo(() => {
    let xs = templates;
    if (debounced.trim()) xs = xs.filter((t) => matchesQuery(t, debounced));
    if (cat !== "all") {
      const c = categories.find((x) => x.slug === cat);
      xs = xs.filter((t) => t.category === cat || (c ? c.subs.includes(t.subcategory ?? "") : false));
    }
    if (software !== "all") xs = xs.filter((t) => t.software === software);
    xs = xs.filter((t) => inPriceBand(effectivePrice(t), priceBand));
    if (orientation !== "all") xs = xs.filter((t) => t.orientation === orientation);
    if (feature !== "all") xs = xs.filter((t) => t.features.includes(feature));
    if (availability === "new") xs = xs.filter((t) => t.isNew);
    if (availability === "bestseller") xs = xs.filter((t) => t.bestseller);
    if (availability === "free") xs = xs.filter((t) => effectivePrice(t) === 0);
    if (availability === "sale") xs = xs.filter((t) => t.salePrice !== undefined && t.salePrice < t.price);

    const arr = [...xs];
    switch (sort) {
      case "newest": arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt)); break;
      case "bestselling": arr.sort((a, b) => b.sales - a.sales); break;
      case "popular": arr.sort((a, b) => b.sales - a.sales); break;
      case "rated": arr.sort((a, b) => (ratings[b.slug] ?? 0) - (ratings[a.slug] ?? 0)); break;
      case "priceAsc": arr.sort((a, b) => effectivePrice(a) - effectivePrice(b)); break;
      case "priceDesc": arr.sort((a, b) => effectivePrice(b) - effectivePrice(a)); break;
      default: arr.sort((a, b) => Number(b.bestseller) - Number(a.bestseller) || b.sales - a.sales);
    }
    return arr;
  }, [templates, categories, debounced, cat, software, priceBand, orientation, feature, availability, sort, ratings]);

  const freeTemplates = templates.filter((t) => effectivePrice(t) === 0);
  const catName = (slug: string) => categories.find((c) => c.slug === slug)?.name;

  const addBundle = (slug: string) => {
    const b = bundles.find((x) => x.slug === slug);
    if (!b) return;
    add(bundleCartItem(b));
    toast.success(`${b.name} added to cart`, { description: `${b.templateSlugs.length} templates — every file lands in your library.` });
    track("template_add_to_cart", { bundle: slug, value: b.price });
    navigate("/checkout");
  };

  return (
    <div>
      {/* hero (§2) */}
      <section className="wrap pt-16 md:pt-24 pb-14">
        <Reveal>
          <div className="flex justify-between font-meta text-[10px] text-[var(--muted)]">
            <span className="idx">/templates</span>
            <span>{templates.length} templates · instant download</span>
          </div>
          <h1 className="display-hero mt-6 max-w-4xl">Professional Designs. Ready to Customize.</h1>
          <p className="text-lg text-[var(--muted)] mt-6 max-w-2xl leading-relaxed">
            Shop professionally designed templates for events, businesses, social media, music, marketing and more.
            Download instantly or let our designers customize one for you.
          </p>
          <div className="flex flex-wrap gap-4 mt-8">
            <a href="#browse" className="btn btn-dept">Browse Templates <span className="btn-arrow" aria-hidden>↓</span></a>
            <Link to="/start" className="btn btn-ghost">Hire a Designer</Link>
          </div>
        </Reveal>
      </section>

      {/* discovery (§3–§7) */}
      <section id="browse" className="rule-t">
        <div className="wrap py-14">
          {/* search */}
          <Reveal>
            <label className="block max-w-xl">
              <span className="font-meta text-[10px] text-[var(--muted)] block mb-2">Search templates — name, tag, software, style</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Try “summer party”, “menu”, “Canva”…"
                className="w-full bg-transparent border border-[var(--line-strong)] px-5 py-4 text-base outline-none focus:border-[var(--dept)] transition-colors"
                aria-label="Search templates"
              />
            </label>
          </Reveal>

          {/* filter row — dropdown style */}
          <div className="flex flex-wrap gap-2.5 mt-6" role="group" aria-label="Template filters">
            <FilterDropdown label="Category" value={cat} options={categoryOptions} onChange={setCat} />
            <FilterDropdown label="Software" value={software} options={softwareOptions} onChange={setSoftware} />
            <FilterDropdown label="Price" value={priceBand} options={PRICE_BANDS} onChange={setPriceBand} />
            <FilterDropdown label="Orientation" value={orientation} options={[
              { value: "all", label: "Any" }, { value: "square", label: "Square" },
              { value: "portrait", label: "Portrait" }, { value: "landscape", label: "Landscape" },
            ]} onChange={setOrientation} />
            <FilterDropdown label="Features" value={feature} options={[
              { value: "all", label: "Any" },
              ...["Editable", "Print Ready", "Social Media", "Fully Layered", "Includes Fonts", "Commercial License"].map((f) => ({ value: f, label: f })),
            ]} onChange={setFeature} />
            <FilterDropdown label="Availability" value={availability} options={[
              { value: "all", label: "All" }, { value: "new", label: "New" },
              { value: "bestseller", label: "Bestseller" }, { value: "free", label: "Free" }, { value: "sale", label: "On Sale" },
            ]} onChange={setAvailability} />
            <FilterDropdown label="Sort" value={sort} options={SORTS} onChange={setSort} />
          </div>

          <p className="font-meta text-[10px] text-[var(--muted)] mt-6" aria-live="polite">
            {filtered.length} template{filtered.length === 1 ? "" : "s"}{debounced ? ` matching “${debounced}”` : ""}
          </p>

          {/* grid */}
          {filtered.length === 0 ? (
            <div className="border border-[var(--line)] p-12 text-center mt-6" style={{ background: "var(--panel)" }}>
              <p className="font-display text-xl font-bold uppercase">No templates match</p>
              <p className="text-sm text-[var(--muted)] mt-2">Try a broader search, or clear the filters.</p>
              <button className="btn btn-ghost mt-6" onClick={() => { setQuery(""); setCat("all"); setSoftware("all"); setPriceBand("all"); setOrientation("all"); setFeature("all"); setAvailability("all"); }}>
                Clear all filters
              </button>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 mt-6">
              {filtered.map((t) => (
                <Reveal key={t.slug}>
                  <TemplateCard tpl={t} categoryName={catName(t.category)} onQuickView={setQuickView} />
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* free templates (§34) */}
      {freeTemplates.length > 0 && (
        <section id="free" className="rule-t">
          <div className="wrap py-14">
            <Reveal>
              <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
                <div>
                  <span className="idx">/free</span>
                  <h2 className="display-sub mt-2">Free templates</h2>
                  <p className="text-sm text-[var(--muted)] mt-2 max-w-lg">
                    On the house. Create a free account, claim the template, and it lives in your library forever.
                  </p>
                </div>
              </div>
            </Reveal>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {freeTemplates.map((t) => (
                <Reveal key={t.slug}><TemplateCard tpl={t} categoryName={catName(t.category)} onQuickView={setQuickView} /></Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* bundles (§33) */}
      {bundles.filter((b) => b.active !== false).length > 0 && (
        <section id="bundles" className="rule-t">
          <div className="wrap py-14">
            <Reveal>
              <span className="idx">/bundles</span>
              <h2 className="display-sub mt-2 mb-8">Template bundles — more designs, one price</h2>
            </Reveal>
            <div className="grid md:grid-cols-2 gap-5">
              {bundles.filter((b) => b.active !== false).map((b) => {
                const value = bundleValue(b, templates);
                const members = b.templateSlugs.map((s) => templates.find((t) => t.slug === s)).filter(Boolean) as Template[];
                return (
                  <Reveal key={b.slug}>
                    <article className="border border-[var(--line-strong)] grid sm:grid-cols-[160px_1fr]" style={{ background: "var(--panel)" }}>
                      <div className="relative aspect-[4/5] sm:aspect-auto">
                        {members[0] && <TemplatePreview tpl={members[0]} className="absolute inset-0" />}
                      </div>
                      <div className="p-6 flex flex-col">
                        <h3 className="font-display text-lg font-bold uppercase">{b.name}</h3>
                        <p className="text-sm text-[var(--muted)] mt-2 leading-relaxed">{b.description}</p>
                        <ul className="font-meta text-[10px] text-[var(--muted)] mt-3 flex flex-col gap-1">
                          {members.map((m) => <li key={m.slug}>✓ {m.name}</li>)}
                        </ul>
                        <div className="mt-auto pt-4 flex items-center justify-between gap-3">
                          <p className="font-display font-bold">
                            {value > b.price && <span className="text-[var(--muted)] line-through font-normal text-sm mr-2">{money(value)}</span>}
                            {money(b.price)}
                          </p>
                          <button className="btn btn-dept !py-2.5" onClick={() => addBundle(b.slug)}>
                            Add Bundle to Cart <span className="btn-arrow" aria-hidden>→</span>
                          </button>
                        </div>
                      </div>
                    </article>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* KON10 Studio capabilities — what buyers can actually do with a template */}
      <section className="rule-t">
        <div className="wrap py-16">
          <span className="font-meta text-[10px] tracking-[0.2em] text-[var(--muted)] uppercase">Included with every template</span>
          <h2 className="display-sub mt-3 max-w-3xl">Edit in KON10 Studio — a real design tool, in your browser.</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px border border-[var(--line)] mt-10" style={{ background: "var(--line)" }}>
            {[
              { n: "A1", h: "AI background remover", p: "Cut out any photo subject in one click — runs on your device, nothing uploads." },
              { n: "A2", h: "Magic resize", p: "Refit a flyer to a Story, post or business card in seconds — every page, distortion-free." },
              { n: "A3", h: "QR codes + stock photos", p: "Generate scannable QR codes and drop in commercially-licensed photos without leaving the editor." },
              { n: "A4", h: "Pro control", p: "Layers with drag-to-restack, ruler guides, version history, gradients — then export PNG, JPG, SVG or print-ready PDF." },
            ].map((x) => (
              <Reveal key={x.n}>
                <div className="p-7 h-full" style={{ background: "var(--bg)" }}>
                  <span className="idx">{x.n}</span>
                  <h3 className="font-display text-lg font-bold uppercase mt-3">{x.h}</h3>
                  <p className="text-sm text-[var(--muted)] mt-2 leading-relaxed">{x.p}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* conversion trio (§64) */}
      <section className="rule-t">
        <div className="wrap py-16 grid md:grid-cols-3 gap-px border border-[var(--line)]" style={{ background: "var(--line)" }}>
          {[
            { n: "01", h: "Buy it", p: "Download the template and edit it yourself — instant access from your library." },
            { n: "02", h: "Customize it", p: "Let our designers edit the template for you — text, photos, logo, colors." },
            { n: "03", h: "Build something better", p: "Need something completely different? Request a fully custom design." },
          ].map((x) => (
            <Reveal key={x.n}>
              <div className="p-8 h-full" style={{ background: "var(--bg)" }}>
                <span className="idx">{x.n}</span>
                <h3 className="font-display text-xl font-bold uppercase mt-3">{x.h}</h3>
                <p className="text-sm text-[var(--muted)] mt-2 leading-relaxed">{x.p}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <div className="wrap pb-16">
          <TalkToUs serviceName="a custom design project" />
        </div>
      </section>

      {quickView && <QuickView tpl={quickView} categoryName={catName(quickView.category)} onClose={() => setQuickView(null)} />}
    </div>
  );
}
