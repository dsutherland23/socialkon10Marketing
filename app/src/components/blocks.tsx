import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Reveal, ClipLines } from "../lib/motion";
import { formatMoney, type ServiceProduct } from "../lib/data";
import { useShop } from "../lib/shop";
import { DeliverablesPopover } from "./DeliverablesPopover";

/* Section heading: index marker + clipped display title + meta side note */
export function SectionHead({
  index,
  title,
  meta,
  id,
}: {
  index: string;
  title: string[];
  meta?: string;
  id?: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6 mb-12 md:mb-16" id={id}>
      <div>
        <Reveal><span className="idx">{index}</span></Reveal>
        <h2 className="display-section mt-3">
          <ClipLines lines={title} />
        </h2>
      </div>
      {meta && (
        <Reveal delay={120}>
          <p className="font-meta text-[10px] text-[var(--muted)] max-w-[240px] leading-relaxed pb-2">{meta}</p>
        </Reveal>
      )}
    </div>
  );
}

export function ArrowLink({ to, children, className = "" }: { to: string; children: ReactNode; className?: string }) {
  return (
    <Link to={to} className={`group inline-flex items-center gap-2 font-meta text-[11px] ${className}`}>
      <span className="u-line">{children}</span>
      <span className="transition-transform duration-200 group-hover:translate-x-1" aria-hidden>→</span>
    </Link>
  );
}

/* Service product card — file-system styling, live price, dept accent */
export function ServiceCard({ service, delay = 0 }: { service: ServiceProduct; delay?: number }) {
  const { currency } = useShop();
  const price =
    service.priceType === "quote" ? "Request quote"
    : service.priceType === "consultation" ? "Book consultation"
    : `${service.priceType === "starting" ? "from " : ""}${formatMoney(service.price, currency)}${service.billing === "monthly" ? "/mo" : service.billing === "hourly" ? "/hr" : ""}`;

  return (
    <Reveal delay={delay} className="h-full">
      <Link
        to={`/services/${service.slug}`}
        className="group flex flex-col h-full border border-[var(--line)] hover:border-[var(--dept)] transition-colors duration-200 p-6 md:p-8"
        style={{ background: "var(--panel)" }}
      >
        <div className="flex items-center justify-between">
          <span className="font-meta text-[9px] text-[var(--muted)]">{service.id}</span>
          <span className="font-meta text-[9px] text-[var(--dept)]">
            {service.billing === "monthly" ? "RETAINER" : service.priceType === "quote" ? "CUSTOM" : service.priceType === "consultation" ? "STRATEGY" : "PROJECT"}
          </span>
        </div>
        <h3 className="font-display text-xl md:text-2xl font-bold uppercase mt-5 leading-tight group-hover:text-[var(--dept)] transition-colors duration-200">
          {service.name}
        </h3>
        <p className="text-sm text-[var(--muted)] mt-2">{service.tagline}</p>
        <ul className="mt-5 flex flex-col gap-1.5 text-[13px] flex-1">
          {service.deliverables.slice(0, 4).map((d) => (
            <li key={d} className="flex gap-2"><span className="dept-accent" aria-hidden>+</span>{d}</li>
          ))}
          {service.deliverables.length > 4 ? (
            <li className="mt-2 pt-1 border-t border-[var(--line)]/50">
              <DeliverablesPopover
                title={service.name}
                tagline={service.tagline}
                deliverables={service.deliverables}
                timeline={service.timeline}
                revisions={service.revisions}
                depositPct={service.depositPct}
                addons={service.addons}
                serviceSlug={service.slug}
                price={service.price}
                billing={service.billing}
                countExtra={service.deliverables.length - 4}
              />
            </li>
          ) : (
            <li className="mt-2 pt-1 border-t border-[var(--line)]/50">
              <DeliverablesPopover
                title={service.name}
                tagline={service.tagline}
                deliverables={service.deliverables}
                timeline={service.timeline}
                revisions={service.revisions}
                depositPct={service.depositPct}
                addons={service.addons}
                serviceSlug={service.slug}
                price={service.price}
                billing={service.billing}
                triggerText="View full package scope"
              />
            </li>
          )}
        </ul>
        <div className="mt-6 pt-4 rule-t flex items-center justify-between">
          <span className="font-display text-lg font-bold">{price}</span>
          <span className="font-meta text-[10px] dept-accent transition-transform duration-200 group-hover:translate-x-1" aria-hidden>→</span>
        </div>
      </Link>
    </Reveal>
  );
}

/* FAQ accordion — height animation tolerated for accordions */
export function Faq({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div>
      {items.map((f, i) => {
        const isOpen = open === i;
        return (
          <div key={f.q} className="rule-t last:border-b last:border-[var(--line)]">
            <button
              className="w-full flex items-center justify-between gap-6 py-5 text-left group"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : i)}
            >
              <span className="font-display text-base md:text-lg font-semibold uppercase tracking-tight group-hover:text-[var(--dept)] transition-colors">
                {f.q}
              </span>
              <span
                className="font-meta text-sm shrink-0 dept-accent transition-transform duration-200"
                style={{ transform: isOpen ? "rotate(45deg)" : "none" }}
                aria-hidden
              >
                +
              </span>
            </button>
            <div
              className="grid transition-[grid-template-rows] duration-300"
              style={{ gridTemplateRows: isOpen ? "1fr" : "0fr", transitionTimingFunction: "var(--ease-out)" }}
            >
              <div className="overflow-hidden">
                <p className="pb-6 pr-8 text-sm md:text-[15px] text-[var(--muted)] leading-relaxed max-w-2xl">{f.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* Marquee strip — linear, constant, pauses on hover, disabled with reduced motion */
export function Marquee({ items, duration = 36 }: { items: string[]; duration?: number }) {
  const row = (
    <>
      {items.map((t, i) => (
        <span key={i} className="flex items-center shrink-0">
          <span className="font-display-wide text-2xl md:text-4xl font-bold uppercase px-6 whitespace-nowrap">{t}</span>
          <span className="dept-accent font-display text-2xl md:text-4xl px-2" aria-hidden>×</span>
        </span>
      ))}
    </>
  );
  return (
    <div className="marquee overflow-hidden rule-t rule-b py-5 select-none" aria-hidden>
      <div className="marquee-track" style={{ "--marquee-dur": `${duration}s` } as React.CSSProperties}>
        {row}{row}
      </div>
    </div>
  );
}

/* Big closing CTA used across pages */
export function FinalCta() {
  return (
    <section className="rule-t" style={{ background: "var(--ink)", color: "var(--bg)" }}>
      <div className="wrap py-24 md:py-36 text-center">
        <Reveal><span className="idx">/next</span></Reveal>
        <h2 className="display-hero mt-6">
          <ClipLines lines={["Let's build", "something", "that matters."]} />
        </h2>
        <Reveal delay={200}>
          <div className="mt-12 flex flex-wrap justify-center gap-4">
            <Link to="/start" className="btn btn-dept">Start a project <span className="btn-arrow" aria-hidden>→</span></Link>
            <Link to="/start?intent=quote" className="btn !text-current !border-current hover:!border-[var(--dept)] hover:!text-[var(--dept)]">Get a quote</Link>
            <Link to="/start?intent=consultation" className="btn !text-current !border-current hover:!border-[var(--dept)] hover:!text-[var(--dept)]">Book a consultation</Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
