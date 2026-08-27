import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  CONTACT, CREATIVE_SYSTEM, DEPARTMENTS, PROCESS_STEPS,   WHY_POINTS, formatMoney, type DeptId,
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

          {/* Right: 3D Scroll Picture Reel Stack feeding from Graphic Portfolio */}
          <div className="lg:col-span-5 flex items-center justify-center relative w-full pt-4 lg:pt-0">
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
        <div>
          {DEPARTMENTS.map((d, i) => (
            <Reveal key={d.id} delay={i * 60}>
              <Link
                to={d.path}
                className="file-row grid-cols-[auto_1fr_auto] md:grid-cols-[80px_1fr_auto_auto]"
                onMouseEnter={() => setHover(d.id)}
                onMouseLeave={() => setHover(null)}
              >
                <span className="idx">{d.index}</span>
                <span className="font-display text-2xl md:text-4xl font-bold uppercase leading-none">
                  <ShuffleText text={d.name} play={hover === d.id} />
                </span>
                <span className="hidden md:block font-meta text-[10px] text-[var(--muted)]">
                  {d.personality.join(" · ")}
                </span>
                <span className="font-meta text-sm dept-accent" aria-hidden>→</span>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ================= CREATIVE SYSTEM ================= */

function CreativeSystem() {
  return (
    <section className="rule-t" style={{ background: "var(--ink)", color: "var(--bg)" }} aria-label="The Social Kon10 creative system">
      <div className="wrap py-20 md:py-28">
        <Reveal><span className="idx">/the-creative-system</span></Reveal>
        <h2 className="display-section mt-3 max-w-[16ch]">
          <ClipLines lines={["Branding, social and websites", "should not operate separately."]} />
        </h2>
        <div className="mt-14 grid gap-px md:grid-cols-4" style={{ background: "rgba(128,128,128,0.3)" }}>
          {CREATIVE_SYSTEM.map((s, i) => (
            <Reveal key={s.name} delay={i * 80} className="h-full">
              <div className="p-6 md:p-8 h-full" style={{ background: "var(--ink)" }}>
                <span className="idx">{String(i + 1).padStart(2, "0")}</span>
                <p className="font-display-wide text-2xl md:text-3xl font-bold uppercase mt-4">{s.name}</p>
                <p className="mt-2 text-sm opacity-70">{s.line}</p>
                {i < CREATIVE_SYSTEM.length - 1 && <span className="block mt-6 dept-accent font-meta" aria-hidden>↓</span>}
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
    <section className="rule-t overflow-x-clip select-none" aria-label="Featured work">
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

function Process() {
  return (
    <section className="rule-t" aria-label="Process">
      <div className="wrap py-20 md:py-28">
        <SectionHead index="/process" title={["Six steps.", "No mystery."]} meta="The same disciplined path on every engagement — from a $750 logo to a full digital ecosystem." />
        <ol className="grid md:grid-cols-3 xl:grid-cols-6 gap-px" style={{ background: "var(--line)" }}>
          {PROCESS_STEPS.map((s, i) => (
            <Reveal as="li" key={s.n} delay={i * 60} className="h-full">
              <div className="p-6 h-full min-h-[180px] flex flex-col" style={{ background: "var(--bg)" }}>
                <span className="font-display-wide text-4xl font-bold dept-accent" aria-hidden>{s.n}</span>
                <span className="font-display text-lg font-bold uppercase mt-auto pt-6">{s.name}</span>
                <span className="text-[13px] text-[var(--muted)] mt-1">{s.line}</span>
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
    { name: "Logo Design", price: 750, unit: "fixed", note: "3 concepts · 2 revisions · full files", to: "/services/logo-design" },
    { name: "Brand Identity", price: 2500, unit: "fixed", note: "Logo system · palette · guidelines", to: "/services/brand-identity" },
    { name: "Social Management", price: 1200, unit: "/mo", note: `Starter · Growth ${formatMoney(2200, currency)}/mo`, to: "/services/social-media-management" },
    { name: "Business Website", price: 3500, unit: "fixed", note: "Up to 6 pages · SEO · mobile-first", to: "/services/business-website" },
  ];
  return (
    <section className="rule-t" aria-label="Packages">
      <div className="wrap py-20 md:py-28">
        <SectionHead index="/packages" title={["Priced like", "a product."]} meta="Real prices, published. Fixed packages, starting prices, custom quotes and consultations — no discovery-call ransom." />
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-px" style={{ background: "var(--line)" }}>
          {cards.map((c, i) => (
            <Reveal key={c.name} delay={i * 60} className="h-full">
              <Link to={c.to} className="group flex flex-col h-full p-6 md:p-8 hover:bg-[var(--dept-soft)] transition-colors" style={{ background: "var(--bg)" }}>
                <span className="font-meta text-[9px] text-[var(--muted)]">{c.unit === "fixed" ? "FIXED PRICE" : "STARTING"}</span>
                <h3 className="font-display text-xl font-bold uppercase mt-3 group-hover:text-[var(--dept)] transition-colors">{c.name}</h3>
                <span className="font-display-wide text-3xl md:text-4xl font-bold mt-6">
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

function Testimonials() {
  const { testimonials } = useContent();
  return (
    <section className="rule-t" aria-label="Testimonials">
      <div className="wrap py-20 md:py-28">
        <SectionHead index="/clients" title={["Clients on", "the record."]} />
        <div className="grid md:grid-cols-3 gap-px" style={{ background: "var(--line)" }}>
          {testimonials.slice(0, 3).map((t, i) => (
            <Reveal key={t.company} delay={i * 80} className="h-full">
              <figure className="p-6 md:p-8 h-full flex flex-col" style={{ background: "var(--bg)" }}>
                <blockquote className="text-[15px] leading-relaxed flex-1">“{t.quote}”</blockquote>
                <figcaption className="mt-6 pt-4 rule-t">
                  <span className="font-display text-sm font-bold uppercase block">{t.name}</span>
                  <span className="font-meta text-[9px] text-[var(--muted)]">{t.company}</span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
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
