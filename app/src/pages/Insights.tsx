import { useState } from "react";
import { Link } from "react-router-dom";
import { INSIGHTS } from "../lib/data";
import { useDepartment } from "../lib/dept";
import { useSEO } from "../lib/seo";
import { Reveal, ShuffleText } from "../lib/motion";
import { FinalCta } from "../components/blocks";

const CATS = ["ALL", "Branding", "Social Media", "Marketing", "Web Design", "Business Growth", "Events"];

export default function Insights() {
  useDepartment(null);
  const [cat, setCat] = useState("ALL");
  const [hover, setHover] = useState<string | null>(null);
  useSEO({
    title: "Insights — Social Kon10 Marketing",
    description: "Branding, social media, marketing and web design thinking from Social Kon10 — written for Caribbean businesses ready to grow.",
    path: "/insights",
  });

  const posts = INSIGHTS.filter((p) => cat === "ALL" || p.category === cat);

  return (
    <>
      <section className="wrap pt-14 md:pt-20 pb-24">
        <Reveal>
          <div className="flex justify-between font-meta text-[10px] text-[var(--muted)]">
            <span className="idx">/insights</span>
            <span>{posts.length} articles</span>
          </div>
        </Reveal>
        <h1 className="display-hero mt-6 max-w-[12ch]">Thinking, published.</h1>
        <Reveal delay={180}>
          <p className="mt-6 max-w-xl text-[var(--muted)]">People-first content on branding, social media and websites — including what things actually cost and how to prepare for them.</p>
        </Reveal>

        <Reveal delay={240}>
          <div className="mt-10 flex flex-wrap gap-2" role="group" aria-label="Filter articles">
            {CATS.map((c) => (
              <button key={c} onClick={() => setCat(c)} aria-pressed={cat === c}
                className="font-meta text-[10px] px-3 py-1.5 border transition-colors"
                style={cat === c ? { background: "var(--dept)", borderColor: "var(--dept)", color: "var(--on-dept)" } : { borderColor: "var(--line)" }}>
                {c.toUpperCase()}
              </button>
            ))}
          </div>
        </Reveal>

        <div className="mt-12">
          {posts.map((p, i) => (
            <Reveal key={p.slug} delay={i * 40}>
              <Link
                to={`/insights/${p.slug}`}
                className="file-row grid-cols-[auto_1fr_auto] md:grid-cols-[140px_1fr_auto_auto] block"
                onMouseEnter={() => setHover(p.slug)}
                onMouseLeave={() => setHover(null)}
              >
                <span className="idx">{p.category.toUpperCase()}</span>
                <h2 className="font-display text-xl md:text-3xl font-bold uppercase leading-tight">
                  <ShuffleText text={p.title} play={hover === p.slug} />
                </h2>
                <span className="hidden md:block font-meta text-[9px] text-[var(--muted)]">{p.minutes} min read</span>
                <span className="font-meta text-[10px] dept-accent" aria-hidden>READ →</span>
                <p className="col-span-full md:col-span-3 md:col-start-2 text-sm text-[var(--muted)] max-w-2xl -mt-1">{p.excerpt}</p>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>
      <FinalCta />
    </>
  );
}
