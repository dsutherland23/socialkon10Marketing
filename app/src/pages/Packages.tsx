import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DEPARTMENTS, EVENT_TIERS, SOCIAL_TIERS, formatMoney, type DeptId } from "../lib/data";
import { useContent } from "../lib/content";
import { useDepartment } from "../lib/dept";
import { useShop } from "../lib/shop";
import { useSEO, track } from "../lib/seo";
import { trackPricingView } from "../lib/analytics";
import { Reveal } from "../lib/motion";
import { FinalCta, SectionHead, ServiceCard } from "../components/blocks";
import { DeliverablesPopover } from "../components/DeliverablesPopover";

/* ------------------------------------------------------------------
   PACKAGES + BUILD-YOUR-PACKAGE CONFIGURATOR (PRD §27, §35)
   Progressive disclosure: dept → type → add-ons → live price → checkout.
------------------------------------------------------------------- */

function Builder() {
  const [dept, setDept] = useState<DeptId | null>(null);
  const [serviceSlug, setServiceSlug] = useState<string | null>(null);
  const [addons, setAddons] = useState<string[]>([]);
  const [rush, setRush] = useState(false);
  const { currency, add } = useShop();
  const { services: allServices } = useContent();
  const navigate = useNavigate();

  const services = dept ? allServices.filter((s) => s.dept === dept && (s.priceType === "fixed" || s.priceType === "starting")) : [];
  const service = services.find((s) => s.slug === serviceSlug) ?? null;

  const total = useMemo(() => {
    if (!service) return 0;
    const a = service.addons.filter((x) => addons.includes(x.id)).reduce((s, x) => s + x.price, 0);
    const b = service.price + a;
    return rush ? b * 1.25 : b;
  }, [service, addons, rush]);

  return (
    <div className="border border-[var(--line-strong)]" style={{ background: "var(--panel)" }}>
      <div className="p-6 md:p-10">
        <span className="idx">/build-your-package</span>
        <h2 className="display-sub mt-3">Build your package</h2>

        {/* step 1: department */}
        <fieldset className="mt-8">
          <legend className="font-meta text-[10px] text-[var(--muted)] mb-3">01 — What do you need?</legend>
          <div className="grid sm:grid-cols-3 gap-px" style={{ background: "var(--line)" }}>
            {DEPARTMENTS.map((d) => (
              <button
                key={d.id}
                onClick={() => { setDept(d.id); setServiceSlug(null); setAddons([]); setRush(false); }}
                aria-pressed={dept === d.id}
                className="px-5 py-4 text-left transition-colors"
                style={dept === d.id ? { background: "var(--ink)", color: "var(--bg)" } : { background: "var(--panel)" }}
              >
                <span className="idx">{d.index}</span>
                <span className="font-display block text-base font-bold uppercase mt-1">{d.shortName}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {/* step 2: type */}
        {dept && (
          <fieldset className="mt-8">
            <legend className="font-meta text-[10px] text-[var(--muted)] mb-3">02 — What type?</legend>
            <div className="grid sm:grid-cols-2 gap-2">
              {services.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { setServiceSlug(s.slug); setAddons([]); setRush(false); track("package_view", { service: s.slug }); }}
                  aria-pressed={serviceSlug === s.slug}
                  className="px-5 py-4 text-left border transition-colors"
                  style={serviceSlug === s.slug
                    ? { borderColor: "var(--dept)", background: "var(--dept-soft)" }
                    : { borderColor: "var(--line)" }}
                >
                  <span className="font-display block text-sm font-bold uppercase">{s.name}</span>
                  <span className="font-meta text-[9px] text-[var(--muted)]">
                    {s.priceType === "starting" ? "from " : ""}{formatMoney(s.price, currency)}{s.billing === "monthly" ? "/mo" : ""}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {/* step 3: add-ons */}
        {service && service.addons.filter((a) => a.id !== "rush").length > 0 && (
          <fieldset className="mt-8">
            <legend className="font-meta text-[10px] text-[var(--muted)] mb-3">03 — Add-ons</legend>
            <div className="flex flex-col gap-2">
              {service.addons.filter((a) => a.id !== "rush").map((a) => (
                <label key={a.id} className="flex items-center justify-between gap-3 border border-[var(--line)] px-4 py-3 cursor-pointer hover:border-[var(--dept)] transition-colors has-[:checked]:border-[var(--dept)] has-[:checked]:bg-[var(--dept-soft)]">
                  <span className="flex items-center gap-3 text-sm">
                    <input type="checkbox" className="accent-[var(--dept)] w-4 h-4"
                      checked={addons.includes(a.id)}
                      onChange={(e) => setAddons((xs) => e.target.checked ? [...xs, a.id] : xs.filter((x) => x !== a.id))} />
                    {a.name}
                  </span>
                  <span className="font-meta text-[10px]">{a.priceType === "quote" ? "QUOTE" : `+${formatMoney(a.price, currency)}`}</span>
                </label>
              ))}
              {service.addons.some((a) => a.id === "rush") && (
                <label className="flex items-center justify-between gap-3 border border-[var(--line)] px-4 py-3 cursor-pointer hover:border-[var(--dept)] transition-colors has-[:checked]:border-[var(--dept)] has-[:checked]:bg-[var(--dept-soft)]">
                  <span className="flex items-center gap-3 text-sm">
                    <input type="checkbox" className="accent-[var(--dept)] w-4 h-4" checked={rush} onChange={(e) => setRush(e.target.checked)} />
                    Rush production (under 72 hrs)
                  </span>
                  <span className="font-meta text-[10px]">+25%</span>
                </label>
              )}
            </div>
          </fieldset>
        )}

        {/* live price + checkout */}
        {service && (
          <div className="mt-10 pt-6 rule-t flex flex-wrap items-center justify-between gap-6">
            <div>
              <span className="font-meta text-[9px] text-[var(--muted)]">Live total</span>
              <p className="font-display-wide text-4xl md:text-5xl font-bold">
                {formatMoney(total, currency)}
                {service.billing === "monthly" && <span className="text-base font-meta font-normal text-[var(--muted)]">/mo</span>}
              </p>
              <span className="font-meta text-[9px] text-[var(--muted)]">
                {formatMoney(Math.round(total * service.depositPct / 100), currency)} deposit due today
              </span>
            </div>
            <button
              className="btn btn-dept"
              onClick={() => {
                add({
                  serviceSlug: service.slug, name: service.name, unitPrice: service.price,
                  addons: service.addons.filter((a) => addons.includes(a.id)).map((a) => ({ id: a.id, name: a.name, price: a.price })),
                  rush, billing: service.billing, depositPct: service.depositPct,
                });
                navigate("/checkout");
              }}
            >
              Continue to checkout <span className="btn-arrow" aria-hidden>→</span>
            </button>
          </div>
        )}
        {!dept && <p className="mt-8 font-meta text-[10px] text-[var(--muted)]">Choose a department to begin — prices update live as you configure.</p>}
      </div>
    </div>
  );
}

/* bundle highlight (PRD §35) */
function Bundle() {
  const { currency } = useShop();
  const parts = [2500, 3500, 500];
  const full = parts.reduce((a, b) => a + b, 0);
  const bundle = 5850;
  return (
    <div className="border border-[var(--line-strong)] p-6 md:p-10" style={{ background: "var(--ink)", color: "var(--bg)" }}>
      <span className="idx">/bundle</span>
      <h2 className="display-sub mt-3">Brand Launch Bundle</h2>
      <p className="mt-4 text-sm opacity-75 max-w-md leading-relaxed">
        Brand Identity + Business Website + Social Media Setup — the ecosystem in one engagement,
        sequenced by one team.
      </p>
      <div className="mt-8 flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <span className="font-meta text-[9px] opacity-60">Separately</span>
          <p className="font-display text-2xl font-bold line-through opacity-50">{formatMoney(full, currency)}</p>
        </div>
        <div>
          <span className="font-meta text-[9px] opacity-60">Bundle price</span>
          <p className="font-display-wide text-5xl font-bold">{formatMoney(bundle, currency)}</p>
        </div>
        <span className="dept-bg font-meta text-[10px] px-3 py-1.5">Save {formatMoney(full - bundle, currency)}</span>
      </div>

      <div className="mt-6">
        <DeliverablesPopover
          title="Brand Launch Bundle"
          tagline="Complete multi-department creative ecosystem"
          deliverables={[
            "Complete Brand Identity System (Logos, colors, typography, brand guidelines)",
            "Custom 6-Page Business Website (Home, About, Services, Portfolio, Blog, Contact)",
            "Mobile-First Responsive Web Design & CMS Setup",
            "Social Media Launch Kit (Avatar, banners, 10 launch templates)",
            "Search Engine Optimization (SEO) & Google Indexing",
            "Deliverables Vault Access with Master Vector Files",
            "3 Comprehensive Revision Rounds",
            "50% Kickoff Deposit · Final Approval Sign-Off"
          ]}
          price={5850}
          triggerText="View full bundle scope"
        />
      </div>

      <Link to="/start?intent=quote&service=brand-launch-bundle" className="btn mt-8 !text-current !border-current hover:!border-[var(--dept)] hover:!text-[var(--dept)]">
        Request the bundle <span className="btn-arrow" aria-hidden>→</span>
      </Link>
    </div>
  );
}

export default function Packages() {
  const [tab, setTab] = useState<DeptId>("brand");
  useDepartment(tab);
  const { currency, add } = useShop();
  const { services: allServices } = useContent();

  useSEO({
    title: "Packages & Pricing — Social Kon10 Marketing",    description: "Published prices for branding, social media management and websites. Logo design from $750, social management from $1,200/mo, websites from $1,500.",
    path: "/packages",
  });

  const services = allServices.filter((s) => s.dept === tab);

  useEffect(() => {
    trackPricingView("packages");
  }, []);

  return (
    <>
      <section className="wrap pt-14 md:pt-20 pb-16">
        <Reveal>
          <div className="flex justify-between font-meta text-[10px] text-[var(--muted)]">
            <span className="idx">/packages</span>
            <span>All prices USD · BMD 1:1</span>
          </div>
        </Reveal>
        <h1 className="display-hero mt-6 max-w-[13ch]">Priced like a product.</h1>
        <Reveal delay={180}>
          <p className="mt-6 max-w-xl text-[var(--muted)] leading-relaxed">
            Fixed prices where scope is fixed, starting prices where it flexes, quotes where it should.
            50% deposit secures kickoff — the balance is due only on final approval.
          </p>
        </Reveal>

        {/* department tabs */}
        <Reveal delay={240}>
          <div className="mt-12 grid sm:grid-cols-3 gap-px max-w-3xl" style={{ background: "var(--line)" }} role="tablist" aria-label="Package departments">
            {DEPARTMENTS.map((d) => (
              <button
                key={d.id}
                role="tab"
                aria-selected={tab === d.id}
                onClick={() => setTab(d.id)}
                className="px-5 py-4 text-left transition-colors"
                style={tab === d.id ? { background: "var(--dept)", color: "var(--on-dept)" } : { background: "var(--bg)" }}
              >
                <span className="idx" style={tab === d.id ? { color: "var(--on-dept)" } : {}}>{d.index}</span>
                <span className="font-display block text-base font-bold uppercase mt-1">{d.name}</span>
              </button>
            ))}
          </div>
        </Reveal>
      </section>

      <section className="wrap pb-20">
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-6">
          {services.map((s, i) => <ServiceCard key={s.id} service={s} delay={(i % 3) * 60} />)}
        </div>

        {/* tier systems inline */}
        {tab === "brand" && (
          <div className="mt-20">
            <SectionHead index="/01/event-tiers" title={["Event creative", "tiers."]} meta="From first-time launches to festivals and concert tours." />
            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-px" style={{ background: "var(--line)" }}>
              {EVENT_TIERS.map((t) => (
                <div key={t.id} className="p-6 relative flex flex-col justify-between" style={{ background: t.popular ? "var(--ink)" : "var(--bg)", color: t.popular ? "var(--bg)" : "inherit" }}>
                  <div>
                    {t.popular && <span className="absolute top-0 left-0 dept-bg font-meta text-[9px] px-3 py-1.5">Most popular</span>}
                    <span className="font-meta text-[9px] text-[var(--muted)] mt-4 block">{t.bestFor}</span>
                    <h3 className="font-display text-lg font-bold uppercase mt-2">{t.name}</h3>
                    <p className="font-display-wide text-3xl font-bold mt-4">{formatMoney(t.price, currency)}</p>
                    <div className="mt-3">
                      <DeliverablesPopover
                        title={`Event Creative — ${t.name}`}
                        tagline={t.tagline}
                        deliverables={t.includes}
                        price={t.price}
                        serviceSlug="event-branding"
                        triggerText={`View all ${t.includes.length} deliverables`}
                      />
                    </div>
                  </div>
                  <div className="mt-6 flex items-center justify-between gap-2 pt-4 border-t border-[var(--line)]">
                    <Link to="/services/event-branding" className="font-meta text-[10px] dept-accent u-line">Details →</Link>
                    <button
                      className={`btn !py-1.5 !px-3 font-meta text-[10px] ${t.popular ? "btn-dept" : "btn-ghost"}`}
                      onClick={() =>
                        add({
                          serviceSlug: "event-branding",
                          name: `Event Creative — ${t.name}`,
                          unitPrice: t.price,
                          tierLabel: t.name,
                          addons: [], rush: false, billing: "one_time", depositPct: 50,
                        })
                      }
                    >
                      Get started
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab === "social" && (
          <div className="mt-20">
            <SectionHead index="/02/monthly-tiers" title={["Monthly", "management."]} meta="Content, community and reporting as a retainer. Pause or upgrade between cycles." />
            <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-px" style={{ background: "var(--line)" }}>
              {SOCIAL_TIERS.map((t) => (
                <div key={t.id} className="p-6 flex flex-col justify-between" style={{ background: t.popular ? "var(--ink)" : "var(--bg)", color: t.popular ? "var(--bg)" : "inherit" }}>
                  <div>
                    <h3 className="font-display text-lg font-bold uppercase mt-2">{t.name}</h3>
                    <p className="font-display-wide text-3xl font-bold mt-4">
                      {t.quote ? "Custom" : <>{formatMoney(t.price, currency)}<span className="text-sm font-meta font-normal opacity-60">{t.period}</span></>}
                    </p>
                    <p className="text-[12px] opacity-70 mt-2">{t.blurb}</p>
                    <div className="mt-3">
                      <DeliverablesPopover
                        title={`Social Management — ${t.name}`}
                        tagline={t.blurb}
                        deliverables={t.features.map((f) => `${f.label}: ${f.value}`)}
                        price={t.quote ? undefined : t.price}
                        billing="monthly"
                        serviceSlug="social-media-management"
                        triggerText="View monthly features"
                      />
                    </div>
                  </div>
                  <div className="mt-6 pt-4 border-t border-[var(--line)]">
                    <Link to="/services/social-media-management" className="font-meta text-[10px] dept-accent inline-block u-line">Configure retainer →</Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-24 grid lg:grid-cols-2 gap-8 items-start">
          <Builder />
          <Bundle />
        </div>
      </section>

      {/* bridge: managed packages → one-off design store (PRD §5 flow) */}
      <section className="rule-t" style={{ background: "var(--ink)", color: "var(--bg)" }} aria-label="Design store bridge">
        <div className="wrap py-16 md:py-20 flex flex-wrap items-center justify-between gap-8">
          <div>
            <span className="font-meta text-[10px] opacity-60">Need one-off design instead?</span>
            <h2 className="display-sub mt-3 max-w-[20ch]">60+ design services with live, transparent pricing.</h2>
            <p className="font-meta text-[10px] opacity-60 mt-3">
              Event flyers · logos · business cards · banners · social creative — bundle any services, save up to 15%.
            </p>
          </div>
          <div className="flex flex-wrap gap-4">
            <Link to="/graphic-design-branding/design-store" className="btn" style={{ borderColor: "var(--bg)", color: "var(--bg)" }}>Browse the store <span className="btn-arrow" aria-hidden>→</span></Link>
            <Link to="/custom-package" className="btn btn-dept">Build a package</Link>
          </div>
        </div>
      </section>
      <FinalCta />
    </>
  );
}
