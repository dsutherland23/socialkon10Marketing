import {
  addDoc, collection, doc, getDoc, getDocs, orderBy, query,
  serverTimestamp, setDoc, updateDoc, where, onSnapshot,
} from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import type { User } from "firebase/auth";
import { db, storage, firebaseReady } from "./firebase";
import { idbGet, idbSet, storeLocalBinary } from "./backend";
import { serviceBySlug } from "./data";

/* ------------------------------------------------------------------
   WEBSITE CLIENT INTAKE & SCOPE ENGINE (spec v2.0)
   Config-driven, per-package intake:
   • Packages mirror the live shop (data.ts is the price source of truth)
   • Conditional questions, recommendation engine, lead scoring
   • Scope document + e-signed project agreement (the "contract")
   • Saved client profiles for one-tap future checkouts
   Firestore when configured, IndexedDB fallback so the demo never breaks.
------------------------------------------------------------------- */

export type IntakeStatus = "draft" | "submitted" | "in_review" | "quoted" | "approved";
export const INTAKE_STATUSES: IntakeStatus[] = ["draft", "submitted", "in_review", "quoted", "approved"];

export const CONTRACT_VERSION = "SK-WEB-AGREEMENT-2026.1";

export interface IntakeAsset { name: string; size: number; path?: string; kind: string }

export interface IntakeContract {
  agreed: boolean;
  signedName: string;
  signedAt: string;
  version: string;
  scopeText: string;
}

export interface IntakeRecord {
  id: string;
  uid: string | null;
  email: string;
  orderId: string | null;
  packageSlug: string;
  packageName: string;
  status: IntakeStatus;
  step: number;
  answers: Record<string, string | string[]>;
  selectedAddons: string[];
  selectedRecurring: string[];
  estimate: { oneTime: number; monthly: number; currency: "USD" };
  leadScore: number;
  leadCategory: string;
  assets: IntakeAsset[];
  contract: IntakeContract | null;
  /** set when the chosen website_type scopes to a different package tier than the one paid for */
  scopeShift?: ScopeShift | null;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
}

/* ---------------- scope-shift engine ----------------
   The client pays for a package at checkout, then describes their
   project in the brief. When the chosen website_type scopes to a
   different package tier, the difference must be detected, shown to
   the client BEFORE they sign, and surfaced to the studio — never
   left as a silent gap. Prices resolve through the live catalog
   (CMS overrides) via the priceFor argument.
------------------------------------------------------------------- */

export type ScopeDirection = "upgrade" | "downgrade" | "custom-quote";

export interface ScopeShift {
  direction: ScopeDirection;
  paidPackage: string;        // package slug that was paid for
  paidPackageName: string;
  requiredPackage: string;    // package slug the chosen type scopes to
  requiredPackageName: string;
  paidBase: number;           // USD actually paid for the package line
  requiredBase: number;       // USD current price of the required package
  difference: number;         // upgrade: requiredBase - paidBase (>= 0); otherwise 0
  acknowledgedAt?: string;    // client acknowledged the scope change (required to submit)
}

/** website_type answer → package tier it scopes to (single source of truth). */
export const WEBSITE_TYPE_TIER: Record<string, string> = {
  "Landing Page": "landing-page",
  "Portfolio": "landing-page",
  "Business Website": "business-website",
  "Corporate Website": "business-website",
  "Booking Website": "business-website",
  "E-commerce": "ecommerce-website",
  "Membership": "custom",
  "Web Application": "custom",
  "Custom": "custom",
};

const TIER_RANK: Record<string, number> = { "landing-page": 1, "business-website": 2, "ecommerce-website": 3, custom: 4 };

/**
 * Compare the paid package against the tier the chosen website_type needs.
 * Returns null when both are the same tier (no commercial impact).
 * `priceFor` resolves a package slug to its CURRENT live price (CMS-aware);
 * `paidBase` is what the client actually paid (order truth) — falls back to priceFor.
 */
export function detectScopeShift(
  paidSlug: string,
  websiteType: string,
  priceFor: (slug: string) => number = (s) => serviceBySlug(s)?.price ?? 0,
  paidBase?: number,
): ScopeShift | null {
  const requiredSlug = WEBSITE_TYPE_TIER[websiteType];
  if (!requiredSlug) return null;
  const paidRank = TIER_RANK[paidSlug] ?? 4;
  const reqRank = TIER_RANK[requiredSlug] ?? 4;
  if (paidRank === reqRank) return null; // same tier — no price impact
  const paid = paidBase ?? priceFor(paidSlug);
  const required = priceFor(requiredSlug);
  const paidName = INTAKE_PACKAGES[paidSlug]?.name ?? paidSlug;
  const reqName = INTAKE_PACKAGES[requiredSlug]?.name ?? "Custom-scoped project";
  if (reqRank > paidRank) {
    if (requiredSlug === "custom") {
      return { direction: "custom-quote", paidPackage: paidSlug, paidPackageName: paidName, requiredPackage: requiredSlug, requiredPackageName: reqName, paidBase: paid, requiredBase: 0, difference: 0 };
    }
    return { direction: "upgrade", paidPackage: paidSlug, paidPackageName: paidName, requiredPackage: requiredSlug, requiredPackageName: reqName, paidBase: paid, requiredBase: required, difference: Math.max(0, required - paid) };
  }
  // downgrade — never auto-reprice client-side; the studio reviews credit / added value
  return { direction: "downgrade", paidPackage: paidSlug, paidPackageName: paidName, requiredPackage: requiredSlug, requiredPackageName: reqName, paidBase: paid, requiredBase: required, difference: 0 };
}

/* ---------------- packages (mirror live shop, USD) ---------------- */

export interface IntakePackage {
  slug: string;                 // matches data.ts service slug
  name: string;
  includedPages: number;
  defaultType: string;          // pre-selected website_type
  pageSuggestions: string[];
  scopeIncludes: string[];
  scopeExcludes: string[];
  recommended: string[];        // addon ids surfaced for this package
}

