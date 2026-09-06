import { useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useContent } from "../lib/content";
import { useDepartment } from "../lib/dept";
import { useSEO } from "../lib/seo";
import { ClipLines, Reveal } from "../lib/motion";
import { ArrowLink, FinalCta } from "../components/blocks";
import { ProjectCover } from "../components/cover";
import { LiveCover } from "../components/LiveCover";
import { LiveWindow } from "../components/LiveWindow";
import { ArtworkLightbox } from "../components/ArtworkLightbox";

/* ------------------------------------------------------------------
   CASE STUDY & GRAPHIC ARTWORK SHOWCASE (2026 Best Practice)
   • Authentic aspect ratio studio stage (no slice-clipping of artwork)
   • Interactive 2026 Studio Lightbox (pan, zoom, fullscreen)
   • Visual deliverables & brand palette system
   • 01 Challenge → 02 Strategy → 03 Creative → 04 Execution → 05 Result
------------------------------------------------------------------- */

export default function ProjectPage() {
  const { slug } = useParams();
  const { projects } = useContent();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

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
    { n: "03", name: "The Creative Approach", body: project.caseStudy.creative },
    { n: "04", name: "Execution & Rollout", body: project.caseStudy.execution },
    { n: "05", name: "The Measurable Result", body: project.caseStudy.result },
  ];

  // Palette derived from project brand theme
  const brandPalette = useMemo(() => {
    const h = project.hue || 210;
    return [
      { name: "Primary Brand", hex: `hsl(${h}, 85%, 52%)`, label: "Core Identity" },
      { name: "Accent Energy", hex: `hsl(${(h + 40) % 360}, 92%, 58%)`, label: "Callouts / UI" },
      { name: "Support Contrast", hex: `hsl(${(h + 180) % 360}, 75%, 48%)`, label: "Secondary" },
      { name: "Studio Charcoal", hex: `hsl(${h}, 35%, 12%)`, label: "Typography / Base" },
      { name: "Gallery White", hex: `hsl(${h}, 15%, 96%)`, label: "Clean Canvas" },
    ];
  }, [project.hue]);

  const allArtworkAssets = useMemo(() => {
    const list: { url: string; title: string; subtitle: string }[] = [];
    if (project.image) {
      list.push({
        url: project.image,
        title: "Master Artwork & Hero Identity",
        subtitle: `${project.title} • Primary Creative Exhibit`,
      });
    }
    if (Array.isArray(project.gallery)) {
      project.gallery.forEach((url, i) => {
        if (url && url !== project.image) {
          list.push({
            url,
            title: `Deliverable Asset 0${i + 2}`,
            subtitle: "Secondary Application & Rollout Detail",
          });
        }
      });
    }
    return list;
  }, [project.image, project.gallery, project.title]);

  const isWebWithLiveUrl = Boolean(project.liveUrl);

  return (
    <>
      {/* project header */}
      <section className="rule-b">
        <div className="wrap pt-14 md:pt-20 pb-12">
          <Reveal>
            <div className="flex flex-wrap justify-between gap-3 font-meta text-[10px] text-[var(--muted)]">
              <Link to="/work" className="u-line">← /work (The Creative Archive)</Link>
              <span className="idx">/PROJECT_{project.id}</span>
            </div>
          </Reveal>
          <h1 className="display-hero mt-8 max-w-[14ch]">
            <ClipLines lines={[project.title]} />
          </h1>
          <Reveal delay={200}>
            <dl className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl">
              {[
                ["Client", project.client || "Studio Project"],
                ["Industry", project.industry || "Creative & Commerce"],
                ["Year", project.year || "2026"],
                ["Disciplines", project.categories.join(" · ")],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="font-meta text-[9px] text-[var(--muted)]">{k}</dt>
                  <dd className="font-display text-sm font-semibold uppercase mt-1.5">{v}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>

        {/* 2026 STAGE SHOWCASE: WEB LIVE EMBED vs. GRAPHIC ARTWORK STUDIO STAGE */}
        <Reveal>
          {isWebWithLiveUrl ? (
            /* Live Interactive Website Frame */
            <div className="media-frame aspect-[16/8] max-h-[70vh]">
              <LiveCover
                url={project.liveUrl!}
                title={project.title}
                seed={project.coverSeed}
                hue={project.hue}
                image={project.image}
                onOpen={() => setPreviewOpen(true)}
              />
            </div>
          ) : (
            /* 2026 Studio Artwork Stage — Preserves 100% full design without slice-cropping */
            <div
              className="relative w-full overflow-hidden border-y border-[var(--line-strong)] flex flex-col items-center justify-center py-10 md:py-16 px-4 sm:px-8 group"
              style={{
                background: `radial-gradient(ellipse at center, hsl(${project.hue} 45% 10%) 0%, hsl(${project.hue} 50% 4%) 75%)`,
              }}
            >
              {/* Background ambient lighting */}
              <div
                className="absolute inset-0 pointer-events-none opacity-25 blur-3xl"
                style={{
                  background: `radial-gradient(circle at center, hsl(${project.hue} 85% 50%) 0%, transparent 60%)`,
                }}
                aria-hidden="true"
              />

              {/* Artwork Hero Matting Container */}
              <div
                className="relative z-10 max-w-4xl w-full flex flex-col items-center cursor-zoom-in"
                onClick={() => setLightboxIndex(0)}
                title="Click to inspect artwork in high-resolution studio lightbox"
              >
                {project.image ? (
                  <div className="relative group/art rounded-xl overflow-hidden shadow-2xl border border-white/15 bg-black/40 transition-transform duration-500 ease-out group-hover/art:scale-[1.01] max-h-[72vh] flex items-center justify-center">
                    <img
                      src={project.image}
                      alt={`${project.title} master visual`}
                      className="max-h-[70vh] w-auto max-w-full object-contain drop-shadow-2xl"
                      loading="eager"
                      decoding="async"
                    />
                    {/* Hover Inspect Overlay */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/art:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-2 backdrop-blur-[2px]">
                      <span className="btn btn-dept !py-2 !px-4 text-xs shadow-2xl rounded-full flex items-center gap-1.5">
                        <span>🔍 Inspect High-Res Artwork</span>
                        <span className="font-mono text-[10px] opacity-75">(Click to Zoom)</span>
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="w-full aspect-[4/3] max-w-2xl rounded-xl overflow-hidden border border-white/10 shadow-2xl">
                    <ProjectCover
                      seed={project.coverSeed}
                      hue={project.hue}
                      title={project.title}
                      image={project.image}
                      fit={project.imageFit ?? "contain"}
                    />
                  </div>
                )}

                {/* Floating Studio Matting Badges */}
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
                  <span className="font-meta text-[10px] px-3 py-1 rounded-full bg-white/10 border border-white/15 text-zinc-200 backdrop-blur-md flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full dept-bg animate-pulse" />
                    <span>Official Creative Asset</span>
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setLightboxIndex(0);
                    }}
                    className="font-meta text-[10px] px-3 py-1 rounded-full bg-[var(--dept)] text-[var(--on-dept)] font-bold hover:brightness-110 transition-all shadow-sm flex items-center gap-1"
                  >
                    <span>Full-Screen Lightbox 🔍</span>
                  </button>
                  {project.image && (
                    <a
                      href={project.image}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="font-meta text-[10px] px-3 py-1 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 text-zinc-300 transition-colors"
                    >
                      Raw File ↗
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}
        </Reveal>
      </section>

      {/* CASE STUDY NARRATIVE & CREATIVE DELIVERABLES SHOWCASE */}
      <section className="wrap py-16 md:py-24">
        <div className="grid lg:grid-cols-12 gap-10 md:gap-14">
          {/* Sticky Left Rail: Metadata & Action Hooks */}
          <div className="lg:col-span-4">
            <div className="lg:sticky lg:top-24 space-y-8">
              <div>
                <span className="idx">/case-study</span>
                <h3 className="font-display text-lg font-bold uppercase mt-1">
                  Creative Scope & Architecture
                </h3>
                <p className="font-meta text-[11px] text-[var(--muted)] mt-2 leading-relaxed">
                  Delivered services: {project.services.join(" · ")}
                </p>
              </div>

              {/* Artwork Inspection Trigger in Left Rail */}
              {project.image && (
                <div className="border border-[var(--line-strong)] p-4 rounded-xl bg-[var(--panel)]">
                  <span className="font-meta text-[9px] uppercase tracking-wider text-[var(--muted)] block">
                    Visual Craftsmanship
                  </span>
                  <span className="font-display font-bold text-sm block mt-1">
                    Master Creative Deliverables
                  </span>
                  <p className="font-meta text-[10px] text-[var(--muted)] mt-1.5 leading-relaxed">
                    Designed and rendered at high resolution for omni-channel deployment across print and digital touchpoints.
                  </p>
                  <button
                    onClick={() => setLightboxIndex(0)}
                    className="btn btn-dept !py-2 !px-3.5 text-xs w-full justify-center mt-3 rounded-lg"
                  >
                    🔍 Open Studio Lightbox
                  </button>
                </div>
              )}

              {/* Brand Color Harmony Palette Card */}
              <div className="border border-[var(--line)] p-4 rounded-xl bg-[var(--panel)]">
                <span className="font-meta text-[9px] uppercase tracking-wider text-[var(--muted)] block mb-3">
                  Brand Color Architecture
                </span>
                <div className="grid grid-cols-5 gap-1.5">
                  {brandPalette.map((col) => (
                    <div
                      key={col.name}
                      className="group/swatch relative flex flex-col items-center"
                    >
                      <div
                        className="w-full aspect-square rounded-md border border-white/20 shadow-xs transition-transform group-hover/swatch:scale-110"
                        style={{ background: col.hex }}
                        title={`${col.name}: ${col.hex}`}
                      />
                    </div>
                  ))}
                </div>
                <span className="font-meta text-[9px] text-[var(--muted)] block mt-2.5">
                  Custom-tuned palette calibrated for high-contrast accessibility.
                </span>
              </div>

              {/* Deliverables Checklist */}
              <div className="border border-[var(--line)] p-4 rounded-xl bg-[var(--panel)]">
                <span className="font-meta text-[9px] uppercase tracking-wider text-[var(--muted)] block mb-2">
                  Standard Packaging Specs
                </span>
                <ul className="space-y-1.5 font-meta text-[10px] text-zinc-300">
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span> 300 DPI Vector & CMYK Print
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span> WebP & Retina Social Assets
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span> Full Identity Guidelines PDF
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-emerald-400">✓</span> Source `.AI` / `.FIG` Archives
                  </li>
                </ul>
              </div>

              {/* Conversion CTA */}
              <div className="pt-2">
                <ArrowLink to={`/start?intent=quote&ref=${project.slug}`}>
                  Commission Similar Project
                </ArrowLink>
                {project.liveUrl && (
                  <button
                    className="btn btn-ghost mt-4 w-full justify-center"
                    onClick={() => setPreviewOpen(true)}
                  >
                    Contained Live Preview <span className="btn-arrow" aria-hidden>→</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right Rail: Narrative Chapters & In-Context Gallery */}
          <div className="lg:col-span-8">
            <div className="space-y-2">
              {chapters.map((c, i) => (
                <Reveal key={c.n} delay={i === 0 ? 0 : 40}>
                  <article className="grid md:grid-cols-[80px_1fr] gap-6 py-8 border-t border-[var(--line)] first:border-t-0 first:pt-0">
                    <span className="font-display-wide text-3xl md:text-4xl font-bold dept-accent" aria-hidden>
                      {c.n}
                    </span>
                    <div>
                      <h2 className="font-display text-xl md:text-2xl font-bold uppercase tracking-tight">
                        {c.name}
                      </h2>
                      <p className="mt-3 text-[15px] md:text-base text-[var(--muted)] leading-relaxed max-w-2xl">
                        {c.body}
                      </p>

                      {/* Embed visual evidence right after "The Creative Approach" */}
                      {c.n === "03" && allArtworkAssets.length > 0 && (
                        <div className="mt-8 pt-6 border-t border-white/10">
                          <span className="font-meta text-[9px] uppercase tracking-wider text-[var(--muted)] block mb-3">
                            Visual Evidence & Deliverable Exhibits
                          </span>
                          <div className="grid sm:grid-cols-2 gap-4">
                            {allArtworkAssets.map((asset, aIdx) => (
                              <div
                                key={asset.url}
                                onClick={() => setLightboxIndex(aIdx)}
                                className="group/card relative rounded-xl overflow-hidden border border-[var(--line-strong)] bg-[var(--panel)] cursor-zoom-in hover:border-[var(--dept)] transition-all shadow-md"
                              >
                                <div className="aspect-[4/3] w-full overflow-hidden bg-black/40 flex items-center justify-center p-2">
                                  <img
                                    src={asset.url}
                                    alt={asset.title}
                                    className="w-full h-full object-contain transition-transform duration-300 group-hover/card:scale-105"
                                    loading="lazy"
                                    decoding="async"
                                  />
                                </div>
                                <div className="p-3 border-t border-[var(--line)] flex items-center justify-between">
                                  <div className="min-w-0 pr-2">
                                    <span className="font-display text-xs font-bold uppercase truncate block text-white">
                                      {asset.title}
                                    </span>
                                    <span className="font-meta text-[9px] text-[var(--muted)] truncate block">
                                      {asset.subtitle}
                                    </span>
                                  </div>
                                  <span className="font-meta text-[10px] text-[var(--dept)] shrink-0 font-bold">
                                    🔍 Zoom
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* NEXT PROJECT LINK */}
      <Link
        to={`/work/${next.slug}`}
        className="group block rule-t transition-colors"
        style={{ background: "var(--ink)", color: "var(--bg)" }}
      >
        <div className="wrap py-16 md:py-20 flex flex-wrap items-center justify-between gap-6">
          <div>
            <span className="font-meta text-[10px] opacity-60">Next creative file</span>
            <span className="font-display-wide block text-3xl md:text-5xl font-bold uppercase mt-2 group-hover:text-[var(--dept)] transition-colors">
              {next.title}
            </span>
          </div>
          <span className="font-meta text-sm transition-transform duration-200 group-hover:translate-x-2" aria-hidden>
            →
          </span>
        </div>
      </Link>

      <FinalCta />

      {/* 2026 STUDIO ARTWORK LIGHTBOX MODAL */}
      {lightboxIndex !== null && (
        <ArtworkLightbox
          project={project}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}

      {/* CONTAINED LIVE WINDOW PREVIEW (FOR WEB PROJECTS) */}
      {previewOpen && project.liveUrl && (
        <LiveWindow
          url={project.liveUrl}
          title={project.title}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </>
  );
}

