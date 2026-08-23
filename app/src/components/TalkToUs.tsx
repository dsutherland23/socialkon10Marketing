import { Link } from "react-router-dom";
import { CONTACT, waLink, waServiceMessage } from "../lib/data";
import { track } from "../lib/seo";
import { Reveal } from "../lib/motion";

/* ------------------------------------------------------------------
   HYBRID COMMERCE — JOURNEY B SURFACES
   TalkToUs          — contextual WhatsApp / Call / Quote actions
   CustomProjectCta  — "Have a custom project?" band (never competes
                       with the purchase CTA, always easy to find)
   DesignJourneys    — the three-path splitter: order online /
                       talk to a designer / request a quote
   All use the existing design language (btn, idx, font-meta, rules).
------------------------------------------------------------------- */

const WaIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1-.2.2-.6.8-.8 1-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4 0-.5.1-.7l.4-.5c.1-.2.2-.3.3-.5s0-.4 0-.5c-.1-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1.1 2.7c.1.2 1.9 2.9 4.5 4 .6.3 1.1.4 1.5.6.6.2 1.2.2 1.6.1.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.5-.3z"/>
  </svg>
);

export function TalkToUs({ serviceName, className = "" }: { serviceName?: string; className?: string }) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      <a
        href={waLink(waServiceMessage(serviceName))}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-ghost !py-2.5"
        onClick={() => track("whatsapp_click", { service: serviceName ?? "general" })}
      >
        <WaIcon /> WhatsApp us
      </a>
      <a
        href={`tel:${CONTACT.phoneHref}`}
        className="btn btn-ghost !py-2.5"
        onClick={() => track("phone_click", { service: serviceName ?? "general" })}
      >
        Call us
      </a>
      <Link
        to={`/start?intent=quote${serviceName ? `&service=${encodeURIComponent(serviceName)}` : ""}`}
        className="btn btn-ghost !py-2.5"
        onClick={() => track("quote_cta_click", { service: serviceName ?? "general" })}
      >
        Request a quote <span className="btn-arrow" aria-hidden>→</span>
      </Link>
    </div>
  );
}

/* "Have a custom project?" — quiet band, sits below purchase flows. */
export function CustomProjectCta({ serviceName }: { serviceName?: string }) {
  return (
    <section className="rule-t" aria-label="Custom projects">
      <div className="wrap py-14 grid lg:grid-cols-12 gap-8 items-start">
        <Reveal className="lg:col-span-6">
          <span className="idx">/custom-project</span>
          <h2 className="display-sub mt-4">Have a custom project?</h2>
          <p className="mt-4 max-w-md text-[var(--muted)] text-sm leading-relaxed">
            Not sure which service you need? Need multiple designs? Have a larger project —
            full branding, a campaign, packaging, a retainer? Talk to the team and we'll scope it properly.
          </p>
        </Reveal>
        <Reveal delay={140} className="lg:col-span-6 lg:pt-10">
          <TalkToUs serviceName={serviceName} />
          <p className="font-meta text-[9px] text-[var(--muted)] mt-4">
            Replies within one business day · {CONTACT.phone} · {CONTACT.email}
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* The difference, made obvious — three doors into the department. */
export function DesignJourneys() {
  const doors = [
    {
      tag: "/i-know-what-i-want",
      title: "Order online",
      desc: "Choose your design, customize the package and add-ons, pay securely. Done.",
      to: "/graphic-design-branding/design-store",
      label: "Browse the store",
      event: "journey_order_online",
    },
    {
      tag: "/i-need-help",
      title: "Talk to a designer",
      desc: "WhatsApp or call the creative team — we'll point you at the right service.",
      to: waLink("Hi, I need help choosing a graphic design service."),
      label: "WhatsApp us",
      event: "journey_talk",
      external: true,
    },
    {
      tag: "/i-have-a-custom-project",
      title: "Request a quote",
      desc: "Tell us about the project and we'll create a custom solution, priced properly.",
      to: "/start?intent=quote",
      label: "Request a quote",
      event: "journey_quote",
    },
  ];
  return (
    <section className="rule-t" aria-label="Ways to buy">
      <div className="wrap py-14">
        <Reveal><span className="idx">/how-do-you-want-to-buy</span></Reveal>
        <div className="mt-8 grid md:grid-cols-3 gap-4">
          {doors.map((d, i) => (
            <Reveal key={d.tag} delay={i * 90}>
              <div className="border border-[var(--line)] p-6 h-full flex flex-col hover:border-[var(--line-strong)] transition-colors" style={{ background: "var(--panel)" }}>
                <span className="idx">{d.tag}</span>
                <h3 className="font-display text-xl font-bold uppercase mt-3">{d.title}</h3>
                <p className="text-[13px] text-[var(--muted)] mt-2 leading-relaxed flex-1">{d.desc}</p>
                {d.external ? (
                  <a href={d.to} target="_blank" rel="noopener noreferrer" className="btn btn-ghost !py-2.5 mt-5 justify-center"
                    onClick={() => track(d.event, {})}>
                    {d.label} <span className="btn-arrow" aria-hidden>→</span>
                  </a>
                ) : (
                  <Link to={d.to} className="btn btn-ghost !py-2.5 mt-5 justify-center" onClick={() => track(d.event, {})}>
                    {d.label} <span className="btn-arrow" aria-hidden>→</span>
                  </Link>
                )}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
