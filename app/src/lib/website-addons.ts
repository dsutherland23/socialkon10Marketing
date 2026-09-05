/* ------------------------------------------------------------------
   WEBSITE ADD-ON CATALOG + PRICING ENGINE (PRD: Web + Digital
   Add-On & Website Configurator v1.0.0)
   SINGLE SOURCE OF TRUTH for all website add-ons: categories,
   prices, eligibility, dependencies, conflicts, quantity rules.
   UI components must never hard-code prices — they read this file.
   Base package prices live in data.ts and are untouched.
------------------------------------------------------------------- */

export type WebPackageId = "SK-WEB-01" | "SK-WEB-02" | "SK-WEB-03" | "SK-WEB-04";

export interface WebAddon {
  id: string;
  name: string;
  desc: string;
  categoryId: string;
  price: number;                 // USD
  pricePrefix?: "from";
  priceSuffix?: string;          // e.g. " / page", " / product"
  billing: "one_time" | "monthly";
  eligible: WebPackageId[];
  popular?: boolean;
  requires?: string[];           // dependency add-on ids
  conflicts?: string[];          // mutually exclusive add-on ids
  qtyEnabled?: boolean;
  maxQty?: number;
}

export interface AddonCategory {
  id: string;
  name: string;
  icon: string;                  // minimal glyph key
  desc: string;
  advanced?: boolean;            // progressive disclosure: hidden behind "more"
  addons: WebAddon[];
}

const ALL3: WebPackageId[] = ["SK-WEB-01", "SK-WEB-02", "SK-WEB-03"];
const STD_UP: WebPackageId[] = ["SK-WEB-02", "SK-WEB-03"];
const ECOM: WebPackageId[] = ["SK-WEB-03"];

export const UPGRADE_MESSAGE = "This feature is available with a Standard Business Website or higher.";

