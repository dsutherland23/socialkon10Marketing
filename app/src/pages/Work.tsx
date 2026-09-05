import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { WORK_FILTERS, type DeptId, type Project } from "../lib/data";
import { useContent } from "../lib/content";
import { useDepartment } from "../lib/dept";
import { useSEO, track } from "../lib/seo";
import { Reveal, ShuffleText } from "../lib/motion";
import { FinalCta } from "../components/blocks";
import { ProjectCover } from "../components/cover";
import { LiveCover } from "../components/LiveCover";
import { LiveWindow } from "../components/LiveWindow";

/* Mini browser chrome for web projects without a live URL — makes the
   archive read as a wall of sites rather than abstract art. */
function WebChrome({ label }: { label: string }) {
  return (
    <div className="absolute top-0 inset-x-0 z-10 flex items-center gap-2 px-3 h-8 border-b border-[var(--line)]" style={{ background: "var(--panel)" }}>
      <span className="flex gap-1" aria-hidden>
        <i className="w-1.5 h-1.5 border border-[var(--line-strong)]" />
        <i className="w-1.5 h-1.5 border border-[var(--line-strong)]" />
        <i className="w-1.5 h-1.5 dept-bg" />
      </span>
      <span className="font-meta text-[8px] truncate px-2 py-0.5 border border-[var(--line)]" style={{ background: "var(--bg)" }}>{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------
   THE CREATIVE ARCHIVE (PRD §21)
   Projects behave like files: index numbers, filters, list + grid
   views, department theming via query param.
------------------------------------------------------------------- */

export default function Work() {
  const [params] = useSearchParams();
  const deptParam = params.get("dept") as DeptId | null;
  useDepartment(deptParam && ["brand", "social", "web"].includes(deptParam) ? deptParam : null);
  const [filter, setFilter] = useState("ALL");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [hover, setHover] = useState<string | null>(null);
  const [preview, setPreview] = useState<Project | null>(null);
  const { projects: allProjects } = useContent();

  useSEO({
    title: "Work — The Creative Archive | Social Kon10 Marketing",
    description: "Branding, social media, web and event projects from Social Kon10 Marketing. Browse the creative archive by discipline.",
    path: "/work",
  });

  const projects = useMemo(() => {
    let xs = allProjects;
    if (deptParam && ["brand", "social", "web"].includes(deptParam)) {
      const map: Record<string, string[]> = { brand: ["BRANDING", "GRAPHIC", "EVENTS"], social: ["SOCIAL", "CAMPAIGNS"], web: ["WEB"] };
      xs = xs.filter((p) => p.categories.some((c) => map[deptParam].includes(c)));
    }
    if (filter !== "ALL") xs = xs.filter((p) => p.categories.includes(filter));
    return xs;
  }, [filter, deptParam, allProjects]);

  return (
    <>
      <section className="wrap pt-14 md:pt-20 pb-16">
        <Reveal>
          <div className="flex justify-between font-meta text-[10px] text-[var(--muted)]">
            <span className="idx">/work</span>
            <span>{projects.length} files</span>
          </div>
        </Reveal>
        <h1 className="display-hero mt-6 max-w-[12ch]">The creative archive.</h1>
        <Reveal delay={200}>
          <p className="mt-6 max-w-xl text-[var(--muted)]">Every project is a file. Open one to read the case study — challenge, strategy, creative, execution, result.</p>
        </Reveal>

        {/* filter bar */}
        <Reveal delay={260}>
          <div className="mt-12 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter projects">
              {WORK_FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => { setFilter(f); track("archive_filter", { filter: f }); }}
                  aria-pressed={filter === f}
                  className="font-meta text-[10px] px-3 py-1.5 border transition-colors duration-200"
                  style={filter === f
                    ? { background: "var(--dept)", borderColor: "var(--dept)", color: "var(--on-dept)" }
                    : { borderColor: "var(--line)" }}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="flex gap-2" role="group" aria-label="View">
              {(["grid", "list"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  aria-pressed={view === v}
                  className="font-meta text-[10px] px-3 py-1.5 border transition-colors"
                  style={view === v ? { borderColor: "var(--ink)", background: "var(--ink)", color: "var(--bg)" } : { borderColor: "var(--line)" }}
                >
                  {v.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      <section className="wrap pb-24" aria-label="Projects">
        {view === "grid" ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-14">
            {projects.map((p, i) => {
              const isWeb = p.categories.includes("WEB");
              const aspect = isWeb ? "aspect-[4/3]" : "aspect-[4/5]";
              return (
              <Reveal key={p.slug} delay={(i % 3) * 60}>
                <div className="group media-hover">
                  {p.liveUrl ? (
                    /* live miniature — clicks open the contained Live Window */
                    <div className={`media-frame ${aspect}`}>
                      <LiveCover url={p.liveUrl} title={p.title} seed={p.coverSeed} hue={p.hue} image={p.image} onOpen={() => setPreview(p)} />
                    </div>
                  ) : (
                    <Link to={`/work/${p.slug}`} className={`relative block media-frame ${aspect}`}>
                      <ProjectCover seed={p.coverSeed} hue={p.hue} title={p.title} image={p.image} fit={p.imageFit ?? "contain"} />
                      {isWeb && <WebChrome label={p.slug} />}
                    </Link>
                  )}
                  <div className="mt-4">
                    <span className="font-meta text-[9px] text-[var(--muted)]">/PROJECT_{p.id} — {p.client}</span>
                    <h2 className="font-display text-xl font-bold uppercase mt-1">
                      <Link to={`/work/${p.slug}`} className="hover:text-[var(--dept)] transition-colors">{p.title}</Link>
                    </h2>
                    <p className="font-meta text-[9px] text-[var(--muted)] mt-1.5">{p.categories.join(" · ")}</p>
                    {p.liveUrl && (
                      <button
                        className="mt-2.5 font-meta text-[10px] dept-accent u-line"
                        onClick={() => setPreview(p)}
                        aria-label={`Open contained live preview of ${p.title}`}
                      >
                        Live preview →
                      </button>
                    )}
                  </div>
                </div>
              </Reveal>
              );
            })}
          </div>
        ) : (
          <div>
            {projects.map((p) => (
              <div key={p.slug} className="relative">
                <Link
                  to={`/work/${p.slug}`}
                  className="file-row grid-cols-[auto_1fr_auto] md:grid-cols-[110px_1fr_auto_auto]"
                  onMouseEnter={() => setHover(p.slug)}
                  onMouseLeave={() => setHover(null)}
                >
                  <span className="idx">/PROJECT_{p.id}</span>
                  <span className="font-display text-xl md:text-3xl font-bold uppercase leading-none">
                    <ShuffleText text={p.title} play={hover === p.slug} />
                  </span>
                  <span className="hidden md:block font-meta text-[9px] text-[var(--muted)]">{p.categories.join(" · ")}</span>
                  <span className="font-meta text-[10px] dept-accent" aria-hidden>OPEN →</span>
                </Link>
                {p.liveUrl && (
                  <button
                    className="absolute right-20 md:right-24 top-1/2 -translate-y-1/2 font-meta text-[10px] dept-accent u-line"
                    onClick={() => setPreview(p)}
                    aria-label={`Open contained live preview of ${p.title}`}
                  >
                    LIVE →
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {projects.length === 0 && (
          <p className="font-meta text-[11px] text-[var(--muted)] py-16 text-center">No files under this filter yet.</p>
        )}
      </section>
      <FinalCta />
      {preview?.liveUrl && (
        <LiveWindow url={preview.liveUrl} title={preview.title} onClose={() => setPreview(null)} />
      )}
    </>
  );
}