export const INTAKE_PACKAGES: Record<string, IntakePackage> = {
  "landing-page": {
    slug: "landing-page",
    name: "Landing Page / One-Page Website",
    includedPages: 1,
    defaultType: "Landing Page",
    pageSuggestions: ["Hero offer section", "About / story", "Services or product highlights", "Testimonials", "Contact / lead form", "FAQ"],
    scopeIncludes: [
      "Custom one-page design (desktop + mobile)",
      "Mobile-first responsive build",
      "Lead capture / contact form",
      "Basic on-page SEO (titles, descriptions, structure)",
      "Social media links",
      "Launch support + handover walkthrough",
    ],
    scopeExcludes: [
      "Additional pages (quoted separately)",
      "Copywriting (available as an add-on)",
      "Logo / brand identity design",
      "Hosting, domain and third-party platform fees (billed directly to you)",
      "Ongoing maintenance after launch (see Care Plan)",
    ],
    recommended: ["copywriting", "advanced_seo", "whatsapp"],
  },
  "business-website": {
    slug: "business-website",
    name: "Standard Business Website",
    includedPages: 6,
    defaultType: "Business Website",
    pageSuggestions: ["Home", "About", "Services", "Portfolio / Work", "Blog / Insights", "Contact", "Testimonials", "FAQ", "Team"],
    scopeIncludes: [
      "Up to 6 pages (additional pages quoted separately)",
      "Custom design + development",
      "Blog / insights setup",
      "Contact + quote forms",
      "Basic SEO setup",
      "Mobile optimization",
      "Launch support + handover walkthrough",
    ],
    scopeExcludes: [
      "Copywriting (available as an add-on)",
      "Logo / brand identity design",
      "E-commerce / online payments (available as an add-on)",
      "Hosting, domain and third-party platform fees (billed directly to you)",
      "Ongoing maintenance after launch (see Care Plan)",
    ],
    recommended: ["copywriting", "advanced_seo", "whatsapp", "premium_uiux"],
  },
  "ecommerce-website": {
    slug: "ecommerce-website",
    name: "E-Commerce Website",
    includedPages: 8,
    defaultType: "E-commerce",
    pageSuggestions: ["Home", "Shop / Catalog", "Product pages", "About", "FAQ / Shipping info", "Contact", "Track order", "Blog"],
    scopeIncludes: [
      "Product catalog setup (up to 20 products)",
      "Checkout + payment gateway integration",
      "Customer accounts",
      "Order management + inventory",
      "Automated email receipts",
      "Mobile optimization",
      "Launch support + handover walkthrough",
    ],
    scopeExcludes: [
      "Product photography",
      "Product copy/description writing (available as an add-on)",
      "Payment processor transaction fees (charged by the provider)",
      "Hosting, domain and third-party platform fees (billed directly to you)",
      "Ongoing maintenance after launch (see Care Plan)",
    ],
    recommended: ["extra_products_20", "monthly_seo", "whatsapp", "copywriting"],
  },
  custom: {
    slug: "custom",
    name: "Custom Website / Web Application",
    includedPages: 10,
    defaultType: "Custom",
    pageSuggestions: ["Home", "About", "Core feature flows", "Dashboard", "Pricing", "Contact"],
    scopeIncludes: [
      "Custom-scoped build defined by this brief + final proposal",
      "Discovery workshop with the studio",
      "Mobile-first responsive build",
      "Launch support + handover walkthrough",
    ],
    scopeExcludes: [
      "Anything not itemised in the final proposal",
      "Hosting, domain and third-party platform fees (billed directly to you)",
      "Ongoing maintenance after launch (see Care Plan)",
    ],
    recommended: ["premium_uiux", "customer_accounts", "booking", "whatsapp"],
  },
};

/** Website build packages that trigger the intake flow (care plan is maintenance, not a build). */
export const isIntakePackage = (serviceSlug: string | undefined): boolean =>
  !!serviceSlug && serviceSlug in INTAKE_PACKAGES;

export function intakePackageFor(serviceSlug?: string | null): IntakePackage {
  if (serviceSlug && INTAKE_PACKAGES[serviceSlug]) return INTAKE_PACKAGES[serviceSlug];
  return INTAKE_PACKAGES.custom;
}

/* ---------------- add-on + recurring catalogue (USD) ---------------- */

export interface IntakeAddon {
  id: string;
  name: string;
  desc: string;
  price: number;                // one-time USD
  category: string;
  excludeFor?: string[];        // package slugs that already include it
  onlyForTypes?: string[];      // website types it applies to
  orderMatches?: string[];      // lowercase checkout add-on names that already cover this (configurator purchases)
}

/* Prices reconcile to the published configurator catalog (website-addons.ts) —
   one feature, one price, everywhere the client sees it. Items with no published
   equivalent keep their premium scope pricing (documented per item). */
