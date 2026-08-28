import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CONTACT, DEPARTMENTS } from "../lib/data";
import { useDepartment } from "../lib/dept";
import { useSEO, track } from "../lib/seo";
import { Reveal } from "../lib/motion";
import { FinalCta } from "../components/blocks";
import { createLead } from "../lib/backend";
import { trackFormStart, trackFormSubmit, trackLeadSubmit, getSessionAttribution } from "../lib/analytics";

/* ------------------------------------------------------------------
   START A PROJECT (PRD §42–44, §70–71)
   Smart progressive form: intent → department → relevant questions.
   Includes quote requests, consultation booking and the service
   matcher (recommendation engine, not a chatbot gimmick).
------------------------------------------------------------------- */

type Intent = "project" | "quote" | "consultation" | "question";

const INTENTS: { id: Intent; label: string; desc: string }[] = [
  { id: "project", label: "Start a project", desc: "You know what you need — let's scope it" },
  { id: "quote", label: "Get a quote", desc: "Custom or complex work, priced properly" },
  { id: "consultation", label: "Book a consultation", desc: "Strategy first — 30 minutes with the team" },
  { id: "question", label: "Ask a question", desc: "Low friction — we reply within a day" },
];

function Matcher() {
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const questions = [
    { id: "logo", q: "Do you already have a logo you're proud of?" },
    { id: "posting", q: "Are you actively posting online?" },
    { id: "website", q: "Do you have a website that converts?" },
    { id: "ads", q: "Are you running paid advertising?" },
  ];
  const done = questions.every((q) => answers[q.id] !== undefined);

  const recommendation = useMemo(() => {
    if (!done) return null;
    const recs: string[] = [];
    if (!answers.logo) recs.push("Brand identity — the foundation everything else inherits");
    if (!answers.posting) recs.push("Social media management — a consistent content engine");
    if (!answers.website) recs.push("Business website or landing page — somewhere for attention to land");
    if (answers.logo && answers.posting && answers.website && !answers.ads) recs.push("Paid social advertising — amplify what's already working");
    if (recs.length === 0) recs.push("A growth review — your system is in place, let's sharpen it");
    return recs;
  }, [answers, done]);

  return (
    <div className="border border-[var(--line-strong)] p-6 md:p-10" style={{ background: "var(--panel)" }}>
      <span className="idx">/service-matcher</span>
      <h2 className="display-sub mt-3">What does your business need?</h2>
      <p className="text-sm text-[var(--muted)] mt-2">Four questions. A recommendation, not a gimmick.</p>
      <div className="mt-8 flex flex-col gap-4">
        {questions.map((q, i) => (
          <fieldset key={q.id} className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] pb-4">
            <legend className="sr-only">{q.q}</legend>
            <span className="text-sm md:text-[15px] max-w-md"><span className="idx mr-2">{String(i + 1).padStart(2, "0")}</span>{q.q}</span>
            <div className="flex gap-2">
              {["Yes", "No"].map((v) => (
                <button
                  key={v}
                  onClick={() => setAnswers((a) => ({ ...a, [q.id]: v === "Yes" }))}
                  aria-pressed={answers[q.id] === (v === "Yes")}
                  className="font-meta text-[10px] px-4 py-2 border transition-colors"
                  style={answers[q.id] === (v === "Yes")
                    ? { background: "var(--dept)", borderColor: "var(--dept)", color: "var(--on-dept)" }
                    : { borderColor: "var(--line)" }}
                >
                  {v}
                </button>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      {recommendation && (
        <div className="mt-8 p-6" style={{ background: "var(--dept-soft)" }}>
          <span className="idx">/your-recommended-starting-point</span>
          <ul className="mt-4 flex flex-col gap-2">
            {recommendation.map((r) => <li key={r} className="font-display text-base font-bold uppercase flex gap-2"><span className="dept-accent" aria-hidden>→</span>{r}</li>)}
          </ul>
          <Link to="/packages" className="btn btn-dept mt-6">Build my package <span className="btn-arrow" aria-hidden>→</span></Link>
        </div>
      )}
    </div>
  );
}

export default function Start() {
  const [params] = useSearchParams();
  const initialIntent = (params.get("intent") as Intent) || null;
  const preService = params.get("service");
  const [intent, setIntent] = useState<Intent | null>(initialIntent);
  const [dept, setDept] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", company: "", budget: "", timeline: "", date: "", time: "", message: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);
  useDepartment(null);

  useSEO({
    title: "Start a Project — Social Kon10 Marketing",
    description: "Start a project, request a quote or book a consultation with Social Kon10 Marketing, Kingston Jamaica.",
    path: "/start",
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!form.name.trim()) er.name = "Your name is required.";
    if (!/.+@.+\..+/.test(form.email)) er.email = "A valid email is required.";
    if (intent === "consultation" && !form.date) er.date = "Pick a date.";
    if (!form.message.trim()) er.message = "A sentence or two helps us route this properly.";
    setErrors(er);
    if (Object.keys(er).length) return;
    track(intent === "quote" ? "quote_request" : intent === "consultation" ? "consultation_request" : "contact_submit", { dept, service: preService });

    // First-party: form funnel submit event
    trackFormSubmit("contact_form", { intent, dept, service: preService });

    // First-party: lead attribution
    trackLeadSubmit({ intent: intent ?? "question", dept, service: preService });

    // Capture attribution data for lead record enrichment
    const attribution = getSessionAttribution();

    // persist the lead (Firestore when configured, local demo otherwise)
    createLead({
      intent: intent ?? "question",
      dept,
      service: preService,
      name: form.name,
      email: form.email,
      company: form.company,
      budget: form.budget || undefined,
      timeline: form.timeline || undefined,
      date: form.date || undefined,
      time: form.time || undefined,
      message: form.message,
      // Attribution enrichment from first-party SDK
      session_id: attribution.session_id,
      first_touch_source: attribution.utm_source,
      first_touch_medium: attribution.utm_medium,
      first_touch_campaign: attribution.utm_campaign,
      first_touch_content: attribution.utm_content,
      landing_page: attribution.landing_page || undefined,
      referrer: attribution.referrer || undefined,
    }).catch(() => {});
    setSent(true);
  };

  const inputCls = "w-full bg-transparent border border-[var(--line)] px-4 py-3 text-sm outline-none focus:border-[var(--dept)] transition-colors";
  const labelCls = "font-meta text-[10px] text-[var(--muted)] block mb-1.5";

  return (
    <>
      <section className="wrap pt-14 md:pt-20 pb-24 max-w-6xl">
        <Reveal>
          <div className="flex flex-wrap justify-between gap-3 font-meta text-[10px] text-[var(--muted)]">
            <span className="idx">/start</span>
            <span>{CONTACT.phone} · {CONTACT.email}</span>
          </div>
        </Reveal>
        <h1 className="display-hero mt-6 max-w-[13ch]">What are you looking for?</h1>

        {sent ? (
          <div className="mt-14 border border-[var(--line-strong)] p-10 md:p-14 text-center" style={{ background: "var(--panel)" }}>
            <span className="idx">/received</span>
            <h2 className="display-section mt-4">{intent === "consultation" ? "Consultation requested." : "Message received."}</h2>
            <p className="mt-4 text-[var(--muted)] max-w-md mx-auto">
              We'll reply from {CONTACT.email} within one business day.
              {intent === "quote" && " If the scope is clear, you'll get a priced proposal you can accept and pay online."}
            </p>
            <Link to="/" className="btn btn-fill mt-8">Back home</Link>
          </div>
        ) : (
          <div className="mt-14 grid lg:grid-cols-12 gap-10 items-start">
            <div className="lg:col-span-7">
              {/* step 1: intent */}
              <div className="grid sm:grid-cols-2 gap-px" style={{ background: "var(--line)" }} role="group" aria-label="What do you need?">
                {INTENTS.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => { setIntent(it.id); trackFormStart("contact_form", { intent: it.id }); }}
                    aria-pressed={intent === it.id}
                    className="p-6 text-left transition-colors"
                    style={intent === it.id ? { background: "var(--ink)", color: "var(--bg)" } : { background: "var(--bg)" }}
                  >
                    <span className="font-display text-lg font-bold uppercase block">{it.label}</span>
                    <span className="font-meta text-[9px] mt-1.5 block" style={{ opacity: intent === it.id ? 0.8 : 0.55 }}>{it.desc}</span>
                  </button>
                ))}
              </div>

              {/* step 2: progressively revealed questions */}
              {intent && (
                <form onSubmit={submit} noValidate className="mt-8 border border-[var(--line)] p-6 md:p-8" style={{ background: "var(--panel)" }}>
                  {intent !== "question" && (
                    <fieldset className="mb-6">
                      <legend className={labelCls}>Which department?</legend>
                      <div className="flex flex-wrap gap-2">
                        {DEPARTMENTS.map((d) => (
                          <button type="button" key={d.id} onClick={() => setDept(d.id)} aria-pressed={dept === d.id}
                            className="font-meta text-[10px] px-4 py-2 border transition-colors"
                            style={dept === d.id ? { background: "var(--dept)", borderColor: "var(--dept)", color: "var(--on-dept)" } : { borderColor: "var(--line)" }}>
                            {d.index} {d.name}
                          </button>
                        ))}
                        <button type="button" onClick={() => setDept("other")} aria-pressed={dept === "other"}
                          className="font-meta text-[10px] px-4 py-2 border transition-colors"
                          style={dept === "other" ? { background: "var(--dept)", borderColor: "var(--dept)", color: "var(--on-dept)" } : { borderColor: "var(--line)" }}>
                          Something else
                        </button>
                      </div>
                    </fieldset>
                  )}

                  <div className="grid sm:grid-cols-2 gap-5">
                    <div>
                      <label className={labelCls} htmlFor="s-name">Name *</label>
                      <input id="s-name" className={inputCls} value={form.name} onChange={set("name")} aria-invalid={!!errors.name} />
                      {errors.name && <p className="font-meta text-[10px] text-red-600 mt-1" role="alert">{errors.name}</p>}
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="s-email">Email *</label>
                      <input id="s-email" type="email" className={inputCls} value={form.email} onChange={set("email")} aria-invalid={!!errors.email} />
                      {errors.email && <p className="font-meta text-[10px] text-red-600 mt-1" role="alert">{errors.email}</p>}
                    </div>
                    <div><label className={labelCls} htmlFor="s-company">Company</label><input id="s-company" className={inputCls} value={form.company} onChange={set("company")} /></div>

                    {intent === "quote" && (
                      <>
                        <div>
                          <label className={labelCls} htmlFor="s-budget">Budget range</label>
                          <select id="s-budget" className={inputCls} value={form.budget} onChange={set("budget")}>
                            <option value="">Select…</option>
                            <option>Under $1,000</option><option>$1,000 – $2,500</option><option>$2,500 – $6,500</option><option>$6,500+</option>
                          </select>
                        </div>
                        <div>
                          <label className={labelCls} htmlFor="s-timeline">Preferred start</label>
                          <select id="s-timeline" className={inputCls} value={form.timeline} onChange={set("timeline")}>
                            <option value="">Select…</option>
                            <option>ASAP (rush)</option><option>Within 2 weeks</option><option>Within a month</option><option>Flexible</option>
                          </select>
                        </div>
                      </>
                    )}
                    {intent === "consultation" && (
                      <>
                        <div>
                          <label className={labelCls} htmlFor="s-date">Preferred date *</label>
                          <input id="s-date" type="date" className={inputCls} value={form.date} onChange={set("date")} aria-invalid={!!errors.date} />
                          {errors.date && <p className="font-meta text-[10px] text-red-600 mt-1" role="alert">{errors.date}</p>}
                        </div>
                        <div>
                          <label className={labelCls} htmlFor="s-time">Preferred time</label>
                          <select id="s-time" className={inputCls} value={form.time} onChange={set("time")}>
                            <option value="">Select…</option>
                            <option>Morning (EST)</option><option>Afternoon (EST)</option><option>Evening (EST)</option>
                          </select>
                        </div>
                      </>
                    )}
                    <div className="sm:col-span-2">
                      <label className={labelCls} htmlFor="s-msg">
                        {intent === "quote" ? "Goals + project description *" : intent === "consultation" ? "What should we prepare for? *" : "Your question *"}
                      </label>
                      <textarea id="s-msg" rows={4} className={inputCls} value={form.message} onChange={set("message")} aria-invalid={!!errors.message}
                        placeholder={preService ? `Re: ${preService.replace(/-/g, " ")}` : ""} />
                      {errors.message && <p className="font-meta text-[10px] text-red-600 mt-1" role="alert">{errors.message}</p>}
                    </div>
                  </div>

                  <div className="mt-8 flex items-center justify-between flex-wrap gap-4">
                    <p className="font-meta text-[9px] text-[var(--muted)] max-w-xs">
                      {intent === "quote" ? "Quotes are converted into payable proposals — review, accept, pay deposit." :
                       intent === "consultation" ? "30 minutes · video call · confirmation by email." :
                       "We reply within one business day."}
                    </p>
                    <button type="submit" className="btn btn-dept">
                      {intent === "quote" ? "Request quote" : intent === "consultation" ? "Request booking" : intent === "project" ? "Send project brief" : "Send question"}
                      <span className="btn-arrow" aria-hidden>→</span>
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* matcher + direct contact */}
            <div className="lg:col-span-5 flex flex-col gap-8">
              <Matcher />
              <div className="border border-[var(--line)] p-6" style={{ background: "var(--panel)" }}>
                <span className="idx">/direct</span>
                <div className="mt-4 flex flex-col gap-2 font-meta text-[11px]">
                  <a className="u-line w-fit" href={`tel:${CONTACT.phoneHref}`}>{CONTACT.phone}</a>
                  <a className="u-line w-fit" href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
                  <span className="text-[var(--muted)]">{CONTACT.location}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
      <FinalCta />
    </>
  );
}
