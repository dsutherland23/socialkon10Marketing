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

      {/* ── ABOUT ME / FOUNDER & CREATIVE DIRECTOR ── */}
      <section className="rule-t" aria-labelledby="about-me-heading">
        <div className="wrap py-20 md:py-28">
          <SectionHead
            index="/about-me"
            title={["Founder &", "Creative Director."]}
            meta="The vision and craft driving SocialKon10 Agency."
          />

          <div className="mt-12 grid lg:grid-cols-12 gap-10 xl:gap-14 items-start">
            {/* Left: Portrait Card & Disciplines */}
            <Reveal className="lg:col-span-5">
              <div
                className="border border-[var(--line)] p-4 sm:p-5 relative group"
                style={{ background: "var(--panel)" }}
              >
                <div className="relative aspect-[4/5] overflow-hidden bg-neutral-900 border border-[var(--line)]">
                  <img
                    src="/assets/daan-sutherland.jpg"
                    alt="Daan Sutherland — Founder & Creative Director, SocialKon10 Agency"
                    className="w-full h-full object-cover object-top filter grayscale contrast-105 group-hover:grayscale-0 transition-all duration-700 ease-out"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent pointer-events-none" />
                  <div className="absolute bottom-4 left-4 right-4 text-white">
                    <span className="font-meta text-[9px] uppercase tracking-widest text-[var(--dept)] font-bold block">
                      Founder & Creative Director
                    </span>
                    <h3 className="font-display text-2xl font-bold uppercase tracking-wide mt-0.5">
                      Daan Sutherland
                    </h3>
                    <p className="font-meta text-[10px] text-neutral-300 mt-0.5">
                      SocialKon10 Agency
                    </p>
                  </div>
                </div>

                {/* Core Disciplines Badges */}
                <div className="mt-5 pt-4 border-t border-[var(--line)]">
                  <span className="font-meta text-[9px] text-[var(--muted)] uppercase tracking-wider block mb-2.5">
                    Disciplines & Expertise
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      "Graphic Design",
                      "Website Development",
                      "Brand Strategy",
                      "Social Media Marketing",
                      "Video Production",
                      "Studio Engineering",
                      "Printing Solutions",
                    ].map((badge) => (
                      <span
                        key={badge}
                        className="font-meta text-[9px] uppercase px-2.5 py-1 border border-[var(--line)] text-[var(--ink)] font-medium"
                        style={{ background: "var(--bg)" }}
                      >
                        {badge}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Direct Action */}
                <div className="mt-5 pt-4 border-t border-[var(--line)] flex flex-wrap gap-2">
                  <Link
                    to="/start?intent=consultation"
                    className="btn btn-dept !py-2.5 !px-4 text-xs font-bold uppercase"
                  >
                    Book Consultation <span className="btn-arrow" aria-hidden>→</span>
                  </Link>
                  <a
                    href="https://wa.me/18764024849?text=Hi%20Daan,%20I'd%20like%20to%20connect%20with%20SocialKon10%20Agency."
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost !py-2.5 !px-4 text-xs font-bold uppercase"
                  >
                    WhatsApp
                  </a>
                </div>
              </div>
            </Reveal>

            {/* Right: Bio & Philosophy */}
            <Reveal delay={140} className="lg:col-span-7">
              <div className="space-y-6">
                <div>
                  <span className="idx">/about-me</span>
                  <h2
                    id="about-me-heading"
                    className="font-display text-3xl sm:text-4xl lg:text-5xl font-black uppercase tracking-tight mt-2"
                  >
                    Daan Sutherland
                  </h2>
                  <p className="font-meta text-xs sm:text-sm font-bold uppercase text-[var(--dept)] tracking-wider mt-2">
                    Founder & Creative Director, SocialKon10 Agency
                  </p>
                </div>

                <div className="space-y-5 text-base sm:text-lg leading-relaxed text-[var(--ink)]">
                  <p className="text-lg sm:text-xl font-medium leading-relaxed">
                    I’m Daan Sutherland, a creative entrepreneur, designer, and marketing professional with a passion for turning ideas into powerful visual experiences.
                  </p>

                  <p className="text-[var(--muted)] leading-relaxed">
                    As the founder of SocialKon10 Agency, I’ve built a creative company focused on helping businesses, brands, artists, and organizations stand out through graphic design, Website, branding, social media marketing &amp; management, video production, studio engineering, and printing solutions.
                  </p>

                  <p className="text-[var(--muted)] leading-relaxed">
                    My approach is simple: create work that looks great, communicates clearly, and delivers purpose. I believe good design is more than just making something visually appealing—it’s about understanding the story, the audience, and the goal behind every project.
                  </p>

                  <p className="text-[var(--muted)] leading-relaxed">
                    Over the years, my work has allowed me to collaborate across different industries and creative spaces, constantly pushing me to learn, experiment, and find new ways to bring ideas to life.
                  </p>

                  <p className="text-[var(--muted)] leading-relaxed">
                    SocialKon10 is more than an agency to me—it’s a reflection of creativity, innovation, and the belief that every brand has a story worth telling.
                  </p>
                </div>

                {/* ── My Philosophy Card ── */}
                <div
                  className="mt-8 p-6 sm:p-8 border-l-4 border-[var(--dept)] border-y border-r border-[var(--line)] shadow-sm"
                  style={{ background: "var(--panel)" }}
                >
                  <span className="font-meta text-[10px] text-[var(--muted)] uppercase tracking-widest block font-bold">
                    My Philosophy
                  </span>
                  <h3 className="font-display-wide text-2xl sm:text-3xl font-black uppercase tracking-tight text-[var(--ink)] mt-2">
                    Create. Innovate. Elevate.
                  </h3>
                  <p className="mt-3 text-sm sm:text-base text-[var(--muted)] leading-relaxed italic">
                    “I’m always looking for the next idea, the next challenge, and the next opportunity to create something meaningful.”
                  </p>
                  <span className="font-meta text-[9px] uppercase tracking-wider text-[var(--dept)] font-bold block mt-4">
                    — Daan Sutherland
                  </span>
                </div>
              </div>
            </Reveal>
          </div>
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