export const INTAKE_ADDONS: IntakeAddon[] = [
  { id: "copywriting", name: "Professional Copywriting", desc: "Conversion-focused copy for up to 5 pages, written for your audience.", price: 600, category: "Content", orderMatches: ["professional copywriting", "website copy package"] }, // = published Website Copy Package
  { id: "premium_uiux", name: "Premium UI/UX Design", desc: "A fully bespoke interface designed around your brand and audience.", price: 600, category: "Design" }, // intake-only premium scope
  { id: "advanced_animation", name: "Advanced Animations", desc: "Custom motion, transitions and interactive details.", price: 900, category: "Design" }, // intake-only premium scope
  { id: "advanced_seo", name: "Advanced SEO Setup", desc: "Keyword research and deeper page-level SEO optimization.", price: 350, category: "SEO", orderMatches: ["seo growth", "local seo"] }, // = published SEO Growth
  { id: "booking", name: "Online Booking System", desc: "Services, availability, deposits and automated confirmations.", price: 500, category: "Booking", excludeFor: [], onlyForTypes: ["Booking Website", "Business Website", "Custom"], orderMatches: ["booking system", "advanced booking + payments"] }, // = published Advanced Booking + Payments
  { id: "customer_accounts", name: "Customer Accounts / Login", desc: "Sign-in, profiles and saved details for your customers.", price: 1000, category: "User Management", excludeFor: ["ecommerce-website"] }, // intake-only premium scope
  { id: "membership", name: "Membership Area", desc: "Gated content, member tiers and recurring access.", price: 1500, category: "Membership", onlyForTypes: ["Membership", "Custom"] }, // intake-only premium scope
  { id: "payment_gateway", name: "Payment Gateway Integration", desc: "Accept cards online through your merchant provider.", price: 600, category: "Payments", excludeFor: ["ecommerce-website"] }, // intake-only premium scope
  { id: "extra_products_20", name: "Extra 25 Products", desc: "Catalog setup beyond the included 20 products.", price: 300, category: "E-commerce", onlyForTypes: ["E-commerce"], orderMatches: ["additional 10 products", "additional 25 products", "additional 50 products"] }, // = published Additional 25 Products
  { id: "multilingual", name: "Multi-language Support", desc: "Your site in two or more languages.", price: 900, category: "Content" }, // intake-only premium scope
  { id: "whatsapp", name: "WhatsApp Chat Integration", desc: "One-tap chat from every page to your WhatsApp.", price: 100, category: "Communication", orderMatches: ["whatsapp integration", "whatsapp lead capture", "whatsapp automation"] }, // = published WhatsApp Integration
  { id: "analytics_dashboard", name: "Advanced Analytics Dashboard", desc: "Traffic, conversions and sales reporting in one view.", price: 800, category: "Dashboard" }, // intake-only premium scope (a dashboard build, not tracking setup)
];

export interface RecurringService { id: string; name: string; desc: string; monthly: number; orderMatches?: string[] }

export const RECURRING_SERVICES: RecurringService[] = [
  { id: "care_plan", name: "Website Care Plan", desc: "Updates, security monitoring, backups and priority fixes.", monthly: 250, orderMatches: ["website care plan"] },
  { id: "hosting", name: "Managed Hosting", desc: "Fast managed hosting with SSL, uptime monitoring and email support.", monthly: 120 },
  { id: "priority_support", name: "Priority Support", desc: "Same-day responses and monthly strategy check-in.", monthly: 300 },
  { id: "monthly_seo", name: "Monthly SEO Management", desc: "Ongoing rankings work: content, keywords and reporting.", monthly: 300, orderMatches: ["ongoing seo management"] }, // matches published entry price
];

/** Recommendation engine (spec §recommendation_engine). */
export function recommendedAddons(pkg: IntakePackage, websiteType: string): string[] {
  const byType: Record<string, string[]> = {
    "E-commerce": ["extra_products_20", "whatsapp", "monthly_seo", "copywriting"],
    "Booking Website": ["booking", "whatsapp", "priority_support", "copywriting"],
    "Business Website": ["copywriting", "advanced_seo", "whatsapp", "premium_uiux"],
    "Corporate Website": ["premium_uiux", "advanced_seo", "multilingual", "analytics_dashboard"],
    "Landing Page": ["copywriting", "advanced_seo", "whatsapp"],
    "Portfolio": ["premium_uiux", "advanced_animation", "copywriting"],
    "Membership": ["membership", "customer_accounts", "priority_support"],
    "Web Application": ["customer_accounts", "analytics_dashboard", "premium_uiux"],
    "Custom": ["premium_uiux", "customer_accounts", "whatsapp"],
  };
  const typeRecs = byType[websiteType] ?? [];
  const merged = [...new Set([...typeRecs, ...pkg.recommended])];
  return merged.filter((id) => {
    const a = INTAKE_ADDONS.find((x) => x.id === id);
    if (!a) return false;
    if (a.excludeFor?.includes(pkg.slug)) return false;
    if (a.onlyForTypes && websiteType && !a.onlyForTypes.includes(websiteType)) return false;
    return true;
  });
}

/* ---------------- question flow (spec §questions + §conditional_logic) ---------------- */

export interface IntakeField {
  id: string;
  kind: "text" | "email" | "tel" | "url" | "textarea" | "select" | "cards" | "multicards";
  label: string;
  placeholder?: string;
  help?: string;
  required?: boolean;
  options?: { value: string; label: string; desc?: string }[];
  showIf?: { field: string; equals?: string; includes?: string };
}

export interface IntakeStep {
  id: string;
  title: string;
  sub: string;
  fields: IntakeField[];
}

const INDUSTRIES = [
  "Retail / E-commerce", "Food & Hospitality", "Beauty & Wellness", "Real Estate",
  "Professional Services", "Construction & Trades", "Events & Entertainment",
  "Education & Training", "Health & Medical", "Non-profit / Church", "Creative / Media", "Other",
].map((v) => ({ value: v, label: v }));

const WEBSITE_TYPES = [
  { value: "Business Website", label: "Business Website", desc: "Showcase services and convert enquiries" },
  { value: "Corporate Website", label: "Corporate Website", desc: "Multi-section presence for a larger organisation" },
  { value: "Landing Page", label: "Landing Page", desc: "One focused page for a campaign or offer" },
  { value: "E-commerce", label: "E-commerce", desc: "Sell products online with checkout" },
  { value: "Booking Website", label: "Booking Website", desc: "Appointments, scheduling and deposits" },
  { value: "Portfolio", label: "Portfolio", desc: "Showcase creative work" },
  { value: "Membership", label: "Membership", desc: "Gated content and member accounts" },
  { value: "Web Application", label: "Web Application", desc: "Custom tools, dashboards, workflows" },
  { value: "Custom", label: "Something else", desc: "A unique build — we'll scope it together" },
];

