import { Link } from "react-router-dom";
import { CONTACT, CREATIVE_SYSTEM, DEPARTMENTS, WHY_POINTS } from "../lib/data";
import { useDepartment } from "../lib/dept";
import { useSEO } from "../lib/seo";
import { Reveal } from "../lib/motion";
import { FinalCta, SectionHead } from "../components/blocks";
import { CaribbeanHeroWords } from "../components/ui/caribbean-hero-words";

export default function About() {
  useDepartment(null);
  useSEO({
    title: "About — Social Kon10 Marketing | Kingston, Jamaica",
    description: "Social Kon10 Marketing is a creative growth agency in Kingston, Jamaica — Caribbean-rooted, globally competitive. Strategy + creative + digital + marketing.",
    path: "/about",
  });

  return (
    <>
      <section className="wrap pt-14 md:pt-20 pb-20">
        <Reveal>
          <div className="flex justify-between font-meta text-[10px] text-[var(--muted)]">
            <span className="idx">/about</span>
            <span>{CONTACT.location}</span>
          </div>
        </Reveal>

        <div className="mt-6">
          <CaribbeanHeroWords />
        </div>
        <div className="mt-12 grid lg:grid-cols-12 gap-10">
          <Reveal delay={120} className="lg:col-span-7">
            <p className="text-lg md:text-xl leading-relaxed max-w-2xl">
              Social Kon10 Marketing is a creative growth agency. We create brands, content and digital
              experiences that connect, convert and grow businesses — as one system, not three vendors.
            </p>
            <p className="mt-6 text-[var(--muted)] leading-relaxed max-w-2xl">
              We don't believe branding, social media and websites should operate separately. Your brand
              creates recognition, your content creates attention, your website creates conversion and your
              marketing creates growth. Our three departments share one team, one standard and one process —
              each with its own craft.
            </p>
          </Reveal>
          <Reveal delay={200} className="lg:col-span-5">
            <dl className="border border-[var(--line)]" style={{ background: "var(--panel)" }}>
              {[["Based in", "Kingston, Jamaica"], ["Serving", "The Caribbean & beyond"], ["Departments", "Brand · Social · Web"], ["Contact", CONTACT.email], ["Phone", CONTACT.phone]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 px-6 py-4 border-b border-[var(--line)] last:border-b-0">
                  <dt className="font-meta text-[10px] text-[var(--muted)]">{k}</dt>
                  <dd className="font-display text-sm font-bold uppercase text-right">{v}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </section>

      <section className="rule-t">
        <div className="wrap py-20 md:py-28">
          <SectionHead index="/departments" title={["One studio,", "three crafts."]} />
          <div className="grid md:grid-cols-3 gap-px" style={{ background: "var(--line)" }}>
            {DEPARTMENTS.map((d, i) => (
              <Reveal key={d.id} delay={i * 80} className="h-full">
                <Link to={d.path} className="group block h-full p-8 hover:bg-[var(--dept-soft)] transition-colors" style={{ background: "var(--bg)" }}>
                  <span className="idx">{d.index}</span>
                  <h3 className="font-display text-2xl font-bold uppercase mt-4 group-hover:text-[var(--dept)] transition-colors">{d.name}</h3>
                  <p className="text-sm text-[var(--muted)] mt-3 leading-relaxed">{d.sub}</p>
                  <span className="font-meta text-[10px] dept-accent inline-block mt-6 transition-transform duration-200 group-hover:translate-x-1" aria-hidden>ENTER →</span>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="rule-t" style={{ background: "var(--ink)", color: "var(--bg)" }}>
        <div className="wrap py-20 md:py-28">
          <SectionHead index="/how-we-think" title={["The creative", "system."]} meta="The chain every engagement is built on." />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 font-display-wide text-2xl md:text-4xl font-bold uppercase">
            {CREATIVE_SYSTEM.map((s, i) => (
              <Reveal key={s.name} delay={i * 60}>
                <span className="flex items-center gap-4">
                  <span>{s.name}</span>
                  {i < CREATIVE_SYSTEM.length - 1 && <span className="dept-accent" aria-hidden>→</span>}
                </span>
              </Reveal>
            ))}
          </div>
          <div className="mt-14 grid md:grid-cols-5 gap-px" style={{ background: "rgba(128,128,128,0.3)" }}>
            {WHY_POINTS.map((w, i) => (
              <Reveal key={w.name} delay={i * 50} className="h-full">
                <div className="p-5 h-full" style={{ background: "var(--ink)" }}>
                  <span className="idx">{String(i + 1).padStart(2, "0")}</span>
                  <p className="font-display text-base font-bold uppercase mt-3">{w.name}</p>
                  <p className="text-[12.5px] opacity-70 mt-1.5">{w.line}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      <FinalCta />
    </>
  );
}
