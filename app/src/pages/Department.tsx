import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  DEPARTMENTS, EVENT_TIERS, SOCIAL_TIERS, CARE_PLAN_TIERS,
  deptById, formatMoney, type DeptId, type ServiceProduct,
} from "../lib/data";
import { useContent } from "../lib/content";
import { useDepartment } from "../lib/dept";
import { useShop } from "../lib/shop";
import { useSEO, track } from "../lib/seo";
import { useDesignCatalog, useDesignPackage } from "../lib/design-shop";
import type { DesignService } from "../lib/design";
import { ClipLines, Reveal } from "../lib/motion";
import { ArrowLink, Faq, FinalCta, SectionHead, ServiceCard } from "../components/blocks";
import { trackServiceView } from "../lib/analytics";
import { ProjectCover } from "../components/cover";
import { FilterDropdown, ServiceCard as DesignServiceCard } from "./DesignStore";
import { DesignJourneys } from "../components/TalkToUs";
import { WebConfigurator } from "../components/WebConfigurator";

/* ------------------------------------------------------------------
   DEPARTMENT PAGE — one component, three atmospheres.
   Same typography, grid, nav, components. Only the accent system
   and content change (PRD §9).
------------------------------------------------------------------- */

/** Split a headline into 3-word lines for the clip reveal. */
function chunkHeadline(text: string): string[] {
  const words = text.split(" ");
  const out: string[] = [];
  for (let i = 0; i < words.length; i += 3) out.push(words.slice(i, i + 3).join(" "));
  return out;
}

function EventTiers() {
  const { currency, add } = useShop();
  return (
    <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-px" style={{ background: "var(--line)" }}>
      {EVENT_TIERS.map((t, i) => (
        <Reveal key={t.id} delay={i * 60} className="h-full">
          <div
            className="relative flex flex-col h-full p-6 md:p-7"
            style={{ background: t.popular ? "var(--ink)" : "var(--bg)", color: t.popular ? "var(--bg)" : "inherit" }}
          >
            {t.popular && <span className="absolute top-0 left-0 dept-bg font-meta text-[9px] px-3 py-1.5">Most popular</span>}
            <span className="font-meta text-[9px] text-[var(--muted)] mt-4">EVENT PACKAGE</span>
            <h3 className="font-display text-xl font-bold uppercase mt-2">{t.name}</h3>
            <p className="text-[12px] mt-1 opacity-70">{t.tagline}</p>
            <p className="font-display-wide text-4xl font-bold mt-6">{formatMoney(t.price, currency)}</p>
            <ul className="mt-6 flex flex-col gap-1.5 text-[12.5px] flex-1">
              {t.includes.slice(0, 7).map((x) => <li key={x} className="flex gap-2"><span className="dept-accent" aria-hidden>✓</span>{x}</li>)}
              {t.includes.length > 7 && <li className="font-meta text-[9px] opacity-60 mt-1">+ {t.includes.length - 7} more</li>}
            </ul>
            <p className="font-meta text-[9px] opacity-60 mt-5">Best for: {t.bestFor}</p>
            <button
              className={`btn mt-6 justify-center ${t.popular ? "btn-dept" : "btn-ghost"}`}
              onClick={() =>
                add({
                  serviceSlug: "event-branding",
                  name: `Event Creative — ${t.name}`,
                  unitPrice: t.price,
                  tierLabel: t.name,
                  addons: [], rush: false, billing: "one_time", depositPct: 50,
                })
              }
            >
              Get started
            </button>
          </div>
        </Reveal>
      ))}
    </div>
  );
}