/** All website add-on categories — seed data. Admin overrides are merged at runtime via WebsiteAddonsCatalogProvider. */
export const WEB_ADDON_CATEGORIES: AddonCategory[] = [
  {
    id: "website_expansion", name: "Website Expansion", icon: "layers",
    desc: "Add more pages, content systems and business sections.",
    addons: [
      { id: "additional_standard_page", name: "Additional Standard Page", desc: "Add another professionally designed website page.", categoryId: "website_expansion", price: 150, billing: "one_time", eligible: ALL3, popular: true, qtyEnabled: true },
      { id: "additional_premium_page", name: "Additional Premium Page", desc: "A more customized, content-heavy or conversion-focused page.", categoryId: "website_expansion", price: 250, billing: "one_time", eligible: ALL3, qtyEnabled: true },
      { id: "conversion_landing_page", name: "High-Converting Landing Page", desc: "Dedicated landing page designed around a specific campaign or conversion goal.", categoryId: "website_expansion", price: 300, billing: "one_time", eligible: ALL3, popular: true },
      { id: "blog_system", name: "Blog / News System", desc: "Add a structured publishing system for articles, news and updates.", categoryId: "website_expansion", price: 250, billing: "one_time", eligible: STD_UP },
      { id: "portfolio_gallery", name: "Portfolio / Project Gallery", desc: "Showcase projects, work, case studies or visual portfolios.", categoryId: "website_expansion", price: 200, billing: "one_time", eligible: ALL3 },
      { id: "testimonials_system", name: "Testimonials / Reviews System", desc: "Create a structured testimonial or customer review section.", categoryId: "website_expansion", price: 100, billing: "one_time", eligible: ALL3 },
      { id: "faq_system", name: "FAQ / Knowledge Section", desc: "Add a structured FAQ system with expandable answers.", categoryId: "website_expansion", price: 100, billing: "one_time", eligible: ALL3 },
      { id: "team_directory", name: "Team / Staff Directory", desc: "Display staff members, leadership or team profiles.", categoryId: "website_expansion", price: 150, billing: "one_time", eligible: STD_UP },
      { id: "client_portal", name: "Client Portal / Member Dashboard", desc: "Secure password-protected client dashboard for document sharing, order history, project updates, and account management.", categoryId: "website_expansion", price: 1500, billing: "one_time", eligible: STD_UP, popular: true },
      { id: "multi_language", name: "Multi-Language & Localization", desc: "Full multi-lingual translation setup with language switcher, regional currency support, and localized international SEO.", categoryId: "website_expansion", price: 1500, billing: "one_time", eligible: STD_UP },
      { id: "turnkey_launch_pack", name: "Complete Turnkey Launch Suite", desc: "All-in-one execution: full professional copywriting across all pages, custom visual assets, advanced technical SEO rollout, and 30-day dedicated post-launch support.", categoryId: "website_expansion", price: 1500, billing: "one_time", eligible: STD_UP, popular: true },
    ],
  },
  {
    id: "lead_generation", name: "Lead Generation", icon: "target",
    desc: "Turn website visitors into qualified leads and inquiries.",
    addons: [
      { id: "advanced_lead_capture", name: "Advanced Lead Capture", desc: "Upgrade the standard contact form into a more powerful lead capture experience.", categoryId: "lead_generation", price: 150, billing: "one_time", eligible: ALL3, popular: true },
      { id: "quote_request_system", name: "Quote Request System", desc: "Let customers submit structured quote requests.", categoryId: "lead_generation", price: 250, billing: "one_time", eligible: ALL3 },
      { id: "instant_quote_calculator", name: "Interactive Scope & Price Calculator", desc: "Custom dynamic price estimator widget allowing visitors to select features and calculate instant quotes on-page.", categoryId: "lead_generation", price: 450, billing: "one_time", eligible: ALL3, popular: true },
      { id: "booking_system", name: "Booking System", desc: "Allow customers to request or schedule appointments online.", categoryId: "lead_generation", price: 300, billing: "one_time", eligible: ALL3, popular: true },
      { id: "booking_payment", name: "Advanced Booking + Payments", desc: "Booking, availability, deposits and online payment functionality.", categoryId: "lead_generation", price: 500, billing: "one_time", eligible: STD_UP },
      { id: "custom_booking_platform", name: "Enterprise Dispatch & Booking Platform", desc: "Complete customized multi-calendar booking platform with staff assignments, route/dispatch logic, automated WhatsApp/SMS reminders, and deposit payments.", categoryId: "lead_generation", price: 1500, billing: "one_time", eligible: STD_UP },
    ],
  },
  {
    id: "communication", name: "WhatsApp & Communication", icon: "chat",
    desc: "Make it easier for customers to contact and engage with the business.",
    addons: [
      { id: "whatsapp_integration", name: "WhatsApp Integration", desc: "Add a professional click-to-chat WhatsApp experience.", categoryId: "communication", price: 100, billing: "one_time", eligible: ALL3, popular: true },
      { id: "live_chat_widget", name: "Floating Omnichannel Chat Widget", desc: "Unified interactive floating chat bubble with instant WhatsApp, Messenger, phone, and inquiry triggers with custom greeting.", categoryId: "communication", price: 150, billing: "one_time", eligible: ALL3, popular: true },
      { id: "whatsapp_lead_capture", name: "WhatsApp Lead Capture", desc: "Route structured customer inquiries into WhatsApp.", categoryId: "communication", price: 200, billing: "one_time", eligible: ALL3 },
      { id: "whatsapp_automation", name: "WhatsApp Automation", desc: "Automate qualifying, notifications and customer communication.", categoryId: "communication", price: 350, pricePrefix: "from", billing: "one_time", eligible: STD_UP, requires: ["whatsapp_integration"] },
    ],
  },
  {
    id: "seo_visibility", name: "SEO & Visibility", icon: "search",
    desc: "Improve search visibility and local discoverability.",
    addons: [
      { id: "seo_growth", name: "SEO Growth", desc: "Keyword research and deeper page-level SEO optimization.", categoryId: "seo_visibility", price: 350, billing: "one_time", eligible: ALL3, popular: true },
      { id: "local_seo", name: "Local SEO", desc: "Optimize the website and local presence for location-based searches.", categoryId: "seo_visibility", price: 450, billing: "one_time", eligible: ALL3 },
      { id: "seo_growth_management", name: "Ongoing SEO Management", desc: "Continuous SEO monitoring and optimization.", categoryId: "seo_visibility", price: 300, pricePrefix: "from", billing: "monthly", eligible: [...ALL3, "SK-WEB-04"] },
    ],
  },
  {
    id: "analytics_tracking", name: "Analytics & Conversion", icon: "chart",
    desc: "Measure what visitors do and understand how your website performs.",
    addons: [
      { id: "analytics_setup", name: "Google Analytics 4", desc: "Install and configure Google Analytics.", categoryId: "analytics_tracking", price: 100, billing: "one_time", eligible: ALL3, conflicts: ["marketing_analytics_pack"] },
      { id: "search_console", name: "Google Search Console", desc: "Configure Search Console and indexing monitoring.", categoryId: "analytics_tracking", price: 75, billing: "one_time", eligible: ALL3, conflicts: ["marketing_analytics_pack"] },
      { id: "marketing_analytics_pack", name: "Marketing Analytics Pack", desc: "Analytics, Search Console, Meta Pixel and conversion tracking.", categoryId: "analytics_tracking", price: 300, billing: "one_time", eligible: ALL3, popular: true, conflicts: ["analytics_setup", "search_console", "meta_pixel", "conversion_tracking"] },
      { id: "conversion_tracking", name: "Conversion Tracking", desc: "Track important actions such as form submissions, calls and key CTAs.", categoryId: "analytics_tracking", price: 150, billing: "one_time", eligible: ALL3, conflicts: ["marketing_analytics_pack"] },
      { id: "meta_pixel", name: "Meta Pixel", desc: "Install and configure Meta Pixel tracking.", categoryId: "analytics_tracking", price: 100, billing: "one_time", eligible: ALL3, conflicts: ["marketing_analytics_pack"] },
    ],
  },
  {
    id: "performance", name: "Performance", icon: "zap",
    desc: "Make the website faster and more efficient.",
    addons: [
      { id: "speed_boost", name: "Speed Boost", desc: "Performance optimization focused on speed and Core Web Vitals.", categoryId: "performance", price: 200, billing: "one_time", eligible: ALL3, popular: true, conflicts: ["performance_pro"] },
      { id: "performance_pro", name: "Performance PRO", desc: "Deeper performance optimization for demanding websites.", categoryId: "performance", price: 350, billing: "one_time", eligible: STD_UP, conflicts: ["speed_boost"] },
    ],
  },
  {
    id: "content", name: "Content", icon: "pen", advanced: true,
    desc: "Professional content designed to communicate clearly and convert.",
    addons: [
      { id: "copywriting", name: "Professional Copywriting", desc: "Conversion-focused copywriting for website pages.", categoryId: "content", price: 150, priceSuffix: " / page", billing: "one_time", eligible: ALL3, qtyEnabled: true, conflicts: ["website_copy_package"] },
      { id: "website_copy_package", name: "Website Copy Package", desc: "Professional copywriting for up to 5 pages.", categoryId: "content", price: 600, billing: "one_time", eligible: STD_UP, conflicts: ["copywriting"] },
      { id: "visual_content_pack", name: "Visual Content Pack", desc: "Custom graphics, image sourcing and website visual support.", categoryId: "content", price: 400, billing: "one_time", eligible: ALL3 },
      { id: "video_motion_showcase", name: "Video & Motion Media Showcase", desc: "Interactive video hero reels, before/after comparison sliders, and dynamic animated media sections.", categoryId: "content", price: 350, billing: "one_time", eligible: ALL3, popular: true },
    ],
  },
  {
    id: "ecommerce_expansion", name: "E-Commerce Expansion", icon: "cart", advanced: true,
    desc: "Scale an ecommerce website beyond the included store functionality.",
    addons: [
      { id: "additional_10_products", name: "Additional 10 Products", desc: "Add another 10 products beyond the included catalog.", categoryId: "ecommerce_expansion", price: 150, billing: "one_time", eligible: ECOM, conflicts: ["additional_25_products", "additional_50_products"] },
      { id: "additional_25_products", name: "Additional 25 Products", desc: "Add another 25 products beyond the included catalog.", categoryId: "ecommerce_expansion", price: 300, billing: "one_time", eligible: ECOM, conflicts: ["additional_10_products", "additional_50_products"] },
      { id: "additional_50_products", name: "Additional 50 Products", desc: "Add another 50 products beyond the included catalog.", categoryId: "ecommerce_expansion", price: 500, billing: "one_time", eligible: ECOM, conflicts: ["additional_10_products", "additional_25_products"] },
      { id: "product_data_entry", name: "Product Upload / Data Entry", desc: "Professional product setup and data entry.", categoryId: "ecommerce_expansion", price: 10, priceSuffix: " / product", billing: "one_time", eligible: ECOM, qtyEnabled: true },
      { id: "advanced_inventory", name: "Advanced Inventory", desc: "More advanced inventory functionality.", categoryId: "ecommerce_expansion", price: 300, billing: "one_time", eligible: ECOM },
      { id: "shipping_calculator", name: "Shipping Calculator", desc: "Add shipping rules and calculation functionality.", categoryId: "ecommerce_expansion", price: 200, billing: "one_time", eligible: ECOM },
      { id: "local_delivery", name: "Local Delivery System", desc: "Configure local delivery zones, rules or workflows.", categoryId: "ecommerce_expansion", price: 250, billing: "one_time", eligible: ECOM },
      { id: "discount_system", name: "Discount / Coupon System", desc: "Create coupon and promotional discount functionality.", categoryId: "ecommerce_expansion", price: 150, billing: "one_time", eligible: ECOM },
      { id: "subscriptions", name: "Subscription Products", desc: "Sell recurring products or services online.", categoryId: "ecommerce_expansion", price: 400, pricePrefix: "from", billing: "one_time", eligible: ECOM },
      { id: "abandoned_cart", name: "Abandoned Cart Recovery", desc: "Recover incomplete purchases through automated follow-up.", categoryId: "ecommerce_expansion", price: 250, billing: "one_time", eligible: ECOM },
      { id: "loyalty_system", name: "Customer Loyalty System", desc: "Add customer rewards or loyalty functionality.", categoryId: "ecommerce_expansion", price: 350, pricePrefix: "from", billing: "one_time", eligible: ECOM },
      { id: "pos_integration", name: "POS Integration", desc: "Connect the online store with a compatible point-of-sale system.", categoryId: "ecommerce_expansion", price: 500, pricePrefix: "from", billing: "one_time", eligible: ECOM },
    ],
  },
  {
    id: "integrations_automation", name: "Integrations & Automation", icon: "flow", advanced: true,
    desc: "Connect the website to the tools your business already uses.",
    addons: [
      { id: "email_marketing", name: "Email Marketing Integration", desc: "Connect the website to an email marketing platform.", categoryId: "integrations_automation", price: 200, billing: "one_time", eligible: ALL3 },
      { id: "crm_integration", name: "CRM Integration", desc: "Connect website leads to a compatible CRM.", categoryId: "integrations_automation", price: 300, pricePrefix: "from", billing: "one_time", eligible: STD_UP, popular: true },
      { id: "automation_workflow", name: "Marketing Automation", desc: "Automate lead capture, notifications and follow-up workflows.", categoryId: "integrations_automation", price: 500, pricePrefix: "from", billing: "one_time", eligible: STD_UP },
      { id: "zapier_make", name: "Zapier / Make Automation", desc: "Connect website actions to external business workflows.", categoryId: "integrations_automation", price: 250, pricePrefix: "from", billing: "one_time", eligible: STD_UP },
      { id: "custom_api", name: "Custom API Integration", desc: "Connect the website to a third-party service or custom API.", categoryId: "integrations_automation", price: 500, pricePrefix: "from", billing: "one_time", eligible: STD_UP },
      { id: "enterprise_crm_erp", name: "Enterprise CRM & ERP Bi-Directional Integration", desc: "Full 2-way real-time data sync connecting website leads and orders to Salesforce, HubSpot, Zoho, QuickBooks, or custom internal ERPs.", categoryId: "integrations_automation", price: 1500, billing: "one_time", eligible: STD_UP, popular: true },
    ],
  },
  {
    id: "ai_features", name: "AI & Intelligent Features", icon: "spark", advanced: true,
    desc: "Add modern AI-powered experiences to the website.",
    addons: [
      { id: "ai_website_assistant", name: "AI Website Assistant", desc: "AI-powered website assistant trained around approved business information.", categoryId: "ai_features", price: 500, billing: "one_time", eligible: STD_UP },
      { id: "ai_lead_qualification", name: "AI Lead Qualification", desc: "Use AI to qualify visitors and collect structured lead information.", categoryId: "ai_features", price: 750, pricePrefix: "from", billing: "one_time", eligible: STD_UP },
      { id: "geo_optimization", name: "AI Search / GEO Optimization", desc: "Optimize site structure and content for AI-powered search and answer engines.", categoryId: "ai_features", price: 400, billing: "one_time", eligible: STD_UP },
    ],
  },
  {
    id: "security", name: "Security", icon: "shield", advanced: true,
    desc: "Add additional protection, privacy compliance, and accessibility monitoring.",
    addons: [
      { id: "security_pro", name: "Security PRO", desc: "Security hardening, bot protection, spam protection and monitoring setup.", categoryId: "security", price: 200, billing: "one_time", eligible: ALL3 },
      { id: "cookie_consent_privacy", name: "GDPR & CCPA Privacy Consent Suite", desc: "Compliant geo-targeted cookie banner, user preference center, consent logs, and auto-updated legal policy integration.", categoryId: "security", price: 175, billing: "one_time", eligible: ALL3, popular: true },
      { id: "ada_accessibility", name: "ADA & WCAG 2.1 Accessibility Hardening", desc: "Full accessibility compliance overhaul with high-contrast toggle, screen-reader markup, keyboard focus flow, and accessibility statement.", categoryId: "security", price: 350, billing: "one_time", eligible: ALL3 },
    ],
  },
  {
    id: "maintenance_support", name: "Maintenance & Support", icon: "wrench", advanced: true,
    desc: "Ongoing maintenance, bug fixes and priority support beyond the base care plan.",
    addons: [
      { id: "monthly_content_updates", name: "Monthly Content Updates", desc: "Regular text, image and content updates handled for you each month.", categoryId: "maintenance_support", price: 150, priceSuffix: " / hr", billing: "monthly" as const, eligible: ["SK-WEB-02", "SK-WEB-03", "SK-WEB-04"] as WebPackageId[], popular: true },
      { id: "priority_bug_fixes", name: "Priority Bug Fixing", desc: "Fast-response bug investigation and resolution with documented fixes.", categoryId: "maintenance_support", price: 100, priceSuffix: " / hr", billing: "one_time" as const, eligible: ["SK-WEB-01", "SK-WEB-02", "SK-WEB-03", "SK-WEB-04"] as WebPackageId[] },
      { id: "emergency_support", name: "Emergency Support", desc: "Same-day emergency response for critical website issues.", categoryId: "maintenance_support", price: 200, pricePrefix: "from" as const, billing: "one_time" as const, eligible: ["SK-WEB-01", "SK-WEB-02", "SK-WEB-03", "SK-WEB-04"] as WebPackageId[] },
      { id: "third_party_integrations", name: "Third-Party Integration", desc: "Connect and configure third-party tools, services and APIs.", categoryId: "maintenance_support", price: 250, pricePrefix: "from" as const, billing: "one_time" as const, eligible: ["SK-WEB-02", "SK-WEB-03"] as WebPackageId[] },
      { id: "monthly_security_maintenance_retainer", name: "Monthly Maintenance & Security Retainer", desc: "Comprehensive continuous care: scheduled CMS/plugin core updates, weekly off-site cloud backups, malware/security scanning, and 2 dedicated support hours every month.", categoryId: "maintenance_support", price: 250, billing: "monthly" as const, eligible: ["SK-WEB-01", "SK-WEB-02", "SK-WEB-03", "SK-WEB-04"] as WebPackageId[], popular: true },
    ],
  },
  {
    id: "marketing_intelligence", name: "Marketing Intelligence", icon: "eye", advanced: true,
    desc: "Deeper visitor insight tools to understand behavior and improve conversions.",
    addons: [
      { id: "heatmap_session_recording", name: "Heatmap & Session Recording", desc: "Install and configure heatmap and session recording tools to see exactly how visitors interact.", categoryId: "marketing_intelligence", price: 150, billing: "one_time" as const, eligible: ["SK-WEB-01", "SK-WEB-02", "SK-WEB-03"] as WebPackageId[], popular: true },
      { id: "ab_testing_setup", name: "A/B Testing Setup", desc: "Configure split-testing experiments on key pages and CTAs.", categoryId: "marketing_intelligence", price: 300, pricePrefix: "from" as const, billing: "one_time" as const, eligible: ["SK-WEB-02", "SK-WEB-03"] as WebPackageId[] },
      { id: "visitor_intelligence_dashboard", name: "Visitor Intelligence Dashboard", desc: "Custom reporting dashboard combining analytics, heatmaps, conversions and traffic sources.", categoryId: "marketing_intelligence", price: 400, billing: "one_time" as const, eligible: ["SK-WEB-02", "SK-WEB-03"] as WebPackageId[], requires: ["analytics_setup"] },
    ],
  },
];

