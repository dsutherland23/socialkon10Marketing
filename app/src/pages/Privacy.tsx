import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useSEO } from "../lib/seo";
import { CONTACT } from "../lib/data";

const SECTIONS = [
  { id: "overview", label: "1. Overview & Scope" },
  { id: "information-collected", label: "2. Information We Collect" },
  { id: "how-we-use-data", label: "3. How We Use Information" },
  { id: "third-parties", label: "4. Third-Party Sub-Processors" },
  { id: "client-assets", label: "5. Client Assets & Cloud Studio" },
  { id: "cookies-tracking", label: "6. Cookies & Tracking" },
  { id: "data-security", label: "7. Data Security & Storage" },
  { id: "user-rights", label: "8. Your Privacy Rights" },
  { id: "retention", label: "9. Data Retention" },
  { id: "international", label: "10. Cross-Border Transfers" },
  { id: "children", label: "11. Children's Privacy" },
  { id: "updates", label: "12. Policy Changes" },
  { id: "contact", label: "13. Contact & DPO" },
];

export default function PrivacyPage() {
  const [activeSection, setActiveSection] = useState<string>("overview");

  useSEO({
    title: "Privacy Policy — Social Kon10 Marketing",
    description:
      "Official Privacy Policy of Social Kon10 Marketing. Learn how we collect, protect, process, and respect your personal information, design assets, and payment data.",
    path: "/privacy",
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
            Legal & Data Protection
          </span>
          <span className="font-meta text-[11px] text-[var(--muted)]">
            Last Updated: August 25, 2026 · Effective Immediately
          </span>
        </div>
        <h1 className="font-display-wide text-4xl sm:text-5xl lg:text-6xl font-bold uppercase tracking-tight text-[var(--ink)]">
          Privacy Policy
        </h1>
        <p className="mt-4 text-base sm:text-lg text-[var(--muted)] max-w-3xl leading-relaxed">
          At Social Kon10 Marketing, we respect your privacy and are committed to protecting your personal data,
          client assets, intellectual property, and payment information under international standards and the Jamaica Data Protection Act (JDPA).
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
            <span>Need legal assistance?</span>
            <a href={`mailto:${CONTACT.email}`} className="text-[var(--ink)] font-bold u-line w-fit">
              {CONTACT.email}
            </a>
            <Link to="/terms" className="text-[var(--dept)] font-bold u-line w-fit mt-1">
              View Terms of Service →
            </Link>
          </div>
        </aside>

        {/* Policy Body */}
        <article className="lg:col-span-8 flex flex-col gap-12 text-[14.5px] leading-relaxed text-[var(--ink)]">
          {/* Section 1 */}
          <section id="overview" className="scroll-mt-28 flex flex-col gap-4 border-b border-[var(--line)] pb-10">
            <h2 className="font-display-wide text-2xl font-bold uppercase tracking-tight text-[var(--ink)] flex items-center gap-3">
              <span className="font-meta text-[14px] text-[var(--dept)]">01</span>
              Overview & Scope
            </h2>
            <p>
              This Privacy Policy applies to <strong>Social Kon10 Marketing</strong> ("Social Kon10", "Company", "we", "us", or "our"),
              governing our website (<a href="https://socialkon10.com" className="u-line font-medium">socialkon10.com</a>), our client portal,
              our interactive cloud canvas design editor ("Studio Editor"), our video consultation rooms, and all custom marketing, branding, web development,
              and design services rendered to clients globally.
            </p>
            <p>
              By accessing our platform, purchasing services or digital products, uploading creative content, or interacting with our team,
              you acknowledge that you have read, understood, and agreed to the data collection and processing practices described herein.
            </p>
          </section>

          {/* Section 2 */}
          <section id="information-collected" className="scroll-mt-28 flex flex-col gap-4 border-b border-[var(--line)] pb-10">
            <h2 className="font-display-wide text-2xl font-bold uppercase tracking-tight text-[var(--ink)] flex items-center gap-3">
              <span className="font-meta text-[14px] text-[var(--dept)]">02</span>
              Information We Collect
            </h2>
            <p>We collect information in three primary categories to execute our services safely and reliably:</p>
            
            <div className="flex flex-col gap-4 mt-2">
              <div className="p-4 border border-[var(--line)] bg-[var(--panel)]">
                <h3 className="font-display text-[16px] font-bold uppercase text-[var(--ink)] mb-1">
                  A. Information You Provide Directly
                </h3>
                <ul className="list-disc list-inside space-y-1.5 text-sm text-[var(--muted)] mt-2">
                  <li><strong>Account & Contact Info:</strong> Full name, business entity name, email address, WhatsApp/phone number, physical/billing address.</li>
                  <li><strong>Creative Project Materials:</strong> Brand kits, vector logos, photos, imagery, event details, fonts, color swatches, copy text, and artwork briefs.</li>
                  <li><strong>Consultation & Feedback Records:</strong> Design review comments, proof approvals, chat transcripts, client portal messages, and video room notes.</li>
                  <li><strong>Invoicing & Verification:</strong> Transaction metadata, business registration numbers (where applicable for tax invoicing), and proof of authorization.</li>
                </ul>
              </div>

              <div className="p-4 border border-[var(--line)] bg-[var(--panel)]">
                <h3 className="font-display text-[16px] font-bold uppercase text-[var(--ink)] mb-1">
                  B. Cloud Canvas Editor & Telemetry Data
                </h3>
                <ul className="list-disc list-inside space-y-1.5 text-sm text-[var(--muted)] mt-2">
                  <li><strong>Design State Snapshots:</strong> Canvas object hierarchies, font styling, layer positions, undo/redo history, and autosave snapshots in Firestore.</li>
                  <li><strong>Custom Asset Uploads:</strong> Photos, graphics, cutouts, and PSD documents processed inside the browser or uploaded for cloud sync.</li>
                  <li><strong>Feature Interaction Metrics:</strong> Export frequency, filter selections, and tool usage to improve editor speed and reliability.</li>
                </ul>
              </div>

              <div className="p-4 border border-[var(--line)] bg-[var(--panel)]">
                <h3 className="font-display text-[16px] font-bold uppercase text-[var(--ink)] mb-1">
                  C. Automated & Technical Data
                </h3>
                <ul className="list-disc list-inside space-y-1.5 text-sm text-[var(--muted)] mt-2">
                  <li><strong>Device & Network Identifiers:</strong> IP address, browser type and version, operating system, screen resolution, and time zone settings.</li>
                  <li><strong>Session & Log Records:</strong> Page response times, navigation paths, click-through rates, and crash reports.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section id="how-we-use-data" className="scroll-mt-28 flex flex-col gap-4 border-b border-[var(--line)] pb-10">
            <h2 className="font-display-wide text-2xl font-bold uppercase tracking-tight text-[var(--ink)] flex items-center gap-3">
              <span className="font-meta text-[14px] text-[var(--dept)]">03</span>
              How We Process & Use Your Information
            </h2>
            <p>We process your data strictly under valid legal bases (contract execution, legal compliance, legitimate business interests, or consent):</p>
            <ul className="list-disc list-inside space-y-2 text-sm text-[var(--muted)]">
              <li><strong>Fulfilling Design Contracts:</strong> Designing brand identities, social content, web applications, print collaterals, and delivering high-res production files.</li>
              <li><strong>Powering Interactive Cloud Features:</strong> Synchronizing live canvas designs across sessions, enabling customer proof reviews, and facilitating real-time collaboration.</li>
              <li><strong>Payment Processing & Accounting:</strong> Invoicing, collecting milestone deposits, verifying transactions, calculating applicable taxes, and preventing fraudulent chargebacks.</li>
              <li><strong>Client Support & Scheduling:</strong> Responding to inquiries via email/WhatsApp, hosting virtual consultation calls, and managing project timelines.</li>
              <li><strong>Platform Security & Integrity:</strong> Monitoring for malicious abuse, DDoS prevention, securing client assets, and maintaining data backups.</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section id="third-parties" className="scroll-mt-28 flex flex-col gap-4 border-b border-[var(--line)] pb-10">
            <h2 className="font-display-wide text-2xl font-bold uppercase tracking-tight text-[var(--ink)] flex items-center gap-3">
              <span className="font-meta text-[14px] text-[var(--dept)]">04</span>
              Third-Party Sub-Processors
            </h2>
            <p>
              We never sell, rent, or trade your personal data. We disclose information only to vetted third-party service providers who adhere to strict data protection standards:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              <div className="p-3.5 border border-[var(--line)] bg-[var(--panel)]">
                <p className="font-display font-bold text-sm text-[var(--ink)]">Google Cloud & Firebase</p>
                <p className="font-meta text-[11px] text-[var(--muted)] mt-1">Hosting, user authentication, Firestore encrypted database, and encrypted cloud asset storage.</p>
              </div>
              <div className="p-3.5 border border-[var(--line)] bg-[var(--panel)]">
                <p className="font-display font-bold text-sm text-[var(--ink)]">Stripe & PayPal</p>
                <p className="font-meta text-[11px] text-[var(--muted)] mt-1">PCI-DSS Level 1 certified payment processing. We never store or view your credit card details.</p>
              </div>
              <div className="p-3.5 border border-[var(--line)] bg-[var(--panel)]">
                <p className="font-display font-bold text-sm text-[var(--ink)]">WebRTC & Video Infrastructure</p>
                <p className="font-meta text-[11px] text-[var(--muted)] mt-1">End-to-end encrypted audio, video, and screen sharing streams for client strategy meetings.</p>
              </div>
              <div className="p-3.5 border border-[var(--line)] bg-[var(--panel)]">
                <p className="font-display font-bold text-sm text-[var(--ink)]">Communication APIs</p>
                <p className="font-meta text-[11px] text-[var(--muted)] mt-1">Transactional email delivery, project milestone alerts, and WhatsApp business notifications.</p>
              </div>
            </div>
          </section>

          {/* Section 5 */}
          <section id="client-assets" className="scroll-mt-28 flex flex-col gap-4 border-b border-[var(--line)] pb-10">
            <h2 className="font-display-wide text-2xl font-bold uppercase tracking-tight text-[var(--ink)] flex items-center gap-3">
              <span className="font-meta text-[14px] text-[var(--dept)]">05</span>
              Client Assets & Cloud Studio Safeguards
            </h2>
            <p>
              We treat all raw materials, proprietary assets, and draft designs uploaded by clients as strictly confidential:
            </p>
            <ul className="list-disc list-inside space-y-2 text-sm text-[var(--muted)]">
              <li><strong>Asset Confidentiality:</strong> Your unreleased logos, event flyers, campaign strategy documents, and private photography are stored in isolated cloud repositories accessible only by authorized studio staff.</li>
              <li><strong>No Commercial Resale of Client Content:</strong> We do not license, resell, or distribute client-provided artwork or photography to third parties.</li>
              <li><strong>Browser-Side Processing:</strong> Wherever possible (such as in the Studio Color Picker, Font Previewer, and PSD parser), asset processing occurs client-side in your local browser memory, minimizing unnecessary cloud data exposure.</li>
            </ul>
          </section>

          {/* Section 6 */}
          <section id="cookies-tracking" className="scroll-mt-28 flex flex-col gap-4 border-b border-[var(--line)] pb-10">
            <h2 className="font-display-wide text-2xl font-bold uppercase tracking-tight text-[var(--ink)] flex items-center gap-3">
              <span className="font-meta text-[14px] text-[var(--dept)]">06</span>
              Cookies & Tracking Technologies
            </h2>
            <p>
              We use cookies, local storage, and lightweight telemetry tags to enhance your experience:
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-sm text-[var(--muted)]">
              <li><strong>Essential Storage:</strong> Required for secure login authentication, shopping bag persistence, and canvas state recovery.</li>
              <li><strong>Preference Cookies:</strong> Retaining theme settings (Dark/Light mode), currency display selections, and volume preferences.</li>
              <li><strong>Analytics & Performance:</strong> Aggregated anonymous tracking to identify slow pages and optimize rendering speeds.</li>
            </ul>
            <p className="text-sm text-[var(--muted)] mt-1">
              You can instruct your browser to refuse all cookies or notify you when a cookie is sent. Disabling essential cookies may impair certain features (such as staying logged in or saving design drafts).
            </p>
          </section>

          {/* Section 7 */}
          <section id="data-security" className="scroll-mt-28 flex flex-col gap-4 border-b border-[var(--line)] pb-10">
            <h2 className="font-display-wide text-2xl font-bold uppercase tracking-tight text-[var(--ink)] flex items-center gap-3">
              <span className="font-meta text-[14px] text-[var(--dept)]">07</span>
              Data Security & Storage Protocols
            </h2>
            <p>
              We implement industry-grade technical and organizational measures to safeguard your personal information against unauthorized access, loss, alteration, or disclosure:
            </p>
            <ul className="list-disc list-inside space-y-2 text-sm text-[var(--muted)]">
              <li><strong>Encryption in Transit & At Rest:</strong> All web traffic is forced over HTTPS/TLS 1.3 encryption. Cloud database entries and asset files are encrypted with AES-256 standards.</li>
              <li><strong>Strict Role-Based Access:</strong> Administrative and backend tools are guarded by multi-factor authentication, granular Firestore Security Rules, and audit logs.</li>
              <li><strong>Payment Card Isolation:</strong> Card numbers and sensitive banking credentials are encrypted directly via Stripe/PayPal tokenization and never touch our servers.</li>
              <li><strong>Incident Response:</strong> In the event of a verified data breach impacting personal records, we will notify affected users and regulatory authorities within 72 hours in accordance with applicable law.</li>
            </ul>
          </section>

          {/* Section 8 */}
          <section id="user-rights" className="scroll-mt-28 flex flex-col gap-4 border-b border-[var(--line)] pb-10">
            <h2 className="font-display-wide text-2xl font-bold uppercase tracking-tight text-[var(--ink)] flex items-center gap-3">
              <span className="font-meta text-[14px] text-[var(--dept)]">08</span>
              Your Privacy Rights & Controls
            </h2>
            <p>
              Regardless of your geographical location, we extend the following fundamental privacy rights:
            </p>
            <ul className="list-disc list-inside space-y-2 text-sm text-[var(--muted)]">
              <li><strong>Right of Access:</strong> You may request a copy of the personal data we hold regarding your account or projects.</li>
              <li><strong>Right to Rectification:</strong> You may update or correct inaccurate profile details and company info at any time through the Client Portal or by contacting support.</li>
              <li><strong>Right to Erasure ("Right to Be Forgotten"):</strong> You may request the deletion of your account and associated design drafts, subject to legal and financial retention requirements.</li>
              <li><strong>Right to Data Portability:</strong> You may request an export of your saved project metadata and design assets in standard formats.</li>
              <li><strong>Right to Withdraw Consent:</strong> Where data processing is based on consent, you may withdraw your consent at any time without affecting lawful processing prior to withdrawal.</li>
            </ul>
            <p className="text-sm mt-2">
              To exercise any of these rights, email your request to{" "}
              <a href={`mailto:${CONTACT.email}`} className="font-bold u-line text-[var(--dept)]">
                {CONTACT.email}
              </a>
              . We respond to all verified requests within 30 days.
            </p>
          </section>

          {/* Section 9 */}
          <section id="retention" className="scroll-mt-28 flex flex-col gap-4 border-b border-[var(--line)] pb-10">
            <h2 className="font-display-wide text-2xl font-bold uppercase tracking-tight text-[var(--ink)] flex items-center gap-3">
              <span className="font-meta text-[14px] text-[var(--dept)]">09</span>
              Data Retention Schedule
            </h2>
            <p>
              We retain personal information and project data only as long as necessary to fulfill the purposes for which it was collected:
            </p>
            <ul className="list-disc list-inside space-y-1.5 text-sm text-[var(--muted)]">
              <li><strong>Client Account & Project Files:</strong> Retained for the duration of active client engagements and up to 3 years thereafter to facilitate repeat orders, re-downloads, and brand continuity.</li>
              <li><strong>Financial & Invoice Records:</strong> Retained for 7 years in compliance with statutory tax, auditing, and corporate accounting regulations.</li>
              <li><strong>Abandoned Studio Drafts:</strong> Temporary unpurchased canvas drafts may be purged from cloud storage after 180 days of inactivity.</li>
            </ul>
          </section>

          {/* Section 10 */}
          <section id="international" className="scroll-mt-28 flex flex-col gap-4 border-b border-[var(--line)] pb-10">
            <h2 className="font-display-wide text-2xl font-bold uppercase tracking-tight text-[var(--ink)] flex items-center gap-3">
              <span className="font-meta text-[14px] text-[var(--dept)]">10</span>
              Cross-Border Data Transfers
            </h2>
            <p>
              Social Kon10 operates from Kingston, Jamaica, and utilizes cloud infrastructure hosted in certified data centers in the United States and global regions.
              When transferring data across international borders, we ensure that standard contractual clauses, encryption protocols, and adequate data safeguards are enforced in compliance with applicable cross-border regulations.
            </p>
          </section>

          {/* Section 11 */}
          <section id="children" className="scroll-mt-28 flex flex-col gap-4 border-b border-[var(--line)] pb-10">
            <h2 className="font-display-wide text-2xl font-bold uppercase tracking-tight text-[var(--ink)] flex items-center gap-3">
              <span className="font-meta text-[14px] text-[var(--dept)]">11</span>
              Children's Privacy
            </h2>
            <p>
              Our services, studio editor, and products are directed exclusively toward businesses, professionals, and adults aged 18 and older.
              We do not knowingly collect, solicit, or maintain personal information from individuals under 18 years of age. If we learn that personal data of a minor has been collected without parental consent, we will promptly delete such records.
            </p>
          </section>

          {/* Section 12 */}
          <section id="updates" className="scroll-mt-28 flex flex-col gap-4 border-b border-[var(--line)] pb-10">
            <h2 className="font-display-wide text-2xl font-bold uppercase tracking-tight text-[var(--ink)] flex items-center gap-3">
              <span className="font-meta text-[14px] text-[var(--dept)]">12</span>
              Modifications to this Policy
            </h2>
            <p>
              We may update this Privacy Policy periodically to reflect enhancements to our platform, changes in legal statutes, or new operational practices.
              When updates are published, we will revise the "Last Updated" timestamp at the top of this page. For significant material changes, we will provide prominent notice via email or via the client portal. Continued use of our services following any update constitutes acceptance of the revised terms.
            </p>
          </section>

          {/* Section 13 */}
          <section id="contact" className="scroll-mt-28 flex flex-col gap-4">
            <h2 className="font-display-wide text-2xl font-bold uppercase tracking-tight text-[var(--ink)] flex items-center gap-3">
              <span className="font-meta text-[14px] text-[var(--dept)]">13</span>
              Contact Information & Privacy Officer
            </h2>
            <p>
              If you have any questions, concerns, complaints, or data requests regarding this Privacy Policy or our data handling practices, please contact our Data Protection Officer:
            </p>
            <div className="mt-2 p-6 border border-[var(--line)] bg-[var(--panel)] flex flex-col gap-2 font-meta text-[13px]">
              <p className="font-display font-bold text-base text-[var(--ink)]">Social Kon10 Marketing</p>
              <p className="text-[var(--muted)]">Attn: Legal & Privacy Department</p>
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
