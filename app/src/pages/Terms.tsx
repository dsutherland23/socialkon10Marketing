import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useSEO } from "../lib/seo";
import { CONTACT } from "../lib/data";

const SECTIONS = [
  { id: "acceptance", label: "1. Acceptance of Terms" },
  { id: "services-scope", label: "2. Services & Scope of Work" },
  { id: "revisions-approvals", label: "3. Revisions & Final Approval" },
  { id: "client-assets", label: "4. Client Assets & Indemnity" },
  { id: "ip-licensing", label: "5. Intellectual Property Rights" },
  { id: "templates-studio", label: "6. Templates & Cloud Editor" },
  { id: "payments-refunds", label: "7. Payments, Deposits & Refunds" },
  { id: "portfolio-rights", label: "8. Portfolio & Showcase Rights" },
  { id: "disclaimers", label: "9. Disclaimers & No ROI Warranty" },
  { id: "liability", label: "10. Limitation of Liability" },
  { id: "termination", label: "11. Cancellation & Termination" },
  { id: "disputes", label: "12. Governing Law & Arbitration" },
  { id: "contact", label: "13. Contact Information" },
];

export default function TermsPage() {
  const [activeSection, setActiveSection] = useState<string>("acceptance");

  useSEO({
    title: "Terms of Service & Client Agreement — Social Kon10 Marketing",
    description:
      "Official Terms of Service, Commercial Licensing, and Client Service Agreement for Social Kon10 Marketing. Review our policies on revisions, intellectual property, payments, and warranties.",
    path: "/terms",
  });

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((e) => e.isIntersecting);
        if (visible) {
          setActiveSection(visible.target.id);
        }
      },
      { rootMargin: "-20% 0px -60% 0px" }
    );

    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      const yOffset = -90;
      const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  };

  return (
    <div className="wrap pt-28 pb-32">
      {/* Header Banner */}
      <div className="border-b border-[var(--line)] pb-10 mb-12">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <span className="font-meta text-[11px] tracking-[0.2em] uppercase text-[var(--dept)] font-bold">
            Legal & Client Service Agreement
          </span>
          <span className="font-meta text-[11px] text-[var(--muted)]">
            Last Updated: August 25, 2026 · Effective Immediately
          </span>
        </div>
        <h1 className="font-display-wide text-4xl sm:text-5xl lg:text-6xl font-bold uppercase tracking-tight text-[var(--ink)]">
          Terms of Service
        </h1>
        <p className="mt-4 text-base sm:text-lg text-[var(--muted)] max-w-3xl leading-relaxed">
          These Terms of Service constitute a legally binding agreement between you ("Client", "User", or "you")
          and <strong>Social Kon10 Marketing</strong> ("Social Kon10", "Company", "we", "us", or "our").
          Please read them carefully before engaging our agency services, purchasing digital products, or using our cloud studio editor.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
        {/* Sticky Table of Contents (Desktop) */}
        <aside className="hidden lg:block lg:col-span-4 sticky top-24 border border-[var(--line)] bg-[var(--panel)] p-6 rounded-none shadow-sm">
          <p className="font-meta text-[10px] uppercase tracking-widest text-[var(--muted)] font-bold mb-4">
            Table of Contents
          </p>
          <nav className="flex flex-col gap-1.5 font-meta text-[12px]">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => scrollToSection(s.id)}
                className={`text-left px-2.5 py-1.5 transition-all text-xs ${
                  activeSection === s.id
                    ? "bg-[var(--ink)] text-[var(--bg)] font-bold"
                    : "text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--bg)]"
                }`}
              >
                {s.label}
              </button>
            ))}
          </nav>

          <div className="mt-8 pt-6 border-t border-[var(--line)] flex flex-col gap-2 font-meta text-[11px] text-[var(--muted)]">
            <span>Have questions regarding these terms?</span>
            <a href={`mailto:${CONTACT.email}`} className="text-[var(--ink)] font-bold u-line w-fit">
              {CONTACT.email}
            </a>
            <Link to="/privacy" className="text-[var(--dept)] font-bold u-line w-fit mt-1">
              View Privacy Policy →
            </Link>
          </div>
        </aside>

        {/* Terms Body */}
        <article className="lg:col-span-8 flex flex-col gap-12 text-[14.5px] leading-relaxed text-[var(--ink)]">
          {/* Section 1 */}
          <section id="acceptance" className="scroll-mt-28 flex flex-col gap-4 border-b border-[var(--line)] pb-10">
            <h2 className="font-display-wide text-2xl font-bold uppercase tracking-tight text-[var(--ink)] flex items-center gap-3">
              <span className="font-meta text-[14px] text-[var(--dept)]">01</span>
              Acceptance of Terms
            </h2>
            <p>
              By accessing <a href="https://socialkon10.com" className="u-line font-medium">socialkon10.com</a>, creating an account,
              submitting a project brief, signing a quote or proposal, remitting a payment or deposit, or using our interactive Cloud Canvas Editor,
              you acknowledge that you have read, understood, and agreed to be legally bound by these Terms of Service, along with our{" "}
              <Link to="/privacy" className="u-line font-semibold text-[var(--dept)]">
                Privacy Policy
              </Link>
              .
            </p>
            <p>
              If you are entering into this agreement on behalf of a company, event, or organization, you represent and warrant that you possess the legal authority to bind such entity to these Terms. If you do not agree with any part of these terms, you must immediately cease all use of our website and services.
            </p>
          </section>

          {/* Section 2 */}
          <section id="services-scope" className="scroll-mt-28 flex flex-col gap-4 border-b border-[var(--line)] pb-10">
            <h2 className="font-display-wide text-2xl font-bold uppercase tracking-tight text-[var(--ink)] flex items-center gap-3">
              <span className="font-meta text-[14px] text-[var(--dept)]">02</span>
              Services, Scope of Work & Timelines
            </h2>
            <p>
              Social Kon10 provides professional creative and digital marketing services across three core departments:
              (1) Graphic Design & Branding, (2) Social Media Marketing & Management, and (3) Website Design & Development,
              in addition to downloadable digital design templates and cloud editing tools.
            </p>
            <div className="flex flex-col gap-3 mt-2">
              <div className="p-4 border border-[var(--line)] bg-[var(--panel)]">
                <h3 className="font-display text-[15px] font-bold uppercase text-[var(--ink)]">A. Scope of Work (SOW)</h3>
                <p className="text-sm text-[var(--muted)] mt-1">
                  The exact deliverables, specifications, file formats, and timelines for custom agency services are governed by the specific Service Product purchased (as detailed on our official rate sheet) or by an approved written quote/invoice. Any work requested outside the agreed SOW will be deemed "Scope Creep" and quoted as an additional billable add-on.
                </p>
              </div>
              <div className="p-4 border border-[var(--line)] bg-[var(--panel)]">
                <h3 className="font-display text-[15px] font-bold uppercase text-[var(--ink)]">B. Estimated Timelines & Client Delays</h3>
                <p className="text-sm text-[var(--muted)] mt-1">
                  All turnaround times (e.g. 24–48 hours for event flyers, 2–4 weeks for websites) are reasonable commercial estimates commencing only after receipt of both the required deposit and all necessary client assets (copy, photos, credentials). Social Kon10 is not liable for missed deadlines caused by client delays, incomplete briefs, slow feedback cycles, or technical force majeure.
                </p>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section id="revisions-approvals" className="scroll-mt-28 flex flex-col gap-4 border-b border-[var(--line)] pb-10">
            <h2 className="font-display-wide text-2xl font-bold uppercase tracking-tight text-[var(--ink)] flex items-center gap-3">
              <span className="font-meta text-[14px] text-[var(--dept)]">03</span>
              Revision Policy, Final Approval & Print Accuracy
            </h2>
            <p>
              To maintain efficient project velocity and fair pricing, revisions are subject to the following clear boundaries:
            </p>
            <ul className="list-disc list-inside space-y-2 text-sm text-[var(--muted)]">
              <li><strong>Included Rounds:</strong> Each service package includes the specific number of revision rounds outlined in the package description (typically 2 to 3 revision cycles).</li>
              <li><strong>Definition of Revision:</strong> A revision consists of minor layout refinements, color adjustments, typography styling, or copy tweaks within the original agreed concept. Requesting a completely new concept, new theme, or different layout structure after a concept has been developed is considered a new project and billed accordingly.</li>
              <li><strong>Binding Final Approval:</strong> Prior to final asset delivery or website deployment, the Client will receive a proof or staging link for sign-off. Client's approval (via email, WhatsApp, or Client Portal) constitutes final acceptance.</li>
              <li><strong>Zero Liability for Post-Approval Errors:</strong> The Client bears sole responsibility for proofreading all copy, dates, times, addresses, phone numbers, prices, spelling, and grammar before giving final approval. <strong>Social Kon10 is not liable for any print re-runs, wasted physical collateral, distribution losses, or errors discovered after final approval is given.</strong></li>
            </ul>
          </section>

          {/* Section 4 */}
          <section id="client-assets" className="scroll-mt-28 flex flex-col gap-4 border-b border-[var(--line)] pb-10">
            <h2 className="font-display-wide text-2xl font-bold uppercase tracking-tight text-[var(--ink)] flex items-center gap-3">
              <span className="font-meta text-[14px] text-[var(--dept)]">04</span>
              Client Assets & Copyright Indemnification
            </h2>
            <div className="p-4 border-2 border-rose-500/40 bg-rose-950/10 rounded-none mb-2">
              <p className="font-display text-[15px] font-bold uppercase text-rose-400">
                ⚠️ Strict Warranty on Client-Supplied Content & Total Indemnity
              </p>
              <p className="text-sm text-[var(--ink)] mt-2 leading-relaxed">
                You expressly represent, warrant, and certify that you hold 100% legal ownership, copyright licenses, model releases, and trademark permissions for all logos, photography, graphics, fonts, audio, video clips, and text provided to Social Kon10 for inclusion in your design, website, or marketing campaign.
              </p>
            </div>
            <p>
              <strong>Comprehensive Indemnification Clause:</strong> The Client agrees to fully defend, indemnify, and hold harmless Social Kon10 Marketing, its owners, directors, designers, employees, and subcontractors from and against any and all claims, liabilities, lawsuits, damages, penalties, fines, and legal costs (including full attorney fees) arising from or relating to:
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-sm text-[var(--muted)] mt-1">
              <li>Any copyright, trademark, trade dress, or patent infringement claim stemming from materials supplied by the Client.</li>
              <li>Any unauthorized use of celebrity likenesses, artist photos, unlicensed music, or third-party intellectual property requested by the Client.</li>
              <li>Any defamatory, unlawful, deceptive, or false advertising claims arising from Client-provided event details, medical/financial claims, or promotional offers.</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section id="ip-licensing" className="scroll-mt-28 flex flex-col gap-4 border-b border-[var(--line)] pb-10">
            <h2 className="font-display-wide text-2xl font-bold uppercase tracking-tight text-[var(--ink)] flex items-center gap-3">
              <span className="font-meta text-[14px] text-[var(--dept)]">05</span>
              Intellectual Property Rights & Deliverables
            </h2>
            <p>
              Ownership of intellectual property is governed by the following clear division:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
              <div className="p-4 border border-[var(--line)] bg-[var(--panel)]">
                <h3 className="font-display font-bold text-sm text-[var(--ink)] uppercase">Client Ownership (Final Deliverables)</h3>
                <p className="text-xs text-[var(--muted)] mt-2 leading-relaxed">
                  Upon receipt of <strong>100% payment in full</strong>, Social Kon10 transfers to the Client the exclusive, perpetual commercial right to use and distribute the finalized visual deliverables (e.g. approved logos, final flyer JPEGs/PNGs/PDFs, compiled website files) for their intended commercial purpose.
                </p>
              </div>
              <div className="p-4 border border-[var(--line)] bg-[var(--panel)]">
                <h3 className="font-display font-bold text-sm text-[var(--ink)] uppercase">Studio Retained Rights (Proprietary Tools)</h3>
                <p className="text-xs text-[var(--muted)] mt-2 leading-relaxed">
                  Social Kon10 retains all ownership of unchosen design drafts, proprietary code libraries, design system frameworks, vector icons, studio software, Photoshop master action templates, and raw working files unless source-file ownership (PSD/AI) was explicitly purchased as a deliverable add-on.
                </p>
              </div>
            </div>
          </section>

          {/* Section 6 */}
          <section id="templates-studio" className="scroll-mt-28 flex flex-col gap-4 border-b border-[var(--line)] pb-10">
            <h2 className="font-display-wide text-2xl font-bold uppercase tracking-tight text-[var(--ink)] flex items-center gap-3">
              <span className="font-meta text-[14px] text-[var(--dept)]">06</span>
              Digital Templates & Cloud Canvas Studio Rules
            </h2>
            <p>
              Purchases of digital design templates and use of the Cloud Canvas Editor are subject to strict licensing restrictions:
            </p>
            <ul className="list-disc list-inside space-y-2 text-sm text-[var(--muted)]">
              <li><strong>Single Commercial License:</strong> Each template purchase grants a non-exclusive, non-sublicensable, revocable license to create customized end-products (e.g. event flyers for one event, social posts for your brand).</li>
              <li><strong>Prohibition on Resale & Distribution:</strong> You may NOT sub-license, resell, redistribute, bundle, or share raw template assets, PSD multi-layer files, or canvas JSON document states on any marketplace (e.g. Creative Market, Etsy, Envato), stock site, or peer-to-peer file sharing platform.</li>
              <li><strong>Studio Availability & Data Backups:</strong> While we provide cloud autosaving and canvas state recovery, you are responsible for exporting and saving your final production files (PNG, JPEG, PDF, PSD). Social Kon10 does not guarantee infinite cloud storage of abandoned drafts.</li>
            </ul>
          </section>

          {/* Section 7 */}
          <section id="payments-refunds" className="scroll-mt-28 flex flex-col gap-4 border-b border-[var(--line)] pb-10">
            <h2 className="font-display-wide text-2xl font-bold uppercase tracking-tight text-[var(--ink)] flex items-center gap-3">
              <span className="font-meta text-[14px] text-[var(--dept)]">07</span>
              Payments, Deposits, Refunds & Chargeback Policy
            </h2>
            <div className="flex flex-col gap-3">
              <div className="p-4 border border-[var(--line)] bg-[var(--panel)]">
                <h3 className="font-display text-[15px] font-bold uppercase text-[var(--ink)]">A. Deposits & Payment Terms</h3>
                <p className="text-sm text-[var(--muted)] mt-1">
                  Custom design projects require an upfront, non-refundable deposit (standardly 50%, or 100% for rush/micro orders) before design work begins. The remaining balance is due immediately upon presentation of the final watermarked proof, prior to the release of high-resolution, unwatermarked production files.
                </p>
              </div>
              <div className="p-4 border border-[var(--line)] bg-[var(--panel)]">
                <h3 className="font-display text-[15px] font-bold uppercase text-[var(--ink)]">B. Strict Non-Refundable Policy</h3>
                <p className="text-sm text-[var(--muted)] mt-1">
                  Because creative design services consume non-recoverable studio labor, time, and custom talent, <strong>all deposits and milestone payments are strictly non-refundable once work has commenced</strong>. Digital template downloads and instant exports are non-refundable once accessed.
                </p>
              </div>
              <div className="p-4 border border-[var(--line)] bg-[var(--panel)]">
                <h3 className="font-display text-[15px] font-bold uppercase text-[var(--ink)]">C. Illegitimate Chargeback Penalties</h3>
                <p className="text-sm text-[var(--muted)] mt-1">
                  Initiating a fraudulent credit card chargeback or PayPal claim without first attempting to resolve the matter in good faith with our studio constitutes a material breach of contract. In such events, all commercial licenses to the work are immediately and automatically revoked, your account will be permanently banned, and the outstanding balance plus a $150 USD administrative dispute fee will be forwarded to legal collections.
                </p>
              </div>
            </div>
          </section>

          {/* Section 8 */}
          <section id="portfolio-rights" className="scroll-mt-28 flex flex-col gap-4 border-b border-[var(--line)] pb-10">
            <h2 className="font-display-wide text-2xl font-bold uppercase tracking-tight text-[var(--ink)] flex items-center gap-3">
              <span className="font-meta text-[14px] text-[var(--dept)]">08</span>
              Studio Portfolio & Showcase Rights
            </h2>
            <p>
              To celebrate our clients' success and demonstrate our craftsmanship, Social Kon10 reserves the standard creative industry right to showcase finalized designs, websites, brand identity assets, and video campaigns in our online portfolio, case studies, award submissions, and social media channels.
            </p>
            <p className="text-sm text-[var(--muted)]">
              If your project involves strictly confidential, unreleased intellectual property requiring a complete Non-Disclosure Agreement (NDA) or white-label confidentiality, you must notify us in writing prior to project kickoff. A custom NDA fee may apply.
            </p>
          </section>

          {/* Section 9 */}
          <section id="disclaimers" className="scroll-mt-28 flex flex-col gap-4 border-b border-[var(--line)] pb-10">
            <h2 className="font-display-wide text-2xl font-bold uppercase tracking-tight text-[var(--ink)] flex items-center gap-3">
              <span className="font-meta text-[14px] text-[var(--dept)]">09</span>
              Disclaimer of Warranties & No Marketing ROI Guarantee
            </h2>
            <p>
              All services, digital products, and studio software are provided on an <strong>"AS IS"</strong> and <strong>"AS AVAILABLE"</strong> basis without warranties of any kind, whether express, implied, statutory, or otherwise.
            </p>
            <div className="p-4 border border-[var(--line)] bg-[var(--panel)] text-sm text-[var(--muted)] leading-relaxed space-y-2">
              <p>
                <strong>No Commercial Outcome Guarantees:</strong> While Social Kon10 employs proven creative strategies, we make no representation, warranty, or guarantee that any design, website, ad campaign, or social media management service will generate specific financial returns, event ticket sales, viral engagement numbers, or business growth.
              </p>
              <p>
                <strong>Third-Party Platform Disruption:</strong> Social Kon10 is not liable for changes, suspensions, outages, or algorithm shifts imposed by third-party platforms (such as Meta/Instagram, TikTok, Google Ads, Stripe, Shopify, or web hosting providers).
              </p>
            </div>
          </section>

          {/* Section 10 */}
          <section id="liability" className="scroll-mt-28 flex flex-col gap-4 border-b border-[var(--line)] pb-10">
            <h2 className="font-display-wide text-2xl font-bold uppercase tracking-tight text-[var(--ink)] flex items-center gap-3">
              <span className="font-meta text-[14px] text-[var(--dept)]">10</span>
              Limitation of Liability (Liability Cap)
            </h2>
            <div className="p-4 border-2 border-[var(--line)] bg-[var(--panel)]">
              <p className="font-display text-[14px] font-bold uppercase text-[var(--ink)] mb-2">
                Maximum Aggregate Liability Cap
              </p>
              <p className="text-sm text-[var(--muted)] leading-relaxed">
                To the maximum extent permitted by applicable law, in no event shall Social Kon10 Marketing, its owners, directors, employees, or contractors be liable for any indirect, incidental, special, consequential, punitive, or exemplary damages (including loss of profits, revenue, data, goodwill, or business interruption), regardless of the theory of liability.
              </p>
              <p className="text-sm font-bold text-[var(--ink)] mt-3">
                In all circumstances, Social Kon10's total cumulative liability arising out of or related to any project, service, or product shall be strictly capped at and limited to the actual dollar amount paid by the Client to Social Kon10 for the specific service giving rise to the claim during the three (3) months preceding the incident.
              </p>
            </div>
          </section>

          {/* Section 11 */}
          <section id="termination" className="scroll-mt-28 flex flex-col gap-4 border-b border-[var(--line)] pb-10">
            <h2 className="font-display-wide text-2xl font-bold uppercase tracking-tight text-[var(--ink)] flex items-center gap-3">
              <span className="font-meta text-[14px] text-[var(--dept)]">11</span>
              Project Cancellation & Termination
            </h2>
            <p>
              Either party may terminate an ongoing project agreement upon five (5) business days' written notice. In the event of Client termination:
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-sm text-[var(--muted)]">
              <li>All initial deposits and milestone payments are forfeited.</li>
              <li>The Client shall immediately pay for all billable hours, completed assets, and contracted third-party expenses incurred up to the date of termination.</li>
              <li>Social Kon10 shall deliver any completed, paid-for assets. Incomplete drafts or unpaid work remain the exclusive property of Social Kon10.</li>
            </ul>
          </section>

          {/* Section 12 */}
          <section id="disputes" className="scroll-mt-28 flex flex-col gap-4 border-b border-[var(--line)] pb-10">
            <h2 className="font-display-wide text-2xl font-bold uppercase tracking-tight text-[var(--ink)] flex items-center gap-3">
              <span className="font-meta text-[14px] text-[var(--dept)]">12</span>
              Governing Law, Jurisdiction & Mandatory Dispute Resolution
            </h2>
            <p>
              These Terms of Service, all client contracts, and any disputes arising hereunder shall be governed by and construed in accordance with the substantive laws of <strong>Jamaica</strong>, without regard to its conflict of law principles.
            </p>
            <div className="p-4 border border-[var(--line)] bg-[var(--panel)] text-sm text-[var(--muted)] leading-relaxed space-y-2">
              <p>
                <strong>Mandatory Good-Faith Negotiation:</strong> In the event of any controversy or dispute, the parties agree to first attempt to resolve the issue informally through good-faith executive negotiations for at least thirty (30) days.
              </p>
              <p>
                <strong>Binding Arbitration:</strong> If the dispute cannot be settled informally, it shall be resolved exclusively through binding arbitration administered in Kingston, Jamaica in accordance with the Arbitration Act of Jamaica. The decision of the arbitrator shall be final and enforceable in any court of competent jurisdiction.
              </p>
            </div>
          </section>

          {/* Section 13 */}
          <section id="contact" className="scroll-mt-28 flex flex-col gap-4">
            <h2 className="font-display-wide text-2xl font-bold uppercase tracking-tight text-[var(--ink)] flex items-center gap-3">
              <span className="font-meta text-[14px] text-[var(--dept)]">13</span>
              Contact Information
            </h2>
            <p>
              For inquiries, formal contract questions, or legal notices concerning these Terms of Service, please contact our management team:
            </p>
            <div className="mt-2 p-6 border border-[var(--line)] bg-[var(--panel)] flex flex-col gap-2 font-meta text-[13px]">
              <p className="font-display font-bold text-base text-[var(--ink)]">Social Kon10 Marketing</p>
              <p className="text-[var(--muted)]">Attn: Legal & Contracts Department</p>
              <p className="text-[var(--muted)]">Kingston, Jamaica, West Indies</p>
              <p className="mt-2">
                <strong>Email:</strong>{" "}
                <a href={`mailto:${CONTACT.email}`} className="text-[var(--dept)] font-bold u-line">
                  {CONTACT.email}
                </a>
              </p>
              <p>
                <strong>WhatsApp / Phone:</strong>{" "}
                <a href={`tel:${CONTACT.phoneHref}`} className="text-[var(--ink)] font-bold u-line">
                  {CONTACT.phone}
                </a>
              </p>
            </div>
          </section>
        </article>
      </div>
    </div>
  );
}