/* ---------------- lookups ---------------- */

export const ALL_WEB_ADDONS: WebAddon[] = WEB_ADDON_CATEGORIES.flatMap((c) => c.addons);
const BY_ID = new Map(ALL_WEB_ADDONS.map((a) => [a.id, a]));
export const addonById = (id: string): WebAddon | undefined => BY_ID.get(id);
export const addonEligibleFor = (a: WebAddon, pkg: WebPackageId): boolean => a.eligible.includes(pkg);

/** default categories shown first; advanced ones sit behind progressive disclosure */
export const DEFAULT_CATEGORIES = WEB_ADDON_CATEGORIES.filter((c) => !c.advanced);
export const ADVANCED_CATEGORIES = WEB_ADDON_CATEGORIES.filter((c) => c.advanced);

/* ---------------- selection engine ---------------- */

/** addonId → quantity (qty-enabled add-ons only; everything else is 1) */
export type AddonSelection = Record<string, number>;

const clampQty = (a: WebAddon, qty: number) =>
  Math.max(1, Math.min(a.maxQty ?? 100, Math.round(qty) || 1));

export interface ToggleResult {
  next: AddonSelection;
  /** human-readable explanations of anything the engine changed automatically */
  notes: string[];
}

/**
 * Toggle an add-on on/off with full rule enforcement:
 * - selecting a bundle auto-removes conflicting individual add-ons (with a note)
 * - selecting an add-on with requirements auto-adds its dependencies (with a note)
 * - removing a dependency also removes its dependents (with a note)
 */