const GOALS = [
  { value: "Generate leads / enquiries", label: "Generate leads", desc: "Calls, WhatsApp messages, form submissions" },
  { value: "Sell products online", label: "Sell online", desc: "Direct sales through the website" },
  { value: "Take bookings", label: "Take bookings", desc: "Appointments and reservations" },
  { value: "Build credibility", label: "Build credibility", desc: "Look established and win trust" },
  { value: "Inform / educate", label: "Inform & educate", desc: "Content, resources, news" },
  { value: "Replace manual processes", label: "Automate processes", desc: "Move manual work online" },
];

/** The master question flow. `showIf` implements the spec's conditional logic. */
export function intakeSteps(pkg: IntakePackage): IntakeStep[] {
  return [
    {
      id: "business",
      title: "Your business",
      sub: "The essentials — who you are and how we reach you.",
      fields: [
        { id: "business_name", kind: "text", label: "Business / brand name", required: true, placeholder: "e.g. Harbour & Co." },
        { id: "contact_name", kind: "text", label: "Your name", required: true, placeholder: "Who we work with day to day" },
        { id: "email", kind: "email", label: "Email address", required: true, placeholder: "you@business.com" },
        { id: "phone", kind: "tel", label: "Phone / WhatsApp", placeholder: "+1 (876) …" },
        { id: "industry", kind: "select", label: "Industry", required: true, options: INDUSTRIES },
        { id: "business_description", kind: "textarea", label: "Tell us about your business", required: true, placeholder: "What you do, who you serve, what makes you different." },
        { id: "existing_website", kind: "url", label: "Current website (if any)", placeholder: "https://" },
        { id: "socials", kind: "text", label: "Social media handles", placeholder: "@yourbrand — Instagram, Facebook, TikTok…" },
      ],
    },
    {
      id: "project",
      title: "The project",
      sub: "What we're building and what success looks like.",
      fields: [
        { id: "website_type", kind: "cards", label: "What type of website do you need?", required: true, options: WEBSITE_TYPES },
        { id: "primary_goal", kind: "cards", label: "Main goal of the website", required: true, options: GOALS },
        { id: "visitor_action", kind: "textarea", label: "The #1 thing visitors should do", required: true, placeholder: "e.g. Call us, buy the product, book a consultation…" },
        { id: "target_audience", kind: "textarea", label: "Who are your ideal customers?", required: true, placeholder: "Age, location, what they care about, how they find you." },
        { id: "pages_needed", kind: "multicards", label: `Pages you'll need (package includes ${pkg.includedPages})`, options: pkg.pageSuggestions.map((p) => ({ value: p, label: p })) },
        // conditional: e-commerce
        { id: "product_count", kind: "select", label: "Roughly how many products?", required: true, showIf: { field: "website_type", equals: "E-commerce" },
          options: ["Under 20", "20–50", "50–200", "200+"].map((v) => ({ value: v, label: v })) },
        { id: "product_options", kind: "textarea", label: "What are you selling?", showIf: { field: "website_type", equals: "E-commerce" }, placeholder: "Product types, variations (sizes/colours), digital or physical…" },
        { id: "shipping", kind: "select", label: "Shipping / delivery", showIf: { field: "website_type", equals: "E-commerce" },
          options: ["Pickup only", "Local delivery", "Island-wide shipping", "International shipping", "Digital products — no shipping"].map((v) => ({ value: v, label: v })) },
        { id: "payment_methods", kind: "multicards", label: "How should customers pay?", showIf: { field: "website_type", equals: "E-commerce" },
          options: ["Cards online", "Bank transfer", "Cash on delivery / pickup", "Payment link / invoice"].map((v) => ({ value: v, label: v })) },
        // conditional: booking
        { id: "booking_type", kind: "textarea", label: "What do clients book?", required: true, showIf: { field: "website_type", equals: "Booking Website" }, placeholder: "Services, durations, staff, locations…" },
        { id: "booking_deposit", kind: "select", label: "Take deposits when booking?", showIf: { field: "website_type", equals: "Booking Website" },
          options: ["Yes — full payment", "Yes — deposit", "No — pay on arrival"].map((v) => ({ value: v, label: v })) },
        // conditional: membership / web app
        { id: "user_roles", kind: "textarea", label: "Who uses the system and what should each role do?", required: true, showIf: { field: "website_type", includes: "Membership|Web Application|Custom" }, placeholder: "e.g. Admins manage content, members view gated videos…" },
        { id: "integrations", kind: "multicards", label: "Anything to connect?",
          options: ["WhatsApp", "Email marketing (Mailchimp etc.)", "CRM", "Accounting (QuickBooks etc.)", "Social media feeds", "Google Maps", "Other API"].map((v) => ({ value: v, label: v })) },
        { id: "timeline", kind: "select", label: "Ideal launch timing", required: true,
          options: ["ASAP (rush may apply)", "2–4 weeks", "1–2 months", "2–3 months", "3–6 months", "Flexible"].map((v) => ({ value: v, label: v })) },
        { id: "budget", kind: "select", label: "Investment range allocated", required: true,
          options: ["Under $2,000", "$2,000 – $5,000", "$5,000 – $10,000", "$10,000+", "Not sure yet"].map((v) => ({ value: v, label: v })) },
      ],
    },
    {
      id: "design",
      title: "Design direction",
      sub: "The look and feel — so the first draft lands close.",
      fields: [
        { id: "style_direction", kind: "cards", label: "Which direction feels right?", required: true,
          options: [
            { value: "Clean & minimal", label: "Clean & minimal", desc: "Whitespace, simple type, uncluttered" },
            { value: "Bold & energetic", label: "Bold & energetic", desc: "Big type, strong colour, high impact" },
            { value: "Elegant & premium", label: "Elegant & premium", desc: "Refined, luxurious, understated" },
            { value: "Friendly & playful", label: "Friendly & playful", desc: "Warm, approachable, fun" },
            { value: "Corporate & professional", label: "Corporate", desc: "Structured, trustworthy, formal" },
            { value: "Dark & moody", label: "Dark & moody", desc: "Dark theme, dramatic imagery" },
          ] },
        { id: "brand_colors", kind: "text", label: "Brand colours", placeholder: "e.g. navy + gold — or hex codes if you have them", help: "You'll pick exact colours on this step too." },
        { id: "inspiration_sites", kind: "textarea", label: "Websites you love (and why)", placeholder: "Paste 1–3 URLs — they can be outside your industry." },
        { id: "dislikes", kind: "textarea", label: "Anything to avoid?", placeholder: "Colours, styles, competitor sites you dislike…" },
        { id: "logo_status", kind: "select", label: "Do you have a logo + brand assets?", required: true,
          options: ["Yes — ready to upload", "Yes — but needs refinement", "No — I need branding help"].map((v) => ({ value: v, label: v })) },
        { id: "content_ready", kind: "select", label: "Your website content (text + photos)", required: true,
          options: ["Ready — I have everything", "Partially ready", "Nothing yet — I need copywriting help"].map((v) => ({ value: v, label: v })) },
      ],
    },
  ];
}

