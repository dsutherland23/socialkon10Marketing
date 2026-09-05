import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useContent } from "../lib/content";
import { useDepartment } from "../lib/dept";
import { useSEO } from "../lib/seo";
import { ClipLines, Reveal } from "../lib/motion";
import { ArrowLink, FinalCta } from "../components/blocks";
import { ProjectCover } from "../components/cover";
import { LiveCover } from "../components/LiveCover";
import { LiveWindow } from "../components/LiveWindow";

/* ------------------------------------------------------------------
   CASE STUDY (PRD §22)
   01 Challenge → 02 Strategy → 03 Creative → 04 Execution → 05 Result.
   Metrics are never fabricated — results copy says when figures are
   shared privately.
------------------------------------------------------------------- */

export default function ProjectPage() {
  const { slug } = useParams();
  const { projects } = useContent();
  const [previewOpen, setPreviewOpen] = useState(false);
  const project = slug ? projects.find((p) => p.slug === slug) : undefined;
  useDepartment(project?.dept ?? null);

  useSEO({
    title: project ? `${project.title} — Case Study | Social Kon10` : "Case Study — Social Kon10",
    description: project?.summary ?? "",
    path: project ? `/work/${project.slug}` : undefined,
    jsonLd: project && {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: `${project.title} — Case Study`,
      about: project.services.join(", "),
      author: { "@id": "https://socialkon10.com/#org" },
    },
  });

  if (!project) return <Navigate to="/work" replace />;

  const idx = projects.findIndex((p) => p.slug === project.slug);
  const next = projects[(idx + 1) % projects.length];
  const chapters = [
    { n: "01", name: "The Challenge", body: project.caseStudy.challenge },
    { n: "02", name: "The Strategy", body: project.caseStudy.strategy },
    { n: "03", name: "The Creative", body: project.caseStudy.creative },
    { n: "04", name: "The Execution", body: project.caseStudy.execution },
    { n: "05", name: "The Result", body: project.caseStudy.result },
  ];

  return (
    <>
      {/* project header */}
      <section className="rule-b">
        <div className="wrap pt-14 md:pt-20 pb-14">
          <Reveal>
            <div className="flex flex-wrap justify-between gap-3 font-meta text-[10px] text-[var(--muted)]">
              <Link to="/work" className="u-line">← /work</Link>
              <span className="idx">/PROJECT_{project.id}</span>
            </div>
          </Reveal>
          <h1 className="display-hero mt-8 max-w-[14ch]">
            <ClipLines lines={[project.title]} />
          </h1>
          <Reveal delay={200}>
            <dl className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl">
              {[["Client", project.client], ["Industry", project.industry], ["Year", project.year], ["Disciplines", project.categories.join(" · ")]].map(([k, v]) => (
                <div key={k}>
                  <dt className="font-meta text-[9px] text-[var(--muted)]">{k}</dt>
                  <dd className="font-display text-sm font-semibold uppercase mt-1.5">{v}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
        {/* full-bleed cover — a miniature live render when the project ships a URL */}
        <Reveal>
          <div className="media-frame aspect-[16/8] max-h-[70vh]">
            {project.liveUrl ? (
              <LiveCover
                url={project.liveUrl}
                title={project.title}
                seed={project.coverSeed}
                hue={project.hue}
                image={project.image}
                onOpen={() => setPreviewOpen(true)}
              />
            ) : (
              <ProjectCover seed={project.coverSeed} hue={project.hue} title={project.title} image={project.image} fit={project.imageFit ?? "contain"} className="!h-full" />
            )}
          </div>
        </Reveal>
      </section>

      {/* chapters — asymmetric: sticky index left, narrative right */}
      <section className="wrap py-20 md:py-28">
        <div className="grid lg:grid-cols-12 gap-10">
          <div className="lg:col-span-3">
            <div className="lg:sticky lg:top-28">
              <span className="idx">/case-study</span>
              <p className="font-meta text-[10px] text-[var(--muted)] mt-3 leading-relaxed">
                Services: {project.services.join(" · ")}
              </p>
              <div className="mt-8"><ArrowLink to={`/start?intent=quote`}>Start something similar</ArrowLink></div>
              {project.liveUrl && (
                <button className="btn btn-ghost mt-6 w-full justify-center" onClick={() => setPreviewOpen(true)}>
                  Live preview <span className="btn-arrow" aria-hidden>→</span>
                </button>
              )}
            </div>
          </div>
          <div className="lg:col-span-8 lg:col-start-5">
            {chapters.map((c, i) => (
              <Reveal key={c.n} delay={i === 0 ? 0 : 40}>
                <article className="grid md:grid-cols-[90px_1fr] gap-6 py-10 rule-t first:border-t-0 first:pt-0">
                  <span className="font-display-wide text-4xl font-bold dept-accent" aria-hidden>{c.n}</span>
                  <div>
                    <h2 className="font-display text-xl md:text-2xl font-bold uppercase">{c.name}</h2>
                    <p className="mt-4 text-[15px] md:text-base text-[var(--muted)] leading-relaxed max-w-2xl">{c.body}</p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* next project */}
      <Link to={`/work/${next.slug}`} className="group block rule-t" style={{ background: "var(--ink)", color: "var(--bg)" }}>
        <div className="wrap py-16 md:py-20 flex flex-wrap items-center justify-between gap-6">
          <div>
            <span className="font-meta text-[10px] opacity-60">Next file</span>
            <span className="font-display-wide block text-3xl md:text-5xl font-bold uppercase mt-2 group-hover:text-[var(--dept)] transition-colors">{next.title}</span>
          </div>
          <span className="font-meta text-sm transition-transform duration-200 group-hover:translate-x-2" aria-hidden>→</span>
        </div>
      </Link>
      <FinalCta />
      {previewOpen && project.liveUrl && (
        <LiveWindow url={project.liveUrl} title={project.title} onClose={() => setPreviewOpen(false)} />
      )}
    </>
  );
}