export function toggleAddon(sel: AddonSelection, addon: WebAddon, customAddons?: WebAddon[]): ToggleResult {
  const pool = customAddons || ALL_WEB_ADDONS;
  const findAddon = (id: string) => pool.find((a) => a.id === id) || addonById(id);
  const notes: string[] = [];
  const next: AddonSelection = { ...sel };

  if (next[addon.id]) {
    // turning OFF — cascade to dependents
    delete next[addon.id];
    for (const other of pool) {
      if (next[other.id] && other.requires?.includes(addon.id)) {
        delete next[other.id];
        notes.push(`${other.name} was removed — it requires ${addon.name}.`);
      }
    }
    return { next, notes };
  }

  // turning ON — resolve conflicts first
  for (const conflictId of addon.conflicts ?? []) {
    if (next[conflictId]) {
      const c = findAddon(conflictId);
      delete next[conflictId];
      if (c) notes.push(`${c.name} was replaced — these features overlap, so ${addon.name} takes its place.`);
    }
  }
  next[addon.id] = addon.qtyEnabled ? clampQty(addon, next[addon.id] ?? 1) : 1;

  // auto-add dependencies
  for (const reqId of addon.requires ?? []) {
    if (!next[reqId]) {
      const req = findAddon(reqId);
      if (req) {
        next[reqId] = 1;
        notes.push(`${req.name} was added — ${addon.name} requires it.`);
      }
    }
  }
  return { next, notes };
}