/** Conditional visibility, incl. `includes: "A|B|C"` multi-match. */
export function fieldVisible(f: IntakeField, answers: Record<string, string | string[]>): boolean {
  if (!f.showIf) return true;
  const val = answers[f.showIf.field];
  const str = Array.isArray(val) ? val.join(" ") : (val ?? "");
  if (f.showIf.equals !== undefined) return str === f.showIf.equals;
  if (f.showIf.includes !== undefined) return f.showIf.includes.split("|").some((x) => str.includes(x));
  return true;
}

/* ---------------- estimate + lead score (spec §pricing_calculation / §lead_scoring) ---------------- */

export function computeEstimate(pkg: IntakePackage, addons: string[], recurring: string[]): { oneTime: number; monthly: number } {
  const base = serviceBySlug(pkg.slug)?.price ?? 0;
  const oneTime = base + addons.reduce((s, id) => s + (INTAKE_ADDONS.find((a) => a.id === id)?.price ?? 0), 0);
  const monthly = recurring.reduce((s, id) => s + (RECURRING_SERVICES.find((r) => r.id === id)?.monthly ?? 0), 0);
  return { oneTime, monthly };
}

export function computeLeadScore(answers: Record<string, string | string[]>, addons: string[], recurring: string[]): { score: number; category: string } {
  let score = 0;
  const budget = String(answers.budget ?? "");
  if (budget.includes("10,000+")) score += 30;
  else if (budget.includes("5,000")) score += 22;
  else if (budget.includes("2,000")) score += 12;
  else if (budget.includes("Not sure")) score += 5;

  const complexity: Record<string, number> = {
    "Landing Page": 4, "Portfolio": 6, "Business Website": 10, "Corporate Website": 14,
    "Booking Website": 16, "E-commerce": 20, "Membership": 22, "Web Application": 28, "Custom": 24,
  };
  score += complexity[String(answers.website_type ?? "")] ?? 6;

  score += Math.min(addons.length * 4, 20);
  score += Math.min(recurring.length * 6, 18);

  const timeline = String(answers.timeline ?? "");
  if (timeline.startsWith("ASAP")) score += 10;
  else if (timeline.includes("weeks")) score += 7;
  else if (timeline.includes("Flexible")) score += 2;
  else score += 4;

  const category = score >= 70 ? "Enterprise / Priority" : score >= 40 ? "High Value" : score >= 20 ? "Standard" : "Low Priority";
  return { score, category };
}

/* ---------------- scope + contract (spec §scope_management) ---------------- */

export function buildScopeSections(
  pkg: IntakePackage,
  answers: Record<string, string | string[]>,
  addons: string[],
  recurring: string[],
  scopePkg?: IntakePackage,   // when the brief scopes to a higher tier, scope describes THAT package
): { title: string; items: string[] }[] {
  const effective = scopePkg ?? pkg;
  const picked = addons.map((id) => INTAKE_ADDONS.find((a) => a.id === id)).filter(Boolean) as IntakeAddon[];
  const rec = recurring.map((id) => RECURRING_SERVICES.find((r) => r.id === id)).filter(Boolean) as RecurringService[];
  const pages = answers.pages_needed;
  return [
    { title: `Included — ${effective.name}`, items: effective.scopeIncludes },
    ...(pages && Array.isArray(pages) && pages.length ? [{ title: "Planned pages / sections", items: pages as string[] }] : []),
    ...(picked.length ? [{ title: "Selected add-ons", items: picked.map((a) => `${a.name} — $${a.price.toLocaleString()} one-time`) }] : []),
    ...(rec.length ? [{ title: "Recurring services", items: rec.map((r) => `${r.name} — $${r.monthly.toLocaleString()}/month`) }] : []),
    { title: "Not included (scope protection)", items: effective.scopeExcludes },
  ];
}

export interface PaymentLedger {
  paid: number;          // USD already paid with the linked order (0 when unpaid)
  difference: number;    // scope-upgrade difference to be proposed (0 otherwise)
  balance: number;       // difference + selected add-ons = estimated balance due
  shiftLabel?: string;   // e.g. "Landing Page / One-Page Website → Standard Business Website"
}