function SocialTiers() {
  const { currency, add } = useShop();
  return (
    <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-px" style={{ background: "var(--line)" }}>
      {SOCIAL_TIERS.map((t, i) => (
        <Reveal key={t.id} delay={i * 60} className="h-full">
          <div
            className="relative flex flex-col h-full p-6 md:p-7"
            style={{ background: t.popular ? "var(--ink)" : "var(--bg)", color: t.popular ? "var(--bg)" : "inherit" }}
          >
            {t.popular && <span className="absolute top-0 left-0 dept-bg font-meta text-[9px] px-3 py-1.5">Most popular</span>}
            <span className="font-meta text-[9px] text-[var(--muted)] mt-4">MONTHLY PACKAGE</span>
            <h3 className="font-display text-xl font-bold uppercase mt-2">{t.name}</h3>
            <p className="text-[12px] mt-1 opacity-70">{t.blurb}</p>
            <p className="font-display-wide text-4xl font-bold mt-6">
              {t.quote ? "Custom" : <>{formatMoney(t.price, currency)}<span className="text-sm font-meta font-normal opacity-60">{t.period}</span></>}
            </p>
            <dl className="mt-6 flex flex-col gap-2 text-[12.5px] flex-1">
              {t.features.map((f) => (
                <div key={f.label} className="flex justify-between gap-3">
                  <dt className="opacity-60">{f.label}</dt>
                  <dd className="text-right font-medium">{f.value}</dd>
                </div>
              ))}
            </dl>
            {t.quote ? (
              <Link to={`/start?intent=quote&service=${t.id}`} className={`btn mt-6 justify-center ${t.popular ? "btn-dept" : "btn-ghost"}`}>Request quote</Link>
            ) : (
              <button
                className={`btn mt-6 justify-center ${t.popular ? "btn-dept" : "btn-ghost"}`}
                onClick={() =>
                  add({
                    serviceSlug: "social-media-management",
                    name: `Social Media Management — ${t.name}`,
                    unitPrice: t.price,
                    tierLabel: t.name,
                    addons: [], rush: false, billing: "monthly", depositPct: 50,
                  })
                }
              >
                Get started
              </button>
            )}
          </div>
        </Reveal>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------
   SOCIAL DEPARTMENT — editorial deep-dive sections.
   Original Social Kon10 copy; structure inspired by leading
   social media agencies (pillars → why → process → packages).
------------------------------------------------------------------- */

const SOCIAL_PLATFORMS = ["Instagram", "Facebook", "TikTok", "LinkedIn", "YouTube", "WhatsApp Business"];

const SOCIAL_WHY = [
  {
    n: "01",
    title: "Attention lives on social",
    body: "Your customers scroll every day — in Kingston, across the Caribbean and abroad. A consistent, professional presence keeps your brand the first one they think of when they're ready to buy.",
  },
  {
    n: "02",
    title: "Search happens on social now",
    body: "People discover businesses through Instagram and TikTok search as often as Google. An optimized, active profile meets buyers where they're already looking — and retargets the ones who clicked but didn't convert.",
  },
  {
    n: "03",
    title: "Conversations shape reputation",
    body: "Customers comment, message and review in public. We monitor and respond on your behalf, so every interaction builds trust instead of sitting unanswered.",
  },
  {
    n: "04",
    title: "Your competitors are posting",
    body: "Most small businesses promote themselves on social media. The ones who win show up with strategy, not just activity — that's the gap we close for you.",
  },
];

const SOCIAL_PROCESS = [
  {
    n: "01",
    title: "Audit & research",
    body: "Before anything gets posted, we review your current presence, your competitors and your audience. What makes you worth choosing becomes the backbone of the plan.",
  },
  {
    n: "02",
    title: "Strategy & calendar",
    body: "You get a monthly content calendar built around your goals — launches, promotions, seasons — planned in advance so nothing is ever rushed or off-brand.",
  },
  {
    n: "03",
    title: "Content creation",
    body: "Graphics, captions and short-form video produced in your brand voice. You approve everything before it goes live — nothing publishes without your sign-off.",
  },
  {
    n: "04",
    title: "Publishing & community",
    body: "We schedule, publish and monitor daily — replying to comments and messages so your page stays alive between posts, not just on posting days.",
  },
  {
    n: "05",
    title: "Report & optimize",
    body: "A plain-language report every month: what grew, what converted, and what we're changing next. No vanity metrics — just numbers tied to your goals.",
  },
];

function SocialWhy() {
  return (
    <section className="rule-t" aria-label="Why social media matters">
      <div className="wrap py-20 md:py-28">
        <SectionHead
          index="/02/why"
          title={["Your customers", "are scrolling."]}
          meta="Social media is where attention, search and reputation now live. Here's why a managed presence pays for itself."
        />
        <div className="grid sm:grid-cols-2 gap-px" style={{ background: "var(--line)" }}>
          {SOCIAL_WHY.map((r, i) => (
            <Reveal key={r.n} delay={i * 60} className="h-full">
              <div className="h-full p-6 md:p-8" style={{ background: "var(--bg)" }}>
                <span className="font-meta text-[10px] dept-accent">{r.n}</span>
                <h3 className="font-display text-xl font-bold uppercase mt-3">{r.title}</h3>
                <p className="text-[13px] text-[var(--muted)] leading-relaxed mt-3">{r.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={120}>
          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 font-meta text-[10px] text-[var(--muted)]">
            <span className="dept-accent">/platforms we run</span>
            {SOCIAL_PLATFORMS.map((p) => <span key={p}>{p}</span>)}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function SocialProcess() {
  return (
    <section className="rule-t" style={{ background: "var(--panel)" }} aria-label="Our social media process">
      <div className="wrap py-20 md:py-28">
        <SectionHead
          index="/02/process"
          title={["How we run", "your social."]}
          meta="A managed system, not random posting. Five steps, repeated and refined every month."
        />
        <div className="flex flex-col">
          {SOCIAL_PROCESS.map((s, i) => (
            <Reveal key={s.n} delay={i * 50}>
              <div className="grid md:grid-cols-12 gap-4 md:gap-8 py-7 md:py-8 items-baseline" style={{ borderTop: "1px solid var(--line)" }}>
                <span className="md:col-span-1 font-meta text-[10px] dept-accent">{s.n}</span>
                <h3 className="md:col-span-4 font-display text-2xl font-bold uppercase">{s.title}</h3>
                <p className="md:col-span-7 text-[13.5px] text-[var(--muted)] leading-relaxed max-w-xl">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------
   WEB DEPARTMENT — editorial deep-dive sections (original copy).
------------------------------------------------------------------- */

const WEB_WHY = [
  {
    n: "01",
    title: "First impressions are digital",
    body: "Before anyone calls, visits or buys, they look you up. A professional website tells them you're established, credible and worth their money — a weak one sends them to a competitor.",
  },
  {
    n: "02",
    title: "Your site sells while you sleep",
    body: "A well-built website captures leads, takes bookings and processes orders around the clock — including the customers who find you at midnight and buy before breakfast.",
  },
  {
    n: "03",
    title: "Every campaign lands here",
    body: "Social posts, ads, business cards, word of mouth — all of it funnels people to your website. If the landing experience is slow or confusing, that marketing spend is wasted.",
  },
  {
    n: "04",
    title: "Mobile decides who stays",
    body: "Most of your visitors are on a phone. We design mobile-first, so the experience is fast and effortless on the device your customers actually use.",
  },
];

const WEB_PROCESS = [
  {
    n: "01",
    title: "Discovery & sitemap",
    body: "We map your goals, pages and content before any design work starts. Who the site is for and what it must achieve drives every decision after this point.",
  },
  {
    n: "02",
    title: "Design",
    body: "Mobile-first layouts in your brand's look and feel. You review real designs — not wireframe jargon — and we refine until it's right.",
  },
  {
    n: "03",
    title: "Build",
    body: "Responsive development with fast load times, clean structure and search-engine fundamentals baked in from the first line — not bolted on later.",
  },
  {
    n: "04",
    title: "Review & refine",
    body: "You test the site on real devices and we work through your revision rounds together. Nothing launches until you've approved every page.",
  },
  {
    n: "05",
    title: "Launch & care",
    body: "We deploy, hand over the keys — you own your domain, hosting and accounts — and the optional Care Plan keeps everything updated, monitored and secure.",
  },
];

function WebWhy() {
  return (
    <section className="rule-t" aria-label="Why your website matters">
      <div className="wrap py-20 md:py-28">
        <SectionHead
          index="/03/why"
          title={["Your website is", "your hardest worker."]}
          meta="It introduces you, answers questions and closes business — every hour of every day. Here's why it's worth building properly."
        />
        <div className="grid sm:grid-cols-2 gap-px" style={{ background: "var(--line)" }}>
          {WEB_WHY.map((r, i) => (
            <Reveal key={r.n} delay={i * 60} className="h-full">
              <div className="h-full p-6 md:p-8" style={{ background: "var(--bg)" }}>
                <span className="font-meta text-[10px] dept-accent">{r.n}</span>
                <h3 className="font-display text-xl font-bold uppercase mt-3">{r.title}</h3>
                <p className="text-[13px] text-[var(--muted)] leading-relaxed mt-3">{r.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={120}>
          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 font-meta text-[10px] text-[var(--muted)]">
            <span className="dept-accent">/included in every build</span>
            <span>Mobile-first design</span>
            <span>SEO fundamentals</span>
            <span>Fast load times</span>
            <span>Contact & lead forms</span>
            <span>You own everything</span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function WebProcess() {
  return (
    <section className="rule-t" style={{ background: "var(--panel)" }} aria-label="Our web design process">
      <div className="wrap py-20 md:py-28">
        <SectionHead
          index="/03/process"
          title={["From brief", "to launch."]}
          meta="A clear, staged build — you always know what's happening and what comes next."
        />
        <div className="flex flex-col">
          {WEB_PROCESS.map((s, i) => (
            <Reveal key={s.n} delay={i * 50}>
              <div className="grid md:grid-cols-12 gap-4 md:gap-8 py-7 md:py-8 items-baseline" style={{ borderTop: "1px solid var(--line)" }}>
                <span className="md:col-span-1 font-meta text-[10px] dept-accent">{s.n}</span>
                <h3 className="md:col-span-4 font-display text-2xl font-bold uppercase">{s.title}</h3>
                <p className="md:col-span-7 text-[13.5px] text-[var(--muted)] leading-relaxed max-w-xl">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------
   BRAND DEPARTMENT — editorial deep-dive sections (original copy).
------------------------------------------------------------------- */

const BRAND_WHY = [
  {
    n: "01",
    title: "People judge in seconds",
    body: "Before a customer reads a word, your visuals have already told them whether you're established, trustworthy and worth the price. Strong design makes that first judgment work for you.",
  },
  {
    n: "02",
    title: "Consistency builds recognition",
    body: "When your logo, colours and type look the same on every flyer, post and package, people start recognising you on sight. That familiarity is what turns one-time buyers into regulars.",
  },
  {
    n: "03",
    title: "Good design earns its keep",
    body: "A polished identity supports premium pricing, wins shelf space and gets your flyers kept instead of binned. Design isn't decoration — it's a sales tool that works on every touchpoint.",
  },
  {
    n: "04",
    title: "DIY shows",
    body: "Customers can spot a template logo and mismatched fonts from across the street. Professional design signals that you take your business seriously — and that they can trust you with theirs.",
  },
];

const BRAND_PROCESS = [
  {
    n: "01",
    title: "Discovery & strategy",
    body: "We dig into your audience, competitors and positioning before any sketching starts. What makes you different becomes the foundation every design decision stands on.",
  },
  {
    n: "02",
    title: "Concepts",
    body: "You receive distinct creative directions — each with the thinking behind it, not just pretty pictures. We present, you react, and a clear favourite emerges.",
  },
  {
    n: "03",
    title: "Refinement",
    body: "Structured revision rounds tighten the chosen direction — typography, colour, spacing, behaviour at small sizes — until every detail earns its place.",
  },
  {
    n: "04",
    title: "System & files",
    body: "You get the complete toolkit: logo variations, colour palette, typography rules, style guide and every file format you'll ever need, print or digital.",
  },
  {
    n: "05",
    title: "Rollout & support",
    body: "From business cards to banners to social templates, we roll the identity out across your touchpoints — and stay on call as your design team when new needs come up.",
  },
];

function BrandWhy() {
  return (
    <section className="rule-t" aria-label="Why brand design matters">
      <div className="wrap py-20 md:py-28">
        <SectionHead
          index="/01/why"
          title={["Design is your", "first impression."]}
          meta="Your brand is being judged before a word is read. Here's what professional design actually does for your business."
        />
        <div className="grid sm:grid-cols-2 gap-px" style={{ background: "var(--line)" }}>
          {BRAND_WHY.map((r, i) => (
            <Reveal key={r.n} delay={i * 60} className="h-full">
              <div className="h-full p-6 md:p-8" style={{ background: "var(--bg)" }}>
                <span className="font-meta text-[10px] dept-accent">{r.n}</span>
                <h3 className="font-display text-xl font-bold uppercase mt-3">{r.title}</h3>
                <p className="text-[13px] text-[var(--muted)] leading-relaxed mt-3">{r.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={120}>
          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 font-meta text-[10px] text-[var(--muted)]">
            <span className="dept-accent">/what you receive</span>
            <span>Full file ownership</span>
            <span>Print + digital formats</span>
            <span>Style guide</span>
            <span>Structured revisions</span>
            <span>60+ design services</span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function BrandProcess() {
  return (
    <section className="rule-t" style={{ background: "var(--panel)" }} aria-label="Our brand design process">
      <div className="wrap py-20 md:py-28">
        <SectionHead
          index="/01/process"
          title={["From brief", "to brand."]}
          meta="Strategy first, pixels second — a staged process with your input at every step."
        />
        <div className="flex flex-col">
          {BRAND_PROCESS.map((s, i) => (
            <Reveal key={s.n} delay={i * 50}>
              <div className="grid md:grid-cols-12 gap-4 md:gap-8 py-7 md:py-8 items-baseline" style={{ borderTop: "1px solid var(--line)" }}>
                <span className="md:col-span-1 font-meta text-[10px] dept-accent">{s.n}</span>
                <h3 className="md:col-span-4 font-display text-2xl font-bold uppercase">{s.title}</h3>
                <p className="md:col-span-7 text-[13.5px] text-[var(--muted)] leading-relaxed max-w-xl">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------
   UNIFIED BRAND CATALOG (2026 pattern) — one destination, three
   switchable views: services, event packages, embedded design store.
   Deep-linkable via #services / #events / #store. All functionality
   (filtering, search, add-to-package, tier checkout) preserved.
------------------------------------------------------------------- */

const BRAND_TABS = [
  { id: "services", label: "Services + products" },
  { id: "events", label: "Event packages" },
  { id: "store", label: "Design store" },
] as const;

type BrandTab = (typeof BRAND_TABS)[number]["id"];

/** Embedded mini-store — live catalog, dropdown filter, debounced search. */
function StorePreview() {
  const { categories, services } = useDesignCatalog();
  const pkg = useDesignPackage();
  const navigate = useNavigate();
  const [cat, setCat] = useState("all");
  const [raw, setRaw] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setQ(raw.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [raw]);

  const visible = useMemo(() => {
    let xs = services;
    if (cat !== "all") xs = xs.filter((s) => s.category === cat);
    if (q) xs = xs.filter((s) => `${s.name} ${s.short}`.toLowerCase().includes(q));
    return xs;
  }, [services, cat, q]);

  const catOptions = useMemo(() => [
    { value: "all", label: "All", count: services.length },
    ...categories.map((c) => ({ value: c.slug, label: c.name, count: services.filter((s) => s.category === c.slug).length })),
  ], [categories, services]);

  const add = (s: DesignService) => {
    pkg.add(s.slug);
    toast.success(`Added "${s.name}" to package & cart`, { action: { label: "Checkout →", onClick: () => navigate("/checkout") } });
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <FilterDropdown label="Category" value={cat} options={catOptions} onChange={(v) => { setCat(v); track("design_filter", { category: v, context: "brand-catalog" }); }} />
        <input
          type="search"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="Search services…"
          aria-label="Search design services"
          className="bg-transparent border border-[var(--line)] px-3 py-2 text-sm outline-none focus:border-[var(--dept)] transition-colors w-full sm:w-56"
        />
        <span className="font-meta text-[10px] text-[var(--muted)] sm:ml-auto">{visible.length} of {services.length} services</span>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {visible.slice(0, 6).map((s, i) => <DesignServiceCard key={s.slug} s={s} delay={(i % 3) * 50} onAdd={() => add(s)} />)}
      </div>
      {visible.length === 0 && <p className="font-meta text-[11px] text-[var(--muted)] py-12 text-center">Nothing matches — try another category or search.</p>}
      <div className="mt-10 flex flex-wrap items-center gap-4">
        <Link to="/graphic-design-branding/design-store" className="btn btn-dept">
          Browse all {services.length} services <span className="btn-arrow" aria-hidden>→</span>
        </Link>
        <Link to="/custom-package" className="btn btn-ghost">Build a package</Link>
        {pkg.count > 0 && (
          <Link to="/custom-package" className="font-meta text-[10px] dept-accent u-line">
            {pkg.count} item{pkg.count === 1 ? "" : "s"} in your package — review →
          </Link>
        )}
      </div>
    </div>
  );
}

/** One catalog, three views — replaces separate sections. */
function BrandCatalog({ services }: { services: ServiceProduct[] }) {
  const design = useDesignCatalog();
  const [tab, setTab] = useState<BrandTab>(() => {
    const h = typeof window !== "undefined" ? window.location.hash.replace("#", "") : "";
    return (BRAND_TABS.some((t) => t.id === h) ? h : "services") as BrandTab;
  });

  // keep tab in sync when only the hash changes (same-document navigation)
  useEffect(() => {
    const onHash = () => {
      const h = window.location.hash.replace("#", "");
      if (BRAND_TABS.some((t) => t.id === h)) setTab(h as BrandTab);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const counts: Record<BrandTab, number> = {
    services: services.length,
    events: EVENT_TIERS.length,
    store: design.services.length,
  };

  const select = (id: BrandTab) => {
    setTab(id);
    window.history.replaceState(null, "", `#${id}`);
    track("brand_catalog_tab", { tab: id });
  };

  return (
    <section className="rule-t" id="services" aria-label="Brand catalog">
      <div className="wrap py-20 md:py-28">
        <SectionHead
          index="/01/catalog"
          title={["Everything", "we make."]}
          meta="Fixed-price services, event creative packages and the full design store — one place, transparent pricing."
        />
        {/* sticky segmented tab bar */}
        <div className="sticky top-[68px] z-30 mt-10 py-3" style={{ background: "var(--bg)" }}>
          <div className="flex flex-wrap w-fit border border-[var(--line-strong)]" role="tablist" aria-label="Catalog views">
            {BRAND_TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => select(t.id)}
                className="flex items-center gap-2.5 font-meta text-[10px] uppercase px-4 md:px-6 py-3 transition-colors"
                style={tab === t.id ? { background: "var(--ink)", color: "var(--bg)" } : undefined}
              >
                {t.label}
                <span className={tab === t.id ? "dept-accent" : "text-[var(--muted)]"}>{counts[t.id]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="mt-10" role="tabpanel" aria-label={BRAND_TABS.find((t) => t.id === tab)?.label}>
          {tab === "services" && (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-6">
              {services.map((s, i) => <ServiceCard key={s.id} service={s} delay={(i % 3) * 60} />)}
            </div>
          )}
          {tab === "events" && <EventTiers />}
          {tab === "store" && <StorePreview />}
        </div>
      </div>
    </section>
  );
}

function WebCarePlanSection() {
  return (
    <div className="mt-20">
      <SectionHead
        index="/care-plans"
        title={["Website", "care plans."]}
        meta="Monthly maintenance retainers that keep your site fast, secure and updated — so you never have to think about it."
      />
      <div className="mt-8 grid sm:grid-cols-2 xl:grid-cols-4 gap-px" style={{ background: "var(--line)" }}>
        {CARE_PLAN_TIERS.map((t, i) => (
          <Reveal key={t.id} delay={i * 60} className="h-full">
            <div
              className="relative flex flex-col h-full p-5 md:p-6"
              style={{ background: t.popular ? "var(--ink)" : "var(--bg)", color: t.popular ? "var(--bg)" : "inherit" }}
            >
              {t.popular && (
                <span className="absolute top-0 left-0 dept-bg font-meta text-[9px] px-3 py-1.5">Most popular</span>
              )}
              <span className="font-meta text-[9px] text-[var(--muted)] mt-4">CARE PLAN</span>
              <h3 className="font-display text-lg font-bold uppercase mt-1">{t.name}</h3>
              <p className="text-[11px] mt-1 opacity-70">{t.blurb}</p>
              <p className="font-display-wide text-3xl font-bold mt-4">
                {formatMoney(t.price)}
                <span className="text-sm font-normal opacity-60">{t.period}</span>
              </p>
              <ul className="mt-5 flex flex-col gap-1.5 text-[11px] flex-1">
                {t.features.map((f) => (
                  <li key={f.label} className="flex justify-between gap-2 border-b border-[var(--line)] pb-1.5 last:border-0">
                    <span className="opacity-70">{f.label}</span>
                    <span className="font-medium">{f.value}</span>
                  </li>
                ))}
              </ul>
              <a
                href="/start?intent=quote"
                className={`btn mt-6 justify-center text-sm ${t.popular ? "btn-dept" : "btn-ghost"}`}
              >
                Get started
              </a>
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  );
}

function WebAiSection() {
  const aiServices = [
    {
      slug: "ai-website-assistant",
      title: "AI Website Assistant",
      tagline: "Your website, always on. Always helpful.",
      price: "From $1,500",
      desc: "An AI assistant trained on your business — answers questions, qualifies leads, routes inquiries and books appointments.",
    },
    {
      slug: "ai-workflow-automation",
      title: "AI Workflow Automation",
      tagline: "Automate the work, own the results.",
      price: "From $2,500",
      desc: "Automated lead follow-up, CRM enrichment, reporting and business process automation using n8n, Zapier or custom APIs.",
    },
    {
      slug: "web-application",
      title: "Custom Web Application",
      tagline: "Purpose-built technology for your business.",
      price: "From $5,000",
      desc: "Client portals, booking platforms, inventory systems, SaaS MVPs and business-specific tools built to specification.",
    },
  ];

  return (
    <div className="mt-20">
      <SectionHead
        index="/ai-technology"
        title={["AI +", "Technology."]}
        meta="Intelligent features and custom-built technology that give your business a measurable competitive edge."
      />
      <div className="mt-8 grid md:grid-cols-3 gap-px" style={{ background: "var(--line)" }}>
        {aiServices.map((svc, i) => (
          <Reveal key={svc.slug} delay={i * 80} className="h-full">
            <div className="flex flex-col h-full p-6 md:p-8" style={{ background: "var(--panel)" }}>
              <span className="font-meta text-[9px] text-[var(--muted)]">AI + TECH</span>
              <h3 className="font-display text-lg font-bold uppercase mt-2">{svc.title}</h3>
              <p className="text-[11px] mt-1 dept-accent">{svc.tagline}</p>
              <p className="text-[12.5px] mt-4 opacity-80 flex-1">{svc.desc}</p>
              <div className="mt-6 flex items-center justify-between">
                <span className="font-display-wide font-bold text-xl">{svc.price}</span>
                <a
                  href={`/design-services/${svc.slug}`}
                  className="btn btn-ghost btn-sm"
                >
                  Learn more
                </a>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  );
}

export default function DepartmentPage({ deptId }: { deptId: DeptId }) {  const dept = DEPARTMENTS.find((d) => d.id === deptId);
  const { currency } = useShop();
  const { services: allServices, faqs: allFaqs, projects } = useContent();
  const [configFor, setConfigFor] = useState<ServiceProduct | null>(null);
  useDepartment(deptId);
  useSEO({
    title: dept ? `${dept.name} — Social Kon10 Marketing` : "Services — Social Kon10",
    description: dept?.sub ?? "",
    path: dept?.path,
    jsonLd: dept && {
      "@context": "https://schema.org",
      "@type": "Service",
      name: dept.name,
      provider: { "@id": "https://socialkon10.com/#org" },
      description: dept.sub,
    },
  });

  // Track department interest for Website Intelligence dashboard
  useEffect(() => {
    if (dept) {
      void trackServiceView(`dept:${deptId}`, dept.name);
    }
  }, [deptId, dept]);

  if (!dept) return <Navigate to="/" replace />;

  const services = allServices.filter((s) => s.dept === deptId);
  const work = projects.filter((p) => p.dept === deptId).slice(0, 3);
  const faqs = allFaqs.filter((f) => f.dept === deptId);

  return (
    <>
      {/* department hero */}
      <section className="relative overflow-hidden" style={{ background: "var(--dept-soft)" }}>
        <div className="wrap pt-14 md:pt-20 pb-16 md:pb-24 min-h-[70vh] flex flex-col justify-center">
          <Reveal>
            <div className="flex justify-between font-meta text-[10px] text-[var(--muted)] pb-10">
              <span className="idx">{dept.index} department</span>
              <span>{dept.personality.join(" · ")}</span>
            </div>
          </Reveal>
          <h1 className="display-hero max-w-[15ch]">
            <ClipLines lines={chunkHeadline(dept.headline)} />
          </h1>
          <Reveal delay={240}>
            <p className="mt-8 max-w-xl text-base md:text-lg text-[var(--muted)] leading-relaxed">{dept.sub}</p>
          </Reveal>
          <Reveal delay={320}>
            <div className="mt-10 flex flex-wrap gap-4">
              <a href="#services" className="btn btn-dept">{dept.cta} <span className="btn-arrow" aria-hidden>→</span></a>
              <Link to={`/work?dept=${dept.id}`} className="btn btn-ghost">{dept.ctaSecondary}</Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* services — brand dept gets the unified catalog instead */}
      {deptId !== "brand" && (
        <section className="rule-t" id="services">
          <div className="wrap py-20 md:py-28">
            <SectionHead index={`${dept.index}/services`} title={["Services +", "products."]} meta="Fixed prices where the scope is fixed. Starting prices where it flexes. Quotes where it should." />
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-6">
              {services.map((s, i) => <ServiceCard key={s.id} service={s} delay={(i % 3) * 60} />)}
            </div>
          </div>
        </section>
      )}

      {/* department-specific package systems */}
      {deptId === "brand" && (
        <>
          <DesignJourneys />
          <BrandWhy />
          <BrandProcess />
          <BrandCatalog services={services} />
        </>
      )}
      {deptId === "social" && (
        <>
          <SocialWhy />
          <SocialProcess />
          <section className="rule-t" aria-label="Social packages">
            <div className="wrap py-20 md:py-28">
              <SectionHead index={`${dept.index}/packages`} title={["Pick your", "growth gear."]} meta="Monthly management with content, community and reporting. Built to increase qualified traffic, leads and conversions." />
              <SocialTiers />
            </div>
          </section>
        </>
      )}
      {deptId === "web" && (
        <>
          <WebWhy />
          <WebProcess />
          <section className="rule-t" aria-label="Web pricing">
            <div className="wrap py-20 md:py-28">
              <SectionHead index={`${dept.index}/builds`} title={["Every build,", "mobile-first."]} meta="Landing pages to full ecommerce. Care plans keep everything fast, secure and current after launch." />
            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-px" style={{ background: "var(--line)" }}>
              {services.map((s, i) => (
                <Reveal key={s.id} delay={i * 60} className="h-full">
                  <div className="group flex flex-col h-full p-6 md:p-7 hover:bg-[var(--dept-soft)] transition-colors" style={{ background: "var(--bg)" }}>
                    <span className="font-meta text-[9px] text-[var(--muted)]">{s.billing === "monthly" ? "MONTHLY" : "PROJECT"} · {s.id}</span>
                    <Link to={`/services/${s.slug}`} className="hover:text-[var(--dept)] transition-colors">
                      <h3 className="font-display text-lg font-bold uppercase mt-3">{s.name}</h3>
                    </Link>
                    <span className="font-display-wide text-3xl font-bold mt-5">
                      {formatMoney(s.price, currency)}<span className="text-sm font-meta font-normal text-[var(--muted)]">{s.billing === "monthly" ? "/mo" : s.priceType === "starting" ? "+" : ""}</span>
                    </span>
                    <span className="text-[13px] text-[var(--muted)] mt-2 flex-1">{s.tagline}</span>
                    {s.billing !== "monthly" ? (
                      <span className="mt-6 flex flex-col gap-2">
                        <button type="button" onClick={() => { setConfigFor(s); track("package_selected", { package_id: s.id, package_name: s.name }); }}
                          className="btn btn-dept !py-2.5 justify-center w-full">
                          Customize Scope (Power Up) <span className="btn-arrow" aria-hidden>→</span>
                        </button>
                        <Link to={`/services/${s.slug}`} className="font-meta text-[10px] text-[var(--muted)] hover:text-[var(--dept)] transition-colors text-center underline underline-offset-4">
                          View full project scope & deliverables →
                        </Link>
                      </span>
                    ) : (
                      <Link to={`/services/${s.slug}`} className="font-meta text-[10px] dept-accent mt-6 transition-transform duration-200 group-hover:translate-x-1 inline-flex items-center gap-1" aria-label={`Configure ${s.name}`}>
                        VIEW CARE PLAN DETAILS →
                      </Link>
                    )}
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
          </section>
          {deptId === "web" && <WebCarePlanSection />}
          {deptId === "web" && <WebAiSection />}
        </>
      )}

      {/* department work */}
      <section className="rule-t" aria-label={`${dept.name} work`}>
        <div className="wrap py-20 md:py-28">
          <SectionHead index={`${dept.index}/work`} title={["Recent", `${dept.shortName.toLowerCase()} work.`]} />
          <div className="grid sm:grid-cols-3 gap-8">
            {work.map((p, i) => (
              <Reveal key={p.slug} delay={i * 80}>
                <Link to={`/work/${p.slug}`} className="group block media-hover">
                  <div className="media-frame aspect-[4/5]"><ProjectCover seed={p.coverSeed} hue={p.hue} title={p.title} image={p.image} fit={p.imageFit ?? "contain"} /></div>
                  <span className="font-meta text-[9px] text-[var(--muted)] block mt-3">/PROJECT_{p.id}</span>
                  <h3 className="font-display text-lg font-bold uppercase mt-1 group-hover:text-[var(--dept)] transition-colors">{p.title}</h3>
                </Link>
              </Reveal>
            ))}
          </div>
          <Reveal delay={140}><div className="mt-10"><ArrowLink to={`/work?dept=${dept.id}`}>All {dept.shortName.toLowerCase()} projects</ArrowLink></div></Reveal>
        </div>
      </section>

      {/* contextual FAQ */}
      <section className="rule-t" aria-label="Department FAQ">
        <div className="wrap py-20 md:py-28 grid lg:grid-cols-12 gap-12">
          <div className="lg:col-span-4">
            <Reveal><span className="idx">{dept.index}/faq</span></Reveal>
            <h2 className="display-section mt-3"><ClipLines lines={["Before", "you ask."]} /></h2>
          </div>
          <div className="lg:col-span-8"><Faq items={faqs} /></div>
        </div>
      </section>

      <FinalCta />

      {/* Power Up Your Website — add-on configurator (PRD v1.0.0) */}
      {configFor && <WebConfigurator pkg={configFor} onClose={() => setConfigFor(null)} />}
    </>
  );
}

export { deptById };
