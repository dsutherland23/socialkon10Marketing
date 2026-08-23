import { Link, useParams } from "react-router-dom";
import { INSIGHTS } from "../lib/data";
import { useDepartment } from "../lib/dept";
import { useSEO, breadcrumbLd, ORGANIZATION_LD } from "../lib/seo";
import { Reveal } from "../lib/motion";
import { FinalCta } from "../components/blocks";
import NotFound from "./NotFound";

/* ------------------------------------------------------------------
   INSIGHT ARTICLE (PRD §57) — people-first content with Article
   structured data (PRD §55).
-------------------------------------------------------------------- */

export default function InsightArticle() {
  useDepartment(null);
  const { slug } = useParams();
  const post = INSIGHTS.find((p) => p.slug === slug);

  useSEO({
    title: post ? `${post.title} — Social Kon10 Marketing` : "Insights — Social Kon10 Marketing",
    description: post?.excerpt ?? "Insights from Social Kon10 Marketing.",
    path: `/insights/${slug ?? ""}`,
    jsonLd: post && {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Article",
          headline: post.title,
          description: post.excerpt,
          datePublished: post.date,
          author: ORGANIZATION_LD,
          publisher: ORGANIZATION_LD,
          articleSection: post.category,
        },
        breadcrumbLd([
          { name: "Home", path: "/" },
          { name: "Insights", path: "/insights" },
          { name: post.title, path: `/insights/${post.slug}` },
        ]),
      ],
    },
  });

  if (!post) return <NotFound />;

  const others = INSIGHTS.filter((p) => p.slug !== post.slug).slice(0, 3);

  return (
    <>
      <article className="wrap pt-14 md:pt-20 pb-24 max-w-3xl">
        <Reveal>
          <nav className="flex justify-between font-meta text-[10px] text-[var(--muted)]" aria-label="Breadcrumb">
            <span><Link to="/insights" className="u-line">/insights</Link> <span aria-hidden>→</span> {post.category.toUpperCase()}</span>
            <span>{post.minutes} min read</span>
          </nav>
        </Reveal>
        <h1 className="display-section mt-8 max-w-[18ch]">{post.title}</h1>
        <Reveal delay={120}>
          <p className="font-meta text-[10px] text-[var(--muted)] mt-6">
            {new Date(post.date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} · Social Kon10 Marketing
          </p>
        </Reveal>

        <Reveal delay={180}>
          <div className="mt-12 flex flex-col gap-6 text-[15px] leading-relaxed">
            {post.body.map((para, i) =>
              para.startsWith("## ") ? (
                <h2 key={i} className="font-display text-2xl font-bold uppercase mt-6">{para.slice(3)}</h2>
              ) : (
                <p key={i} className={i === 0 ? "text-lg" : "text-[var(--muted)]"}>{para}</p>
              )
            )}
          </div>
        </Reveal>

        <Reveal delay={220}>
          <div className="mt-16 border border-[var(--line-strong)] p-8" style={{ background: "var(--panel)" }}>
            <span className="idx">/work-with-us</span>
            <p className="font-display text-xl font-bold uppercase mt-3">Reading is step one. Building is step two.</p>
            <div className="mt-5 flex flex-wrap gap-4">
              <Link to="/start" className="btn btn-fill">Start a project <span className="btn-arrow" aria-hidden>→</span></Link>
              <Link to="/packages" className="btn btn-ghost">Browse packages</Link>
            </div>
          </div>
        </Reveal>

        <div className="mt-16">
          <span className="idx">/keep-reading</span>
          <div className="mt-4 flex flex-col">
            {others.map((p) => (
              <Link key={p.slug} to={`/insights/${p.slug}`} className="file-row grid-cols-[1fr_auto]">
                <span className="font-display text-lg font-bold uppercase">{p.title}</span>
                <span className="font-meta text-[10px] dept-accent" aria-hidden>READ →</span>
              </Link>
            ))}
          </div>
        </div>
      </article>
      <FinalCta />
    </>
  );
}
