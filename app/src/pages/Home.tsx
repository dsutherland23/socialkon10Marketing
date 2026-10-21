import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  CONTACT, DEPARTMENTS, WHY_POINTS, formatMoney, type DeptId,
} from "../lib/data";
import { useContent } from "../lib/content";
import { useDepartment } from "../lib/dept";
import { useShop } from "../lib/shop";
import { useSEO, track, ORGANIZATION_LD, LOCAL_BUSINESS_LD, faqLd } from "../lib/seo";
import { ClipLines, Magnetic, Reveal, ShuffleText } from "../lib/motion";
import { ArrowLink, Faq, FinalCta, Marquee, SectionHead } from "../components/blocks";
import { VerticalImageStack, type StackImageItem } from "../components/ui/vertical-image-stack";
import { MouseFlyIn } from "../components/ui/mouse-fly-in";
import { CardFanCarousel, type CardItem } from "../components/ui/card-fan-carousel";

/* ================= HERO ================= */

/** Split a headline into 2–3 word lines for the clip reveal. */
function chunkWords(text: string): string[] {
  const words = text.split(" ");
  const out: string[] = [];
  for (let i = 0; i < words.length; i += 3) out.push(words.slice(i, i + 3).join(" "));
  return out;
}

function Hero() {
  const [dept, setDept] = useState<DeptId | null>(null);
  const [hoverDept, setHoverDept] = useState<DeptId | null>(null);
  const { services, projects, home } = useContent();
  useDepartment(dept);
  const active = dept ? DEPARTMENTS.find((d) => d.id === dept)! : null;
  const deptServices = dept ? services.filter((s) => s.dept === dept && s.featured).slice(0, 3) : [];

  const portfolioStackItems: StackImageItem[] = useMemo(() => {
    const filtered = dept ? projects.filter((p) => p.dept === dept) : projects;
    const source = filtered.length >= 3 ? filtered : projects;
    return source.map((p) => ({
      id: p.id || p.slug,
      src: p.image || `/covers/${p.slug}.webp`,
      alt: `${p.title} — ${p.client}`,
      title: p.title,
      client: p.client,
      category: p.categories?.join(" · ") || (p.dept ? p.dept.toUpperCase() : "PORTFOLIO"),
      slug: p.slug,
      fit: p.imageFit ?? "contain",
    }));
  }, [projects, dept]);

  return (
    <section
      className="relative overflow-hidden transition-colors duration-500"
      style={{ background: dept ? "var(--dept-soft)" : "transparent" }}
      aria-label="Introduction"
    >
      <div className="blueprint-grid" aria-hidden="true" />
      <div className="wrap relative pt-12 md:pt-16 pb-14 md:pb-20 min-h-[88vh] flex flex-col justify-between">
        {/* meta strip */}
        <Reveal>
          <div className="flex flex-wrap justify-between gap-3 font-meta text-[10px] text-[var(--muted)] pb-6 md:pb-8">
            <span>Creative growth agency</span>
            <span className="hidden sm:inline">Kingston, Jamaica → Worldwide</span>
            <span>Est. systems, not templates</span>
          </div>
        </Reveal>

        {/* headline & 3D graphic portfolio reel block — side-by-side on desktop */}
        <div className="flex-1 grid lg:grid-cols-12 gap-8 lg:gap-8 items-center py-6 md:py-10">
          {/* Left: Headline & CTA */}
          <div className="lg:col-span-7 flex flex-col justify-center">
            <h1 className="display-hero max-w-[14ch]">
              {active ? (
                <ClipLines key={active.id} lines={chunkWords(active.headline)} />
              ) : home.headline ? (
                <ClipLines lines={chunkWords(home.headline)} />
              ) : (
                <ClipLines lines={["We build brands", <>that get <span className="dept-accent">noticed.</span></>]} />
              )}
            </h1>
            <Reveal delay={260}>
              <p className="mt-6 md:mt-8 max-w-xl text-base md:text-lg text-[var(--muted)] leading-relaxed">
                {active ? active.sub : home.sub}
              </p>
            </Reveal>
            <Reveal delay={340}>
              <div className="mt-8 md:mt-10 flex flex-wrap gap-4">
                {active ? (
                  <>
                    <Magnetic><Link to={active.path} className="btn btn-dept" onClick={() => track("service_view", { dept: active.id })}>{active.cta} <span className="btn-arrow" aria-hidden>→</span></Link></Magnetic>
                    <Magnetic><Link to={`/work?dept=${active.id}`} className="btn btn-ghost">{active.ctaSecondary}</Link></Magnetic>
                    <button className="btn btn-ghost" onClick={() => setDept(null)}>← All departments</button>
                  </>
                ) : (
                  <>
                    <Magnetic><Link to="/start" className="btn btn-fill">Start a project <span className="btn-arrow" aria-hidden>→</span></Link></Magnetic>
                    <Magnetic><Link to="/work" className="btn btn-ghost">Explore our work</Link></Magnetic>
                  </>
                )}
              </div>
            </Reveal>
          </div>

          {/* Right: 3D Scroll Picture Reel Stack feeding from Graphic Portfolio (Desktop/Tablet only) */}
          <div className="hidden lg:flex lg:col-span-5 items-center justify-center relative w-full pt-4 lg:pt-0">
            <Reveal delay={300}>
              <VerticalImageStack items={portfolioStackItems} />
            </Reveal>
          </div>
        </div>

        {/* interactive service selector */}
        <Reveal delay={420}>
          <div className="mt-10 md:mt-14 pt-8 rule-t">
            <p className="font-meta text-[10px] text-[var(--muted)] mb-4">What do you need?</p>
            <div className="grid sm:grid-cols-3 gap-px" style={{ background: "var(--line)" }} role="group" aria-label="Choose a department">
              {DEPARTMENTS.map((d) => {
                const isActive = dept === d.id;
                return (
                  <button
                    key={d.id}
                    onClick={() => { setDept(isActive ? null : d.id); track("department_select", { dept: d.id }); }}
                    onMouseEnter={() => setHoverDept(d.id)}
                    onMouseLeave={() => setHoverDept(null)}
                    aria-pressed={isActive}
                    className="group text-left px-6 py-6 transition-colors duration-200"
                    style={{ background: isActive ? "var(--dept)" : "var(--bg)", color: isActive ? "var(--on-dept)" : "inherit" }}
                  >
                    <span className="idx" style={isActive ? { color: "var(--on-dept)" } : {}}>{d.index}</span>
                    <span className="font-display-wide block text-2xl md:text-3xl font-bold uppercase mt-2 leading-none">
                      <ShuffleText text={d.shortName} play={hoverDept === d.id} />
                    </span>
                    <span className="font-meta text-[9px] mt-3 block" style={{ opacity: isActive ? 0.85 : 0.55 }}>
                      {d.name}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* contextual services load in when a department is active */}
            {active && (
              <div className="grid sm:grid-cols-3 gap-px mt-px" style={{ background: "var(--line)" }}>
                {deptServices.map((s) => (
                  <Link
                    key={s.id}
                    to={`/services/${s.slug}`}
                    className="px-6 py-4 flex items-center justify-between gap-4 hover:bg-[var(--dept-soft)] transition-colors"
                    style={{ background: "var(--bg)" }}
                  >
                    <span className="font-display text-sm font-semibold uppercase">{s.name}</span>
                    <span className="font-meta text-[10px] dept-accent" aria-hidden>→</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ================= DEPARTMENTS INDEX ================= */

const DEPT_VISUALS: Record<DeptId, {
  image: string;
  featured: string;
  category: string;
  badge: string;
}> = {
  brand: {
    image: "/assets/package-logo-design.jpg",
    featured: "Logo & Brand Systems",
    category: "Brand Architecture",
    badge: "Identity System",
  },
  social: {
    image: "/assets/package-social-management.jpg",
    featured: "Social & Content Strategy",
    category: "Campaign & Motion",
    badge: "Social Engine",
  },
  web: {
    image: "/assets/package-business-website.jpg",
    featured: "Websites & Digital Ecosystems",
    category: "Digital Platforms",
    badge: "High-Converting UI",
  },
};

function DepartmentsIndex() {
  const [hover, setHover] = useState<DeptId | null>(null);
  return (
    <section className="rule-t" aria-label="Departments">
      <div className="wrap py-20 md:py-28">
        <SectionHead
          index="/what-we-do"
          title={["Three departments.", "One system."]}
          meta="Each department has its own atmosphere. The structure, the standard and the team stay the same."
        />
        <div className="space-y-px">
          {DEPARTMENTS.map((d, i) => {
            const vis = DEPT_VISUALS[d.id];
            return (
              <Reveal key={d.id} delay={i * 60}>
                <Link
                  to={d.path}
                  className="group file-row grid-cols-[auto_1fr_auto] md:grid-cols-[64px_110px_1fr_auto_auto] items-center gap-4 py-4 sm:py-5"
                  onMouseEnter={() => setHover(d.id)}
                  onMouseLeave={() => setHover(null)}
                >
                  <span className="idx">{d.index}</span>

                  {/* Visual deliverable showcase thumbnail */}
                  <div className="relative w-20 sm:w-28 aspect-[16/10] overflow-hidden bg-neutral-900 border border-[var(--line)] group-hover:border-[var(--dept)] transition-colors">
                    <img
                      src={vis.image}
                      alt={`${d.name} flagship creative`}
                      className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
                  </div>

                  <div className="flex flex-col">
                    <span className="font-display text-xl sm:text-2xl md:text-3xl font-bold uppercase leading-tight group-hover:text-[var(--dept)] transition-colors">
                      <ShuffleText text={d.name} play={hover === d.id} />
                    </span>
                    <span className="font-meta text-[10px] text-[var(--muted)] mt-0.5">
                      {vis.featured} · {vis.category}
                    </span>
                  </div>

                  <span className="hidden md:block font-meta text-[10px] text-[var(--muted)]">
                    {d.personality.join(" · ")}
                  </span>
                  <span className="font-meta text-sm dept-accent group-hover:translate-x-1.5 transition-transform duration-200" aria-hidden>→</span>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ================= CREATIVE SYSTEM ================= */

const CREATIVE_SYSTEM_VISUALS = [
  {
    name: "Brand",
    line: "creates recognition.",
    deliverable: "Visual Identity System",
    image: "/assets/package-brand-identity.jpg",
  },
  {
    name: "Content",
    line: "creates attention.",
    deliverable: "High-Impact Social & Motion",
    image: "/assets/package-social-management.jpg",
  },
  {
    name: "Website",
    line: "creates conversion.",
    deliverable: "Next-Gen Web Architecture",
    image: "/assets/package-business-website.jpg",
  },
  {
    name: "Marketing",
    line: "creates growth.",
    deliverable: "Targeted Paid Funnels",
    image: "/covers/atlas-logistics.webp",
  },
];

function CreativeSystem() {
  return (
    <section className="rule-t" style={{ background: "var(--ink)", color: "var(--bg)" }} aria-label="The Social Kon10 creative system">
      <div className="wrap py-20 md:py-28">
        <Reveal><span className="idx">/the-creative-system</span></Reveal>
        <h2 className="display-section mt-3 max-w-[16ch]">
          <ClipLines lines={["Branding, social and websites", "should not operate separately."]} />
        </h2>
        <div className="mt-14 grid gap-px md:grid-cols-4" style={{ background: "rgba(128,128,128,0.3)" }}>
          {CREATIVE_SYSTEM_VISUALS.map((s, i) => (
            <Reveal key={s.name} delay={i * 80} className="h-full">
              <div className="p-6 md:p-7 h-full flex flex-col group" style={{ background: "var(--ink)" }}>
                <div className="flex items-center justify-between">
                  <span className="idx text-white/90 font-bold">{String(i + 1).padStart(2, "0")}</span>
                  <span className="font-meta text-[8px] uppercase tracking-widest text-white/50">Stage {i + 1}</span>
                </div>

                {/* Visual preview viewport */}
                <div className="relative aspect-[16/10] w-full overflow-hidden border border-white/10 my-4 bg-black/40 group-hover:border-white/30 transition-colors">
                  <img
                    src={s.image}
                    alt={`${s.name} output preview`}
                    className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105 opacity-85 group-hover:opacity-100"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent pointer-events-none" />
                  <span className="absolute bottom-2 left-2.5 font-meta text-[8px] uppercase tracking-wider text-white/90 px-1.5 py-0.5 bg-black/60 backdrop-blur border border-white/10">
                    {s.deliverable}
                  </span>
                </div>

                <p className="font-display-wide text-2xl md:text-3xl font-bold uppercase mt-1 leading-none text-white">{s.name}</p>
                <p className="mt-2 text-sm opacity-75 text-neutral-300">{s.line}</p>
                {i < CREATIVE_SYSTEM_VISUALS.length - 1 && <span className="block mt-6 dept-accent font-meta" aria-hidden>↓</span>}
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={200}>
          <p className="mt-10 max-w-2xl text-sm md:text-base opacity-80 leading-relaxed">
            Your brand creates recognition. Your content creates attention. Your website creates conversion.
            Your marketing creates growth. That chain is the strategic heart of everything we ship.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ================= FEATURED WORK ================= */

function FeaturedWork() {
  const { projects } = useContent();

  const graphicCards: CardItem[] = useMemo(() => {
    // Automatically grab 7 balanced projects from Graphic Design & Brand Identity portfolio
    const graphicProjects = projects.filter(
      (p) =>
        p.dept === "brand" ||
        p.categories?.some((c) => /graphic|brand|identity|package|print|design/i.test(c))
    );
    const otherProjects = projects.filter((p) => !graphicProjects.some((gp) => gp.slug === p.slug));
    const combined = [...graphicProjects, ...otherProjects];
    const source = combined.slice(0, 7);

    return source.map((p) => ({
      id: p.id || p.slug,
      imgUrl: p.image || `/covers/${p.slug}.webp`,
      alt: `${p.title} — ${p.client}`,
      title: p.title,
      client: p.client,
      category: p.categories?.[0] || (p.dept ? p.dept.toUpperCase() : "GRAPHIC DESIGN"),
      linkUrl: `/work/${p.slug}`,
      year: p.year,
    }));
  }, [projects]);

  return (
    <section className="rule-t overflow-hidden select-none" aria-label="Featured work">
      <div className="wrap py-20 md:py-28">
        <SectionHead
          index="/selected-work"
          title={["Work that", "carries weight."]}
          meta="A curated fanned gallery from our graphic design & brand identity archive. Every project is built as a complete creative system."
        />

        <Reveal delay={100}>
          <CardFanCarousel cards={graphicCards} />
        </Reveal>

        <Reveal delay={160}>
          <div className="mt-12 md:mt-16 flex justify-center">
            <Link to="/work" className="btn btn-ghost">
              Open the complete creative archive <span className="btn-arrow" aria-hidden>→</span>
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ================= WHY ================= */

function Why() {
  return (
    <section className="rule-t" aria-label="Why Social Kon10">
      <div className="wrap py-20 md:py-28 grid lg:grid-cols-12 gap-12">
        <div className="lg:col-span-5">
          <Reveal><span className="idx">/why-us</span></Reveal>
          <h2 className="display-section mt-3"><ClipLines lines={["Strategy first.", "Always."]} /></h2>
          <Reveal delay={140}>
            <p className="mt-6 text-[var(--muted)] max-w-md leading-relaxed">
              We work with clients rather than simply handing over files. Every engagement starts with
              thinking, then creative, then measurable execution.
            </p>
            <div className="mt-8"><ArrowLink to="/about">More about the studio</ArrowLink></div>
          </Reveal>
        </div>
        <ul className="lg:col-span-7">
          {WHY_POINTS.map((w, i) => (
            <Reveal as="li" key={w.name} delay={i * 50}>
              <div className="file-row grid-cols-[48px_1fr] md:grid-cols-[64px_220px_1fr] !cursor-default">
                <span className="idx">{String(i + 1).padStart(2, "0")}</span>
                <span className="font-display text-lg md:text-2xl font-bold uppercase">{w.name}</span>
                <span className="col-span-2 md:col-span-1 text-sm text-[var(--muted)]">{w.line}</span>
              </div>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ================= PROCESS ================= */

const PROCESS_STEP_ARTIFACTS = [
  {
    n: "01",
    name: "Discover",
    line: "Understand your business.",
    artifact: "Discovery Blueprint",
    icon: (
      <svg className="w-6 h-6 opacity-80 group-hover:opacity-100 group-hover:text-[var(--dept)] transition-all" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
        <path d="M11 8v6M8 11h6" strokeLinecap="round" opacity="0.6" />
      </svg>
    ),
  },
  {
    n: "02",
    name: "Strategize",
    line: "Define the direction.",
    artifact: "Brand Matrix",
    icon: (
      <svg className="w-6 h-6 opacity-80 group-hover:opacity-100 group-hover:text-[var(--dept)] transition-all" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect width="18" height="18" x="3" y="3" rx="2" />
        <path d="M3 9h18M9 21V9" />
      </svg>
    ),
  },
  {
    n: "03",
    name: "Create",
    line: "Build the creative.",
    artifact: "Vector Craft",
    icon: (
      <svg className="w-6 h-6 opacity-80 group-hover:opacity-100 group-hover:text-[var(--dept)] transition-all" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="m18 2 4 4-12 12H6v-4L18 2z" />
        <circle cx="6" cy="18" r="2" />
      </svg>
    ),
  },
  {
    n: "04",
    name: "Refine",
    line: "Review and improve.",
    artifact: "Precision Polish",
    icon: (
      <svg className="w-6 h-6 opacity-80 group-hover:opacity-100 group-hover:text-[var(--dept)] transition-all" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        <path d="M12 2v4M12 18v4M2 12h4M18 12h4" strokeLinecap="round" opacity="0.6" />
      </svg>
    ),
  },
  {
    n: "05",
    name: "Launch",
    line: "Put it into the world.",
    artifact: "Multi-Screen Live",
    icon: (
      <svg className="w-6 h-6 opacity-80 group-hover:opacity-100 group-hover:text-[var(--dept)] transition-all" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
        <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      </svg>
    ),
  },
  {
    n: "06",
    name: "Grow",
    line: "Measure and evolve.",
    artifact: "Growth & Retention",
    icon: (
      <svg className="w-6 h-6 opacity-80 group-hover:opacity-100 group-hover:text-[var(--dept)] transition-all" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 3v18h18" />
        <path d="m19 9-5 5-4-4-3 3" />
        <path d="M19 14V9h-5" />
      </svg>
    ),
  },
];

function Process() {
  return (
    <section className="rule-t" aria-label="Process">
      <div className="wrap py-20 md:py-28">
        <SectionHead index="/process" title={["Six steps.", "No mystery."]} meta="The same disciplined path on every engagement — from a $750 logo to a full digital ecosystem." />
        <ol className="grid md:grid-cols-3 xl:grid-cols-6 gap-px" style={{ background: "var(--line)" }}>
          {PROCESS_STEP_ARTIFACTS.map((s, i) => (
            <Reveal as="li" key={s.n} delay={i * 60} className="h-full">
              <div className="group p-6 h-full min-h-[220px] flex flex-col justify-between hover:bg-[var(--dept-soft)] transition-colors" style={{ background: "var(--bg)" }}>
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-display-wide text-4xl font-bold dept-accent leading-none" aria-hidden>{s.n}</span>
                    <div className="p-2 border border-[var(--line)] bg-[var(--panel)]">
                      {s.icon}
                    </div>
                  </div>
                  <span className="font-meta text-[9px] uppercase tracking-wider text-[var(--muted)] block mt-4">{s.artifact}</span>
                </div>
                <div className="pt-6 border-t border-[var(--line)] mt-6">
                  <span className="font-display text-lg font-bold uppercase block leading-tight">{s.name}</span>
                  <span className="text-[13px] text-[var(--muted)] mt-1 block leading-snug">{s.line}</span>
                </div>
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ================= PACKAGES TEASER ================= */

function PackagesTeaser() {
  const { currency } = useShop();
  const cards = [
    {
      name: "Logo Design",
      price: 750,
      unit: "fixed",
      note: "3 concepts · 2 revisions · full files",
      to: "/design-services/logo-design-project",
      image: "/assets/package-logo-design.jpg",
      badge: "FLAGSHIP MARK",
    },
    {
      name: "Brand Identity",
      price: 2500,
      unit: "fixed",
      note: "Logo system · palette · guidelines",
      to: "/design-services/brand-identity-project",
      image: "/assets/package-brand-identity.jpg",
      badge: "COMPLETE IDENTITY",
    },
    {
      name: "Social Management",
      price: 1200,
      unit: "/mo",
      note: `Starter · Growth ${formatMoney(2200, currency)}/mo`,
      to: "/design-services/social-media-management",
      image: "/assets/package-social-management.jpg",
      badge: "CONTENT ENGINE",
    },
    {
      name: "Business Website",
      price: 3500,
      unit: "fixed",
      note: "Up to 6 pages · SEO · mobile-first",
      to: "/design-services/business-website-project",
      image: "/assets/package-business-website.jpg",
      badge: "DIGITAL HQ",
    },
  ];

  return (
    <section className="rule-t" aria-label="Packages">
      <div className="wrap py-20 md:py-28">
        <SectionHead index="/packages" title={["Priced like", "a product."]} meta="Real prices, published. Fixed packages, starting prices, custom quotes and consultations — no discovery-call ransom." />
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-px" style={{ background: "var(--line)" }}>
          {cards.map((c, i) => (
            <Reveal key={c.name} delay={i * 60} className="h-full">
              <Link to={c.to} className="group flex flex-col h-full p-6 md:p-8 hover:bg-[var(--dept-soft)] transition-colors" style={{ background: "var(--bg)" }}>
                <div className="flex items-center justify-between">
                  <span className="font-meta text-[9px] text-[var(--muted)]">{c.unit === "fixed" ? "FIXED PRICE" : "STARTING"}</span>
                  <span className="font-meta text-[8px] uppercase tracking-wider text-[var(--dept)] font-bold">{c.badge}</span>
                </div>

                {/* Visual deliverable image banner */}
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-neutral-900 border border-[var(--line)] my-4 group-hover:border-[var(--dept)] transition-colors">
                  <img
                    src={c.image}
                    alt={c.name}
                    className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent pointer-events-none" />
                </div>

                <h3 className="font-display text-xl font-bold uppercase group-hover:text-[var(--dept)] transition-colors">{c.name}</h3>
                <span className="font-display-wide text-3xl md:text-4xl font-bold mt-4">
                  {formatMoney(c.price, currency)}<span className="text-base font-meta font-normal text-[var(--muted)]">{c.unit === "fixed" ? "" : c.unit}</span>
                </span>
                <span className="text-[13px] text-[var(--muted)] mt-2 flex-1">{c.note}</span>
                <span className="font-meta text-[10px] dept-accent mt-6 transition-transform duration-200 group-hover:translate-x-1" aria-hidden>CONFIGURE →</span>
              </Link>
            </Reveal>
          ))}
        </div>
        <Reveal delay={120}>
          <div className="mt-10 flex flex-wrap items-center gap-6">
            <ArrowLink to="/packages">All packages + the configurator</ArrowLink>
            <span className="font-meta text-[9px] text-[var(--muted)]">50% deposit · balance on final approval · rush &lt;72h +25%</span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ================= TESTIMONIALS ================= */

const TESTIMONIAL_PROJECT_MAP: Record<string, { image: string; projectSlug: string }> = {
  "Oasis Events JA": { image: "/covers/oasis-music-festival.webp", projectSlug: "oasis-music-festival" },
  "Harbour & Co.": { image: "/covers/harbour-and-co.webp", projectSlug: "harbour-and-co" },
  "Peak Performance Fitness": { image: "/covers/peak-performance-fitness.webp", projectSlug: "peak-performance-fitness" },
  "Sol y Mar Resort": { image: "/covers/sol-y-mar-resort.webp", projectSlug: "sol-y-mar-resort" },
  "Coral Realty Group": { image: "/covers/coral-real-estate.webp", projectSlug: "coral-real-estate" },
  "Jamrock Eats": { image: "/covers/jamrock-eats.webp", projectSlug: "jamrock-eats" },
};

function Testimonials() {
  const { testimonials } = useContent();
  return (
    <section className="rule-t" aria-label="Testimonials">
      <div className="wrap py-20 md:py-28">
        <SectionHead index="/clients" title={["Clients on", "the record."]} />
        <div className="grid md:grid-cols-3 gap-px" style={{ background: "var(--line)" }}>
          {testimonials.slice(0, 3).map((t, i) => {
            const proj = TESTIMONIAL_PROJECT_MAP[t.company] || { image: "/covers/harbour-and-co.webp", projectSlug: "harbour-and-co" };
            return (
              <Reveal key={t.company} delay={i * 80} className="h-full">
                <figure className="group p-6 md:p-8 h-full flex flex-col hover:bg-[var(--dept-soft)] transition-colors" style={{ background: "var(--bg)" }}>
                  {/* Client project visual result */}
                  <div className="relative aspect-[16/9] w-full overflow-hidden bg-neutral-900 border border-[var(--line)] mb-5 group-hover:border-[var(--dept)] transition-colors">
                    <img
                      src={proj.image}
                      alt={`${t.company} project`}
                      className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
                    <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-white/90">
                      <span className="font-meta text-[8px] uppercase tracking-wider bg-black/60 px-2 py-0.5 border border-white/10">
                        VERIFIED OUTCOME
                      </span>
                      <span className="font-meta text-[9px] text-white/80">{t.company}</span>
                    </div>
                  </div>

                  <blockquote className="text-[15px] leading-relaxed flex-1">“{t.quote}”</blockquote>
                  <figcaption className="mt-6 pt-4 rule-t">
                    <span className="font-display text-sm font-bold uppercase block">{t.name}</span>
                    <span className="font-meta text-[9px] text-[var(--muted)]">{t.company}</span>
                  </figcaption>
                </figure>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ================= PAGE ================= */

export default function Home() {
  const { faqs, home } = useContent();
  useSEO({
    title: "Social Kon10 Marketing — Branding, Social Media & Websites | Kingston, Jamaica",
    description: "Creative growth agency in Kingston, Jamaica. Graphic design & branding, social media management & marketing, website design & development. Published prices, real packages.",
    path: "/",
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": [
        { ...ORGANIZATION_LD, "@id": "https://socialkon10.com/#org" },
        LOCAL_BUSINESS_LD,
        faqLd(faqs.filter((f) => f.dept === "checkout").slice(0, 3)),
      ],
    },
  });

  const show = (key: string) => home.sections[key] !== false;

  return (
    <>
      <Hero />
      <Marquee items={home.marquee} />
      {show("departments") && <DepartmentsIndex />}
      {show("creativeSystem") && <CreativeSystem />}
      {show("featuredWork") && <FeaturedWork />}
      {show("why") && <Why />}
      {show("process") && <Process />}
      {show("packages") && <PackagesTeaser />}
      {show("testimonials") && <Testimonials />}
      {show("faq") && (
        <section className="rule-t" aria-label="Frequently asked questions">
          <div className="wrap py-20 md:py-28 grid lg:grid-cols-12 gap-8 lg:gap-12">
            <div className="lg:col-span-5 overflow-visible">
              <Reveal><span className="idx">/faq</span></Reveal>
              <h2 className="display-section mt-3 overflow-visible pr-2"><ClipLines lines={["Straight", "answers."]} /></h2>
              <Reveal delay={120}>
                <p className="mt-6 text-sm text-[var(--muted)] max-w-sm">Payment, revisions, timelines and ownership — the questions every client asks before they sign.</p>
                <div className="mt-6"><ArrowLink to={`mailto:${CONTACT.email}`}>Ask something else</ArrowLink></div>
              </Reveal>
            </div>
            <div className="lg:col-span-7">
              <Faq items={faqs.filter((f) => f.dept === "checkout")} />
            </div>
          </div>
        </section>
      )}
      <MouseFlyIn />
      <FinalCta />
    </>
  );
}
