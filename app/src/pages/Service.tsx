import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { deptById, formatMoney } from "../lib/data";
import { useContent, useServiceBySlug } from "../lib/content";
import { useDepartment } from "../lib/dept";
import { useShop } from "../lib/shop";
import { useSEO, track, breadcrumbLd } from "../lib/seo";
import { ClipLines, Reveal } from "../lib/motion";
import { ArrowLink, FinalCta } from "../components/blocks";
import { ProjectCover } from "../components/cover";

/* ------------------------------------------------------------------
   SERVICE PRODUCT PAGE + CONFIGURATOR (PRD §25–27)
   Live price updates, add-ons, rush fee, deposit preview,
   cross-sell into the ecosystem.
------------------------------------------------------------------- */

export default function ServicePage() {
  const { slug } = useParams();
  const service = useServiceBySlug(slug);
  const { projects } = useContent();
  const dept = service ? deptById(service.dept) : null;
  const { currency, add } = useShop();
  const navigate = useNavigate();
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [rush, setRush] = useState(false);
  const [added, setAdded] = useState(false);

  useDepartment(service?.dept ?? null);
  useSEO({
    title: service?.seoTitle ?? "Service — Social Kon10",
    description: service?.seoDescription ?? "",
    path: service ? `/services/${service.slug}` : undefined,
    jsonLd: service && service.price > 0
      ? {
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Product",
              name: service.name,
              description: service.seoDescription,
              brand: { "@id": "https://socialkon10.com/#org" },
              offers: {
                "@type": "Offer",
                price: service.price,
                priceCurrency: "USD",
                availability: "https://schema.org/InStock",
              },
            },
            breadcrumbLd([
              { name: "Home", path: "/" },
              { name: "Packages", path: "/packages" },
              { name: service.name, path: `/services/${service.slug}` },
            ]),
          ],
        }
      : undefined,
  });

  const { total, deposit } = useMemo(() => {
    if (!service) return { total: 0, deposit: 0 };
    const addonsSum = service.addons.filter((a) => selectedAddons.includes(a.id)).reduce((s, a) => s + a.price, 0);
    const b = service.price + addonsSum;
    const t = rush ? b * 1.25 : b;
    return { total: t, deposit: Math.round(t * (service.depositPct / 100)) };
  }, [service, selectedAddons, rush]);

  if (!service || !dept) return <Navigate to="/packages" replace />;

  const related = projects.filter((p) => p.dept === service.dept).slice(0, 2);
  // cross-sell ecosystem (PRD §36)
  const crossSell = service.dept === "brand"
    ? { line: "Your brand is ready. Want us to launch it?", target: "Social Media Launch Package", to: "/services/social-media-management" }
    : service.dept === "web"
    ? { line: "Your website is live. Now let's drive traffic.", target: "Social Media Marketing", to: "/services/social-media-management" }
    : { line: "Turn your audience into customers.", target: "Website / Landing Page", to: "/services/landing-page" };

  const configurable = service.priceType === "fixed" || service.priceType === "starting";

  const addToCart = (then: "cart" | "checkout") => {
    add({
      serviceSlug: service.slug,
      name: service.name,
      unitPrice: service.price,
      addons: service.addons.filter((a) => selectedAddons.includes(a.id)).map((a) => ({ id: a.id, name: a.name, price: a.price })),
      rush,
      billing: service.billing,
      depositPct: service.depositPct,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 2200);
    if (then === "checkout") navigate("/checkout");
  };

  return (
    <>
      <section className="rule-b" style={{ background: "var(--dept-soft)" }}>
        <div className="wrap pt-12 md:pt-16 pb-14">
          <Reveal>
            <div className="flex flex-wrap justify-between gap-3 font-meta text-[10px] text-[var(--muted)]">
              <Link to={dept.path} className="u-line">← {dept.index} {dept.name}</Link>
              <span className="idx">{service.id}</span>
            </div>
          </Reveal>
          <h1 className="display-hero mt-8 max-w-[14ch]"><ClipLines lines={[service.name]} /></h1>
          <Reveal delay={180}>
            <p className="mt-6 max-w-2xl text-base md:text-lg text-[var(--muted)] leading-relaxed">{service.description}</p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-8 flex flex-wrap gap-x-8 gap-y-2 font-meta text-[10px] text-[var(--muted)]">
              <span>Timeline — {service.timeline}</span>
              {service.revisions > 0 && <span>Revisions — {service.revisions} rounds</span>}
              <span>Deposit — {service.depositPct}%</span>
              <span>Billing — {service.billing === "monthly" ? "Monthly retainer" : service.billing === "hourly" ? "Hourly" : "One-time project"}</span>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="wrap py-16 md:py-24 grid lg:grid-cols-12 gap-12">
        {/* left: deliverables */}
        <div className="lg:col-span-7">
          <Reveal><span className="idx">/deliverables</span></Reveal>
          <h2 className="display-sub mt-3">What you get</h2>
          <ul className="mt-8">
            {service.deliverables.map((d, i) => (
              <Reveal as="li" key={d} delay={i * 40}>
                <div className="file-row grid-cols-[40px_1fr] !cursor-default py-3.5">
                  <span className="idx">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-[15px]">{d}</span>
                </div>
              </Reveal>
            ))}
          </ul>

          {/* portfolio examples */}
          {related.length > 0 && (
            <div className="mt-16">
              <Reveal><span className="idx">/related-work</span></Reveal>
              <div className="grid sm:grid-cols-2 gap-6 mt-6">
                {related.map((p) => (
                  <Reveal key={p.slug}>
                    <Link to={`/work/${p.slug}`} className="group block media-hover">
                      <div className="media-frame aspect-[4/3]"><ProjectCover seed={p.coverSeed} hue={p.hue} title={p.title} image={p.image} /></div>
                      <span className="font-meta text-[9px] text-[var(--muted)] block mt-2">/PROJECT_{p.id}</span>
                      <span className="font-display text-base font-bold uppercase group-hover:text-[var(--dept)] transition-colors">{p.title}</span>
                    </Link>
                  </Reveal>
                ))}
              </div>
            </div>
          )}

          {/* cross-sell */}
          <Reveal>
            <div className="mt-16 p-6 md:p-8 border border-[var(--line)]" style={{ background: "var(--panel)" }}>
              <span className="idx">/next-step</span>
              <p className="font-display text-xl md:text-2xl font-bold uppercase mt-3">{crossSell.line}</p>
              <div className="mt-5"><ArrowLink to={crossSell.to}>{crossSell.target}</ArrowLink></div>
            </div>
          </Reveal>
        </div>

        {/* right: configurator / purchase panel */}
        <div className="lg:col-span-5">
          <div className="lg:sticky lg:top-28 border border-[var(--line-strong)]" style={{ background: "var(--panel)" }}>
            <div className="p-6 md:p-8">
              <span className="idx">/configure</span>
              <div className="flex items-baseline justify-between mt-4">
                <h2 className="font-display text-lg font-bold uppercase">{service.name}</h2>
                <span className="font-meta text-[9px] text-[var(--muted)]">{service.currency}</span>
              </div>

              {configurable ? (
                <>
                  <p className="font-display-wide text-4xl md:text-5xl font-bold mt-4">
                    {formatMoney(total, currency)}
                    {service.billing === "monthly" && <span className="text-base font-meta font-normal text-[var(--muted)]">/mo</span>}
                  </p>
                  <p className="font-meta text-[9px] text-[var(--muted)] mt-1">
                    {service.priceType === "starting" ? "Starting price — final quote confirmed before kickoff" : "Fixed package price"}
                    {rush && " · incl. 25% rush fee"}
                  </p>

                  {/* add-ons */}
                  {service.addons.length > 0 && (
                    <fieldset className="mt-8">
                      <legend className="font-meta text-[10px] text-[var(--muted)] mb-3">Add-ons</legend>
                      <div className="flex flex-col gap-2">
                        {service.addons.filter((a) => a.id !== "rush").map((a) => (
                          <label key={a.id} className="flex items-center justify-between gap-3 border border-[var(--line)] px-4 py-3 cursor-pointer hover:border-[var(--dept)] transition-colors has-[:checked]:border-[var(--dept)] has-[:checked]:bg-[var(--dept-soft)]">
                            <span className="flex items-center gap-3 text-sm">
                              <input
                                type="checkbox"
                                checked={selectedAddons.includes(a.id)}
                                onChange={(e) => setSelectedAddons((xs) => e.target.checked ? [...xs, a.id] : xs.filter((x) => x !== a.id))}
                                className="accent-[var(--dept)] w-4 h-4"
                              />
                              {a.name}
                            </span>
                            <span className="font-meta text-[10px]">{a.priceType === "quote" ? "QUOTE" : `+${formatMoney(a.price, currency)}`}</span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  )}

                  {/* rush */}
                  {service.addons.some((a) => a.id === "rush") && (
                    <label className="mt-3 flex items-center justify-between gap-3 border border-[var(--line)] px-4 py-3 cursor-pointer hover:border-[var(--dept)] transition-colors has-[:checked]:border-[var(--dept)] has-[:checked]:bg-[var(--dept-soft)]">
                      <span className="flex items-center gap-3 text-sm">
                        <input type="checkbox" checked={rush} onChange={(e) => setRush(e.target.checked)} className="accent-[var(--dept)] w-4 h-4" />
                        Rush production (under 72 hrs)
                      </span>
                      <span className="font-meta text-[10px]">+25%</span>
                    </label>
                  )}

                  {/* deposit preview */}
                  <div className="mt-8 pt-5 rule-t flex flex-col gap-2 text-sm">
                    <div className="flex justify-between"><span className="text-[var(--muted)]">Due today ({service.depositPct}% deposit)</span><span className="font-bold">{formatMoney(deposit, currency)}</span></div>
                    <div className="flex justify-between"><span className="text-[var(--muted)]">Due on final approval</span><span>{formatMoney(total - deposit, currency)}</span></div>
                  </div>

                  <div className="mt-8 flex flex-col gap-3">
                    <button className="btn btn-dept justify-center" onClick={() => addToCart("checkout")}>
                      Continue to checkout <span className="btn-arrow" aria-hidden>→</span>
                    </button>
                    <button className="btn btn-ghost justify-center" onClick={() => { addToCart("cart"); track("package_view", { service: service.slug }); }}>
                      {added ? "Added ✓" : "Add to cart"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="font-display-wide text-3xl font-bold mt-4">{service.priceType === "quote" ? "Custom quote" : "Consultation first"}</p>
                  <p className="text-sm text-[var(--muted)] mt-3 leading-relaxed">
                    {service.priceType === "quote"
                      ? "Scope this properly. Tell us the goal, the platforms and the budget range — we reply with a priced proposal you can accept and pay online."
                      : "Strategy work starts with a conversation. Book a consultation and we'll map positioning, audience and direction together."}
                  </p>
                  <div className="mt-8 flex flex-col gap-3">
                    <Link to={`/start?intent=${service.priceType === "quote" ? "quote" : "consultation"}&service=${service.slug}`} className="btn btn-dept justify-center">
                      {service.priceType === "quote" ? "Request a quote" : "Book a consultation"} <span className="btn-arrow" aria-hidden>→</span>
                    </Link>
                  </div>
                </>
              )}

              <p className="font-meta text-[8.5px] text-[var(--muted)] mt-6 leading-relaxed">
                50% non-refundable deposit secures kickoff · balance due on final approval · additional revisions billed at {formatMoney(100, currency)}/hr · prices in USD (BMD accepted at 1:1)
              </p>
            </div>
          </div>
        </div>
      </section>
      <FinalCta />
    </>
  );
}