export function buildContractText(scope: { title: string; items: string[] }[], estimate: { oneTime: number; monthly: number }, clientName: string, businessName: string, ledger?: PaymentLedger | null): string {
  const scopeLines = scope.map((s) => `${s.title.toUpperCase()}\n${s.items.map((i) => `  • ${i}`).join("\n")}`).join("\n\n");
  const paymentBlock = ledger && (ledger.paid > 0 || ledger.difference > 0)
    ? `
PAYMENT POSITION
Paid to date: $${ledger.paid.toLocaleString()} USD (received with your order — credited in full).
${ledger.difference > 0 ? `Scope upgrade (${ledger.shiftLabel}): $${ledger.difference.toLocaleString()} USD difference, to be itemised in the Studio's final proposal.\n` : ""}Estimated balance due: $${ledger.balance.toLocaleString()} USD (scope difference + selected add-ons), payable only on approval of the final proposal. Nothing further is charged without your approval.
`
    : "";
  return `PROJECT AGREEMENT — SOCIALKON10 MARKETING AGENCY
Version ${CONTRACT_VERSION}

PARTIES
This agreement is between ${clientName || "the Client"}${businessName ? ` of ${businessName}` : ""} ("the Client") and Socialkon10 Marketing Agency ("the Studio").

SCOPE OF WORK
${scopeLines}

ESTIMATE
Estimated one-time project value: $${estimate.oneTime.toLocaleString()} USD.
${estimate.monthly > 0 ? `Recurring services: $${estimate.monthly.toLocaleString()} USD/month (billed monthly, cancel anytime after the first term).` : "No recurring services selected."}
${paymentBlock}This estimate is based on the information provided and is subject to final project review. Third-party software, hosting, payment processing, subscriptions and external service fees are not included unless specifically stated. The final proposal issued by the Studio governs the final price.

TERMS
1. CLIENT RESPONSIBILITIES — The Client agrees to provide content, images, credentials and feedback in a timely manner. Delays in receiving materials extend the delivery timeline accordingly.
2. REVISIONS — The package includes the revision rounds stated at purchase. Additional revisions or new features after scope approval are quoted as change orders before work proceeds.
3. TIMELINE — The delivery window is confirmed at kickoff and starts once all required materials are received.
4. PAYMENT — Payment terms follow the order/invoice issued by the Studio. Work is scheduled on receipt of the agreed payment.
5. OWNERSHIP — On final payment, the Client owns the finished website and its deliverables. The Studio may showcase the work in its portfolio unless the Client opts out in writing.
6. ACCOUNTS — Domain, hosting and third-party accounts are registered in the Client's name wherever possible; the Client always owns their accounts.
7. CHANGES — Any request outside the scope above requires a written change order approved by both parties before work begins.
8. LIABILITY — The Studio's total liability is limited to the amount paid for the project. The Studio is not liable for third-party service outages or policy changes.

ACCEPTANCE
Typing your full legal name below and submitting this brief constitutes your electronic signature and acceptance of this agreement.`;
}

/* ---------------- saved client profile (account details) ---------------- */

export interface ClientProfile {
  name: string;
  company: string;
  email: string;
  phone: string;
  website: string;
  industry: string;
  address: string;
  city: string;
  country: string;
  updatedAt: string;
}

export const EMPTY_PROFILE: Omit<ClientProfile, "updatedAt"> = {
  name: "", company: "", email: "", phone: "", website: "", industry: "", address: "", city: "", country: "",
};

export async function getProfile(uid: string): Promise<ClientProfile | null> {
  if (!firebaseReady || !db) {
    return (await idbGet<ClientProfile>(`sk-demo-profile-${uid}`)) ?? null;
  }
  try {
    const snap = await getDoc(doc(db, "profiles", uid));
    return snap.exists() ? (snap.data() as ClientProfile) : null;
  } catch {
    return (await idbGet<ClientProfile>(`sk-demo-profile-${uid}`)) ?? null;
  }
}

export async function saveProfile(uid: string, data: Omit<ClientProfile, "updatedAt">): Promise<void> {
  const full: ClientProfile = { ...data, updatedAt: new Date().toISOString() };
  // Always cache locally so checkout prefill is instant and works offline
  await idbSet(`sk-demo-profile-${uid}`, full);
  if (!firebaseReady || !db) return;
  try {
    await setDoc(doc(db, "profiles", uid), full, { merge: true });
  } catch (err) {
    console.warn("saveProfile Firestore error (cached locally):", err);
  }
}

/* ---------------- zero-repeat prefill (2026: confirm, don't re-ask) ----------------
   Every fact has exactly one home. The brief prefills from what the
   order (checkout), the saved account profile and the auth account
   already know — the client confirms or adjusts, never retypes.
------------------------------------------------------------------- */

export interface IntakePrefill {
  answers: Record<string, string>;
  prefilled: string[];        // intake field ids that came pre-filled (for the "from your order" hint)
}

export function resolveIntakePrefill(args: {
  orderDetails?: Record<string, string> | null;
  profile?: ClientProfile | null;
  user?: { displayName?: string | null; email?: string | null } | null;
}): IntakePrefill {
  const { orderDetails: d, profile: p, user: u } = args;
  const out: Record<string, string> = {};
  const prefilled: string[] = [];
  const put = (field: string, ...vals: (string | undefined | null)[]) => {
    const v = vals.find((x) => x && String(x).trim());
    if (v) { out[field] = String(v).trim(); prefilled.push(field); }
  };
  // industry is a fixed-option select — only prefill on an exact option match
  const industryMatch = (v?: string | null) => {
    const m = v?.trim();
    return m && INDUSTRIES.some((o) => o.value.toLowerCase() === m.toLowerCase()) ? m : undefined;
  };

  put("business_name", d?.company, p?.company);
  put("contact_name", d?.name, p?.name, u?.displayName);
  put("email", d?.email, p?.email, u?.email);
  put("phone", d?.phone, p?.phone);
  put("existing_website", d?.website, p?.website);
  put("industry", industryMatch(d?.industry) ?? industryMatch(p?.industry));
  // free-text answers captured at checkout map to their textarea equivalents
  put("target_audience", d?.audience);
  put("visitor_action", d?.goals);
  put("brand_colors", d?.colors);
  return { answers: out, prefilled };
}

/**
 * Intake add-on / recurring ids already covered by add-ons purchased at
 * checkout (matched by published configurator name). These render as
 * "In your order ✓" and can never be double-billed in the brief.
 */
export function coveredByOrder(purchasedNames: string[]): { addons: string[]; recurring: string[] } {
  const names = purchasedNames.map((n) => n.toLowerCase().replace(/\s*×\d+$/, "").trim());
  const has = (m?: string[]) => !!m?.some((x) => names.includes(x));
  return {
    addons: INTAKE_ADDONS.filter((a) => has(a.orderMatches)).map((a) => a.id),
    recurring: RECURRING_SERVICES.filter((r) => has(r.orderMatches)).map((r) => r.id),
  };
}

/* ---------------- intake CRUD ---------------- */

type IntakeDraft = Omit<IntakeRecord, "id" | "createdAt" | "updatedAt"> & { id?: string };

function normalizeIntake(id: string, data: Record<string, unknown>): IntakeRecord {
  return {
    ...(data as unknown as IntakeRecord),
    id,
    assets: Array.isArray(data.assets) ? (data.assets as IntakeAsset[]) : [],
    createdAt: (data.createdAt as { toDate?: () => Date })?.toDate?.()?.toISOString?.()
      ?? (typeof data.createdAt === "string" ? data.createdAt : new Date().toISOString()),
    updatedAt: (data.updatedAt as { toDate?: () => Date })?.toDate?.()?.toISOString?.()
      ?? (typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString()),
  };
}

/**
 * Deterministic intake doc id — one brief per (package, order, person).
 * The person key is a non-reversible hash so emails/uids stay out of doc ids.
 */
function stableIntakeId(packageSlug: string, orderId: string | null, who: string): string {
  let h = 0;
  for (let i = 0; i < who.length; i++) h = (h * 31 + who.charCodeAt(i)) >>> 0;
  return `web-${packageSlug}-${orderId ?? "noorder"}-${h.toString(36)}`.replace(/[^\w-]/g, "_").slice(0, 200);
}

/** Create or update an intake (autosave-safe). Returns the intake id. */
export async function saveIntake(draft: IntakeDraft): Promise<string> {
  const now = new Date().toISOString();
  // Firestore rejects `undefined` field values — strip the local id key cleanly
  const { id: _localId, ...payload } = draft;
  // 2026 best practice: ONE brief per (package, order, person). Deterministic
  // ids mean reopening the wizard always updates the same record instead of
  // stacking duplicate briefs — even across sessions, devices, and the
  // guest → signed-in transition (both uid and email hashes are tried).
  const stableIdFor = (who: string) => stableIntakeId(draft.packageSlug, draft.orderId ?? null, who);
  const whoKeys = [...new Set([draft.uid, String(draft.email ?? "").trim().toLowerCase()].filter(Boolean) as string[])];
  const saveLocal = async (): Promise<string> => {
    const xs = (await idbGet<IntakeRecord[]>("sk-demo-intakes")) || [];
    const id = draft.id ?? (whoKeys.length ? stableIdFor(whoKeys[0]) : `INTAKE-${Date.now()}`);
    const existing = xs.find((x) => x.id === id);
    const rec: IntakeRecord = { ...draft, id, createdAt: existing?.createdAt ?? now, updatedAt: now } as IntakeRecord;
    await idbSet("sk-demo-intakes", existing ? xs.map((x) => (x.id === id ? rec : x)) : [rec, ...xs]);
    return id;
  };
  if (!firebaseReady || !db) return saveLocal();
  // Mirror successful remote saves into the local cache — instant/offline reads,
  // and consistent with the saveLocal fallback records.
  const mirrorLocal = async (id: string): Promise<string> => {
    try {
      const xs = (await idbGet<IntakeRecord[]>("sk-demo-intakes")) || [];
      const existing = xs.find((x) => x.id === id);
      const rec: IntakeRecord = { ...draft, id, createdAt: existing?.createdAt ?? now, updatedAt: now } as IntakeRecord;
      await idbSet("sk-demo-intakes", existing ? xs.map((x) => (x.id === id ? rec : x)) : [rec, ...xs]);
    } catch { /* cache is best-effort */ }
    return id;
  };
  try {
    if (draft.id && !draft.id.startsWith("INTAKE-")) {
      await updateDoc(doc(db, "intakes", draft.id), { ...payload, updatedAt: serverTimestamp() });
      return mirrorLocal(draft.id);
    }
    // No explicit id yet — claim the stable record for this (package, order, person).
    // updateDoc succeeds when the record already exists and rules allow the write;
    // otherwise we fall through and create it under the first stable id.
    for (const who of whoKeys) {
      try {
        const sid = stableIdFor(who);
        await updateDoc(doc(db, "intakes", sid), { ...payload, updatedAt: serverTimestamp() });
        return mirrorLocal(sid);
      } catch { /* not found or not permitted — try the next identity */ }
    }
    if (whoKeys.length) {
      const sid = stableIdFor(whoKeys[0]);
      await setDoc(doc(db, "intakes", sid), { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      return mirrorLocal(sid);
    }
    const refDoc = await addDoc(collection(db, "intakes"), { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return mirrorLocal(refDoc.id);
  } catch (err) {
    console.warn("saveIntake Firestore error (saved locally):", err);
    return saveLocal();
  }
}

export async function listMyIntakes(user: User | null): Promise<IntakeRecord[]> {
  if (!firebaseReady || !db || !user) {
    return (await idbGet<IntakeRecord[]>("sk-demo-intakes")) || [];
  }
  try {
    const snap = await getDocs(query(collection(db, "intakes"), where("uid", "==", user.uid)));
    return snap.docs
      .map((d) => normalizeIntake(d.id, d.data()))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return (await idbGet<IntakeRecord[]>("sk-demo-intakes")) || [];
  }
}

export async function listAllIntakes(): Promise<IntakeRecord[]> {
  if (!firebaseReady || !db) {
    return (await idbGet<IntakeRecord[]>("sk-demo-intakes")) || [];
  }
  try {
    const snap = await getDocs(query(collection(db, "intakes"), orderBy("updatedAt", "desc")));
    const firestoreIntakes = snap.docs.map((d) => normalizeIntake(d.id, d.data()));
    const localIntakes = (await idbGet<IntakeRecord[]>("sk-demo-intakes")) || [];
    const intakeMap = new Map<string, IntakeRecord>();
    firestoreIntakes.forEach((i) => intakeMap.set(i.id, i));
    localIntakes.forEach((i) => { if (!intakeMap.has(i.id)) intakeMap.set(i.id, i); });
    return Array.from(intakeMap.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return (await idbGet<IntakeRecord[]>("sk-demo-intakes")) || [];
  }
}

/** Real-time subscriber for all intakes (Studio Admin). */
export function subscribeAllIntakes(callback: (intakes: IntakeRecord[]) => void): () => void {
  let unsubFirestore: (() => void) | null = null;
  let active = true;

  const fetchAndNotify = async () => {
    const intakes = await listAllIntakes();
    if (active) callback(intakes);
  };

  if (firebaseReady && db) {
    try {
      const q = query(collection(db, "intakes"), orderBy("updatedAt", "desc"));
      unsubFirestore = onSnapshot(
        q,
        async (snap) => {
          if (!active) return;
          const firestoreIntakes = snap.docs.map((d) => normalizeIntake(d.id, d.data()));
          const localIntakes = (await idbGet<IntakeRecord[]>("sk-demo-intakes")) || [];
          const intakeMap = new Map<string, IntakeRecord>();
          firestoreIntakes.forEach((i) => intakeMap.set(i.id, i));
          localIntakes.forEach((i) => { if (!intakeMap.has(i.id)) intakeMap.set(i.id, i); });
          callback(Array.from(intakeMap.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
        },
        () => { void fetchAndNotify(); }
      );
    } catch {
      void fetchAndNotify();
    }
  } else {
    void fetchAndNotify();
  }

  const handleLocalEvent = () => { void fetchAndNotify(); };
  window.addEventListener("sk-intake-submitted", handleLocalEvent);
  window.addEventListener("sk-intake-updated", handleLocalEvent);
  window.addEventListener("storage", handleLocalEvent);

  const interval = setInterval(() => { void fetchAndNotify(); }, 10000);

  return () => {
    active = false;
    if (unsubFirestore) unsubFirestore();
    window.removeEventListener("sk-intake-submitted", handleLocalEvent);
    window.removeEventListener("sk-intake-updated", handleLocalEvent);
    window.removeEventListener("storage", handleLocalEvent);
    clearInterval(interval);
  };
}

export async function setIntakeStatus(id: string, status: IntakeStatus): Promise<void> {
  // Local mirror first (covers demo mode and locally-saved fallback records)
  if (!firebaseReady || !db || id.startsWith("INTAKE-")) {
    const xs = (await idbGet<IntakeRecord[]>("sk-demo-intakes")) || [];
    await idbSet("sk-demo-intakes", xs.map((x) => (x.id === id ? { ...x, status, updatedAt: new Date().toISOString() } : x)));
    window.dispatchEvent(new CustomEvent("sk-intake-updated"));
  }
  if (firebaseReady && db && !id.startsWith("INTAKE-")) {
    try {
      await updateDoc(doc(db, "intakes", id), { status, updatedAt: serverTimestamp() });
      window.dispatchEvent(new CustomEvent("sk-intake-updated"));
    } catch (err) {
      console.warn("setIntakeStatus error:", err);
    }
  }
}

/** Claim guest intakes (placed before sign-up) by email — mirrors claimOrders. */
export async function claimIntakes(user: User): Promise<number> {
  if (!firebaseReady || !db || !user.email) return 0;
  try {
    const q = query(collection(db, "intakes"), where("email", "==", user.email), where("uid", "==", null));
    const snap = await getDocs(q);
    await Promise.all(snap.docs.map((d) => updateDoc(d.ref, { uid: user.uid })));
    return snap.docs.length;
  } catch {
    return 0;
  }
}

/* ---------------- intake asset uploads ---------------- */

const INTAKE_ACCEPTED = ["jpg", "jpeg", "png", "webp", "svg", "gif", "pdf", "doc", "docx", "zip", "ai", "psd", "mp4", "mp3", "txt"];
const INTAKE_MAX_MB = 25;

export function validateIntakeFile(f: File): string | null {
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  if (!INTAKE_ACCEPTED.includes(ext)) return `${f.name}: type not accepted (${INTAKE_ACCEPTED.join(", ")})`;
  if (f.size > INTAKE_MAX_MB * 1024 * 1024) return `${f.name}: exceeds ${INTAKE_MAX_MB}MB`;
  return null;
}

/** Upload one asset for an intake; falls back to local IndexedDB binary storage. */
export async function uploadIntakeAsset(intakeId: string, file: File, kind: string): Promise<IntakeAsset> {
  const path = `intakes/${intakeId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
  if (firebaseReady && storage) {
    try {
      await uploadBytes(ref(storage, path), file);
      return { name: file.name, size: file.size, path, kind };
    } catch (err) {
      console.warn("Intake asset storage upload failed, using local fallback:", err);
    }
  }
  try {
    const buf = await file.arrayBuffer();
    const localKey = `local://${path}`;
    await storeLocalBinary(localKey, buf);
    return { name: file.name, size: file.size, path: localKey, kind };
  } catch {
    return { name: file.name, size: file.size, kind };
  }
}