export function setAddonQty(sel: AddonSelection, addon: WebAddon, qty: number): AddonSelection {
  if (!addon.qtyEnabled || !sel[addon.id]) return sel;
  return { ...sel, [addon.id]: clampQty(addon, qty) };
}

export interface PricedLine {
  addon: WebAddon;
  qty: number;
  lineTotal: number;             // USD, qty applied
}

export interface ConfigurationPrice {
  oneTime: number;               // USD — goes into the project total
  monthly: number;               // USD — recurring, always shown separately
  oneTimeLines: PricedLine[];
  monthlyLines: PricedLine[];
}

/** Price a selection. One-time and monthly are NEVER merged (PRD §addon_rules). */
export function priceConfiguration(sel: AddonSelection, customAddons?: WebAddon[]): ConfigurationPrice {
  const pool = customAddons || ALL_WEB_ADDONS;
  const findAddon = (id: string) => pool.find((a) => a.id === id) || addonById(id);
  const oneTimeLines: PricedLine[] = [];
  const monthlyLines: PricedLine[] = [];
  for (const [id, qty] of Object.entries(sel)) {
    const addon = findAddon(id);
    if (!addon) continue;
    const line = { addon, qty, lineTotal: addon.price * qty };
    (addon.billing === "monthly" ? monthlyLines : oneTimeLines).push(line);
  }
  return {
    oneTime: oneTimeLines.reduce((s, l) => s + l.lineTotal, 0),
    monthly: monthlyLines.reduce((s, l) => s + l.lineTotal, 0),
    oneTimeLines,
    monthlyLines,
  };
}

/** Price display helper: "from $X", "$X / page", "$X/mo" */
export function addonPriceLabel(a: WebAddon, money: (usd: number) => string): string {
  const base = `${a.pricePrefix === "from" ? "from " : ""}${money(a.price)}`;
  if (a.billing === "monthly") return `${base}/mo`;
  return `${base}${a.priceSuffix ?? ""}`;
}
