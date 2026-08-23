/* ------------------------------------------------------------------
   SOCIAL KON10 — CONTENT MODEL
   All purchasable items follow the PRD service-product model.
   Prices mirror the official 2026 rate sheet (USD, BMD at 1:1 peg).
------------------------------------------------------------------- */

export type DeptId = "brand" | "social" | "web";
export type PriceType = "fixed" | "starting" | "quote" | "consultation";
export type BillingType = "one_time" | "monthly" | "hourly";

export interface AddOn {
  id: string;
  name: string;
  price: number;
  priceType: PriceType;
}

export interface ServiceProduct {
  id: string;              // Product ID, e.g. SK-BR-01
  dept: DeptId;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  price: number;           // 0 when quote/consultation
  priceType: PriceType;
  currency: "USD";
  billing: BillingType;
  depositPct: number;      // configurable deposit percentage
  timeline: string;
  revisions: number;
  deliverables: string[];
  addons: AddOn[];
  featured?: boolean;
  seoTitle: string;
  seoDescription: string;
}

export interface Department {
  id: DeptId;
  index: string;           // /01
  name: string;
  shortName: string;
  path: string;
  headline: string;
  sub: string;
  cta: string;
  ctaSecondary: string;
  personality: string[];
}

export interface CaseStudy {
  challenge: string;
  strategy: string;
  creative: string;
  execution: string;
  result: string;
}

export interface Project {
  id: string;              // PROJECT_024 style
  slug: string;
  title: string;
  client: string;
  categories: string[];    // BRANDING / GRAPHIC / SOCIAL / WEB / EVENTS / CAMPAIGNS
  dept: DeptId;
  industry: string;
  year: string;
  services: string[];
  coverSeed: number;       // seeds the generative cover
  hue: number;             // project color theme
  summary: string;
  caseStudy: CaseStudy;
  featured?: boolean;
  image?: string;          // uploaded cover image URL (admin CMS) — overrides generative art
  liveUrl?: string;        // live site URL (admin CMS) — enables the contained Live Window preview
}

export interface Testimonial {
  name: string;
  company: string;
  service: DeptId;
  quote: string;
}

export interface FaqItem { q: string; a: string; dept?: DeptId | "checkout" }

export interface InsightPost {
  slug: string;
  title: string;
  category: string;
  minutes: number;
  excerpt: string;
  date: string;
  body: string[];        // paragraphs; lines starting with "## " render as subheads
}

/* ---------------- departments ---------------- */

export const DEPARTMENTS: Department[] = [
  {
    id: "brand",
    index: "/01",
    name: "Graphic + Brand",
    shortName: "Brand",
    path: "/graphic-design-branding",
    headline: "Make your brand impossible to ignore.",
    sub: "From logos to complete visual identities, we create brands that look professional, feel intentional and stay consistent everywhere your customers see you.",
    cta: "Explore brand services",
    ctaSecondary: "View brand work",
    personality: ["Artistic", "Premium", "Editorial", "Precise", "Bold"],
  },
  {
    id: "social",
    index: "/02",
    name: "Social + Marketing",
    shortName: "Social",
    path: "/social-media-marketing",
    headline: "Stop posting. Start growing.",
    sub: "Social media should do more than fill your feed. We create content, manage your community and build strategies designed to increase visibility, engagement and conversions.",
    cta: "View social packages",
    ctaSecondary: "See social work",
    personality: ["Energetic", "Editorial", "Fast", "Social-first", "Dynamic"],
  },
  {
    id: "web",
    index: "/03",
    name: "Web + Digital",
    shortName: "Web",
    path: "/website-design-development",
    headline: "Your website should work as hard as you do.",
    sub: "We design fast, responsive digital experiences that help businesses look credible, capture leads, sell products and turn visitors into customers.",
    cta: "Build my website",
    ctaSecondary: "See website work",
    personality: ["Digital", "Futuristic", "Clean", "Technical", "Premium"],
  },
];

/* ---------------- add-on library ---------------- */

const RUSH: AddOn = { id: "rush", name: "Rush production (under 72 hrs)", price: 0, priceType: "quote" }; // +25% handled at checkout
const EXTRA_REV: AddOn = { id: "extra-rev", name: "Additional revision round", price: 100, priceType: "fixed" };

/* ---------------- service products ---------------- */

export const SERVICES: ServiceProduct[] = [
  {
    id: "SK-BR-01",
    dept: "brand",
    slug: "logo-design",
    name: "Logo Design",
    tagline: "A mark that carries your business.",
    description: "Three initial concepts, two rounds of revisions and final vector + web files — a logo built to work everywhere your customers meet you.",
    price: 750,
    priceType: "fixed",
    currency: "USD",
    billing: "one_time",
    depositPct: 50,
    timeline: "7–10 business days",
    revisions: 2,
    deliverables: ["3 initial concepts", "2 revision rounds", "Primary logo", "Alternate logo", "Icon / mark", "Digital files", "Print-ready vector files"],
    addons: [{ id: "biz-cards", name: "Business card design", price: 200, priceType: "fixed" }, { id: "social-kit", name: "Social media avatar + banner kit", price: 250, priceType: "fixed" }, EXTRA_REV, RUSH],
    featured: true,
    seoTitle: "Logo Design Jamaica — Social Kon10 Marketing",
    seoDescription: "Professional logo design from $750. 3 concepts, 2 revision rounds, final vector and web files. Kingston, Jamaica creative agency.",
  },
  {
    id: "SK-BR-02",
    dept: "brand",
    slug: "brand-identity",
    name: "Complete Brand Identity",
    tagline: "A full visual system, not just a logo.",
    description: "Primary and secondary logos, brand color palette, typography guidelines, a brand style guide book and business card design — everything your brand needs to stay consistent.",
    price: 2500,
    priceType: "fixed",
    currency: "USD",
    billing: "one_time",
    depositPct: 50,
    timeline: "3–4 weeks",
    revisions: 3,
    deliverables: ["Primary + secondary logos", "Brand color palette", "Typography system", "Brand elements + patterns", "Social media assets", "Stationery + business card design", "Brand guidelines book"],
    addons: [{ id: "brand-strategy", name: "Brand strategy workshop", price: 0, priceType: "quote" }, { id: "social-kit", name: "Social media launch kit", price: 400, priceType: "fixed" }, EXTRA_REV],
    featured: true,
    seoTitle: "Brand Identity Package Jamaica — Social Kon10",
    seoDescription: "Complete brand identity package from $2,500. Logo system, palette, typography, guidelines and stationery.",
  },
  {
    id: "SK-BR-03",
    dept: "brand",
    slug: "event-branding",
    name: "Event Creative",
    tagline: "Design that connects and converts.",
    description: "Professional event branding and design — from first-time launches to festivals, concert tours and premium productions. Three tiers, one visual standard.",
    price: 750,
    priceType: "starting",
    currency: "USD",
    billing: "one_time",
    depositPct: 50,
    timeline: "7–10 business days",
    revisions: 3,
    deliverables: ["Event Starter — $750", "Event Pro — $1,500", "Event Signature — $2,750", "Event Essentials — $1,800"],
    addons: [RUSH, EXTRA_REV],
    featured: true,
    seoTitle: "Event Branding Packages — Social Kon10 Marketing",
    seoDescription: "Event branding packages from $750. Flyers, social graphics, tickets, banners and full event visual identity.",
  },
  {
    id: "SK-BR-04",
    dept: "brand",
    slug: "print-digital-collateral",
    name: "Print + Digital Collateral",
    tagline: "Every touchpoint, on brand.",
    description: "Flyers, posters, brochures, business cards, menus, presentations, social graphics, banners, signage and digital advertising — designed à la carte or as a system.",
    price: 200,
    priceType: "starting",
    currency: "USD",
    billing: "one_time",
    depositPct: 50,
    timeline: "3–7 business days",
    revisions: 2,
    deliverables: ["Business card design — $200", "Flyer / poster (print or digital) — $250", "Multi-page brochure / booklet — from $750", "Menus, presentations, banners, signage", "Digital advertising creative"],
    addons: [RUSH, EXTRA_REV],
    seoTitle: "Graphic Design Collateral Jamaica — Social Kon10",
    seoDescription: "Flyers, posters, brochures, business cards and digital advertising design from $200.",
  },
  {
    id: "SK-BR-05",
    dept: "brand",
    slug: "brand-strategy",
    name: "Brand Strategy",
    tagline: "Position before pixels.",
    description: "Brand positioning, audience definition, competitor review, personality, voice, messaging, visual direction and a brand roadmap — the thinking that makes the design work.",
    price: 0,
    priceType: "consultation",
    currency: "USD",
    billing: "one_time",
    depositPct: 50,
    timeline: "2–3 weeks",
    revisions: 2,
    deliverables: ["Brand positioning", "Audience definition", "Competitor review", "Brand personality + voice", "Messaging framework", "Visual direction", "Brand roadmap"],
    addons: [],
    seoTitle: "Brand Strategy Consulting — Social Kon10 Marketing",
    seoDescription: "Brand positioning, messaging and visual direction. Book a consultation.",
  },
  {
    id: "SK-SO-01",
    dept: "social",
    slug: "social-media-management",
    name: "Social Media Management",
    tagline: "Strategy, content, community — handled.",
    description: "Full monthly management: strategy, content calendar, creation, captions, publishing, community management, analytics and reporting.",
    price: 1200,
    priceType: "starting",
    currency: "USD",
    billing: "monthly",
    depositPct: 50,
    timeline: "Monthly retainer",
    revisions: 3,
    deliverables: ["Starter — $1,200/mo: 3 posts per week, caption writing, hashtag strategy, scheduling, monthly analytics", "Growth — $2,200/mo: 5 posts per week, active community management, 4 custom Reels/TikToks, paid ad campaign setup"],
    addons: [{ id: "ad-mgmt", name: "Paid ads management add-on", price: 0, priceType: "quote" }, { id: "extra-reels", name: "2 extra Reels/TikToks per month", price: 300, priceType: "fixed" }],
    featured: true,
    seoTitle: "Social Media Management Jamaica — from $1,200/mo",
    seoDescription: "Monthly social media management: content, captions, community management and reporting. Starter and Growth packages.",
  },
  {
    id: "SK-SO-02",
    dept: "social",
    slug: "social-content-bundle",
    name: "Social Media Design Bundle",
    tagline: "A month of content, designed at once.",
    description: "Ten custom-designed graphic templates for your Instagram/Facebook feed and stories every month. Assets only, no management.",
    price: 500,
    priceType: "fixed",
    currency: "USD",
    billing: "monthly",
    depositPct: 50,
    timeline: "Monthly delivery",
    revisions: 2,
    deliverables: ["10 custom graphic templates / month", "Feed + story formats", "Static posts and carousels", "Promotional and event campaign creative"],
    addons: [{ id: "extra-5", name: "5 additional templates", price: 200, priceType: "fixed" }, EXTRA_REV],
    seoTitle: "Social Media Content Design Jamaica — $500/mo",
    seoDescription: "10 custom social media templates per month. Feed and story graphics designed for your brand.",
  },
  {
    id: "SK-SO-03",
    dept: "social",
    slug: "paid-social-advertising",
    name: "Paid Social Advertising",
    tagline: "Built to increase qualified traffic, leads and conversions.",
    description: "Campaign strategy, audience research, ad creative, setup, testing, optimization, retargeting and performance reporting. We never promise guaranteed sales — we build campaigns engineered to perform.",
    price: 0,
    priceType: "quote",
    currency: "USD",
    billing: "monthly",
    depositPct: 50,
    timeline: "Monthly retainer",
    revisions: 3,
    deliverables: ["Campaign strategy", "Audience research", "Ad creative", "Campaign setup + testing", "Optimization + retargeting", "Performance reporting"],
    addons: [],
    seoTitle: "Social Media Advertising Jamaica — Social Kon10",
    seoDescription: "Paid social campaigns built to increase qualified traffic, leads and conversions. Request a quote.",
  },
  {
    id: "SK-WEB-01",
    dept: "web",
    slug: "landing-page",
    name: "Landing Page / One-Page Website",
    tagline: "One page. One job. Done well.",
    description: "Perfect for event launches, single products, campaigns and lead generation — a fast, focused page designed to convert.",
    price: 1500,
    priceType: "fixed",
    currency: "USD",
    billing: "one_time",
    depositPct: 50,
    timeline: "2–3 weeks",
    revisions: 3,
    deliverables: ["Custom one-page design", "Mobile-first responsive build", "Lead capture / contact form", "Basic on-page SEO", "Launch support"],
    addons: [{ id: "copywriting", name: "Conversion copywriting", price: 400, priceType: "fixed" }, RUSH],
    featured: true,
    seoTitle: "Landing Page Design Jamaica — $1,500",
    seoDescription: "High-converting landing pages and one-page websites from $1,500.",
  },
  {
    id: "SK-WEB-02",
    dept: "web",
    slug: "business-website",
    name: "Standard Business Website",
    tagline: "Credibility, captured.",
    description: "Up to six pages — Home, About, Services, Blog, Contact — with basic SEO setup and mobile optimization included.",
    price: 3500,
    priceType: "fixed",
    currency: "USD",
    billing: "one_time",
    depositPct: 50,
    timeline: "4–6 weeks",
    revisions: 3,
    deliverables: ["Up to 6 pages", "Custom design + development", "Basic SEO setup", "Mobile optimization", "Blog / insights setup", "Contact + quote forms"],
    addons: [{ id: "copywriting", name: "Website copywriting", price: 800, priceType: "fixed" }, { id: "care-plan", name: "Care plan — first 3 months", price: 600, priceType: "fixed" }],
    featured: true,
    seoTitle: "Business Website Design Jamaica — $3,500",
    seoDescription: "Professional business websites up to 6 pages with SEO setup and mobile optimization. From $3,500.",
  },
  {
    id: "SK-WEB-03",
    dept: "web",
    slug: "ecommerce-website",
    name: "E-Commerce Website",
    tagline: "Your store, open 24/7.",
    description: "Payment gateway integration, inventory setup for up to 20 products and automated customer receipts — a store built to sell.",
    price: 6500,
    priceType: "starting",
    currency: "USD",
    billing: "one_time",
    depositPct: 50,
    timeline: "6–8 weeks",
    revisions: 3,
    deliverables: ["Product catalog (up to 20 products)", "Checkout + payment integration", "Customer accounts", "Order management + inventory", "Automated email receipts", "Mobile optimization"],
    addons: [{ id: "extra-products", name: "Each additional 20 products", price: 500, priceType: "fixed" }, { id: "care-plan", name: "Care plan — first 3 months", price: 600, priceType: "fixed" }],
    featured: true,
    seoTitle: "Ecommerce Website Jamaica — from $6,500",
    seoDescription: "Ecommerce websites with payment integration, inventory and order management. From $6,500.",
  },
  {
    id: "SK-WEB-04",
    dept: "web",
    slug: "website-care-plan",
    name: "Website Care Plan",
    tagline: "Kept fast, secure and current.",
    description: "Monthly maintenance and support retainer: 2 hours of content updates, security monitoring and plugin updates.",
    price: 250,
    priceType: "fixed",
    currency: "USD",
    billing: "monthly",
    depositPct: 100,
    timeline: "Monthly retainer",
    revisions: 0,
    deliverables: ["2 hours of content updates / month", "Security monitoring", "Performance monitoring", "Plugin + system updates", "Priority support"],
    addons: [],
    seoTitle: "Website Maintenance Jamaica — $250/mo",
    seoDescription: "Website care plan: updates, security monitoring and maintenance from $250/month.",
  },
];

/* ---------------- event package tiers ---------------- */

export interface EventTier {
  id: string;
  name: string;
  price: number;
  tagline: string;
  bestFor: string;
  popular?: boolean;
  includes: string[];
}

export const EVENT_TIERS: EventTier[] = [
  {
    id: "event-starter",
    name: "Event Starter",
    price: 750,
    tagline: "Launch your event with impact & professionalism",
    bestFor: "Small / private events & first-time launches",
    includes: ["Main event flyer", "3 social media versions", "2 Instagram story designs", "Ticket / QR graphic", "Basic event visual direction", "Print-ready files", "Digital files", "2 revision rounds"],
  },
  {
    id: "event-pro",
    name: "Event Pro",
    price: 1500,
    tagline: "A complete visual identity for your event",
    bestFor: "Concerts, parties & mid-to-large events",
    popular: true,
    includes: ["Everything in Event Starter", "Custom event logo / wordmark", "Main promotional artwork", "6 social media graphics", "4 Instagram story designs", "2 artist / speaker reveal graphics", "2 countdown graphics", "Digital invitation", "Ticket / QR artwork", "Event schedule / lineup graphic", "1 large-format banner", "Sponsor promotional graphic", "Full event visual direction", "Source files", "3 revision rounds"],
  },
  {
    id: "event-signature",
    name: "Event Signature",
    price: 2750,
    tagline: "Complete event branding for major productions",
    bestFor: "Festivals, concert tours & premium events",
    includes: ["Everything in Event Pro", "Hero promotional artwork", "10 social media graphics", "6 Instagram story designs", "4 artist / speaker reveal graphics", "4 countdown graphics", "Digital invitation", "Ticket / QR graphics", "Full lineup / schedule design", "2 large-format banners", "Sponsor graphic system", "Event signage artwork", "Social media cover / banner", "Complete event visual identity", "Source / editable files", "3 revision rounds", "Priority production"],
  },
  {
    id: "event-essentials",
    name: "Event Essentials",
    price: 1800,
    tagline: "The essentials, bundled",
    bestFor: "Events that need identity + promo in one pass",
    includes: ["Event logo / theme identity", "5 promotional social media graphics", "Digital invitation / e-flyer design", "1 large physical venue banner design"],
  },
];

/* ---------------- social packages ---------------- */

export interface SocialTier {
  id: string;
  name: string;
  price: number;
  period: string;
  blurb: string;
  features: { label: string; value: string }[];
  popular?: boolean;
  quote?: boolean;
}

export const SOCIAL_TIERS: SocialTier[] = [
  {
    id: "social-starter",
    name: "Starter",
    price: 1200,
    period: "/month",
    blurb: "Consistent presence, professionally run.",
    features: [
      { label: "Posts per week", value: "3" },
      { label: "Platforms", value: "2" },
      { label: "Content mix", value: "Graphics + reels" },
      { label: "Caption writing", value: "Included" },
      { label: "Hashtag strategy", value: "Included" },
      { label: "Scheduling + publishing", value: "Included" },
      { label: "Community management", value: "—" },
      { label: "Analytics review", value: "Monthly" },
    ],
  },
  {
    id: "social-growth",
    name: "Growth",
    price: 2200,
    period: "/month",
    blurb: "Content, community and campaigns in one system.",
    popular: true,
    features: [
      { label: "Posts per week", value: "5" },
      { label: "Platforms", value: "3" },
      { label: "Custom Reels / TikToks", value: "4 / month" },
      { label: "Caption writing", value: "Included" },
      { label: "Community management", value: "Active (comments + DMs)" },
      { label: "Paid ad campaign setup", value: "Included" },
      { label: "Analytics review", value: "Monthly + insights" },
    ],
  },
  {
    id: "social-pro",
    name: "Pro",
    price: 0,
    period: "",
    blurb: "Multi-platform, campaign-heavy, always-on.",
    quote: true,
    features: [
      { label: "Posts per week", value: "Custom" },
      { label: "Platforms", value: "4+" },
      { label: "Video content", value: "Custom volume" },
      { label: "Paid advertising", value: "Full management" },
      { label: "Campaigns + launches", value: "Included" },
      { label: "Reporting", value: "Bi-weekly" },
    ],
  },
  {
    id: "social-custom",
    name: "Custom",
    price: 0,
    period: "",
    blurb: "Build your own package in the configurator.",
    quote: true,
    features: [
      { label: "Platform selection", value: "You choose" },
      { label: "Posts per week", value: "You choose" },
      { label: "Reels / stories", value: "Add as needed" },
      { label: "Community management", value: "Optional" },
      { label: "Ad management", value: "Optional add-on" },
    ],
  },
];

/* ---------------- portfolio (sample archive — replace via CMS) ---------------- */

export const PROJECTS: Project[] = [
  {
    id: "024",
    slug: "oasis-music-festival",
    title: "Oasis Music Festival",
    client: "Oasis Events JA",
    categories: ["EVENTS", "BRANDING", "SOCIAL", "CAMPAIGNS"],
    dept: "brand",
    industry: "Entertainment",
    year: "2026",
    services: ["Event Branding", "Social Campaign", "Digital Design"],
    coverSeed: 24,
    image: "/covers/oasis-music-festival.webp",
    hue: 226,
    summary: "A complete event identity and rollout system for a multi-day music festival.",
    caseStudy: {
      challenge: "A first-year festival needed to look established — sponsors expected polish, and ticket buyers decide in seconds on social.",
      strategy: "Build a flexible identity system first, then let every piece of content inherit it: one visual language from stage banner to Instagram story.",
      creative: "Custom wordmark, a high-contrast poster system, artist reveal templates and countdown graphics designed as one family.",
      execution: "Rolled out across print banners, tickets, QR touchpoints, a full social graphics suite and sponsor promotional assets.",
      result: "The full identity shipped ahead of the announcement cycle and carried every phase of the campaign. Detailed performance figures are shared during consultations.",
    },
    featured: true,
  },
  {
    id: "021",
    slug: "harbour-and-co",
    title: "Harbour & Co.",
    client: "Harbour & Co. Restaurant Group",
    categories: ["BRANDING", "GRAPHIC"],
    dept: "brand",
    industry: "Hospitality",
    year: "2025",
    services: ["Brand Identity", "Menus", "Signage"],
    coverSeed: 41,
    image: "/covers/harbour-and-co.webp",
    hue: 210,
    summary: "Full identity refresh for a Kingston restaurant group — logo system, menus, signage and collateral.",
    caseStudy: {
      challenge: "Three venues, three looks, no shared identity. The group read as separate businesses instead of one brand family.",
      strategy: "Create a parent identity with flexible sub-brand rules so each venue keeps its character inside one system.",
      creative: "New logo family, palette and typography, extended into menus, business cards, signage and social templates.",
      execution: "Delivered print-ready and digital files for all venues, with a brand guidelines book for in-house staff.",
      result: "One recognizable brand across every venue and touchpoint. Measured outcomes available on request.",
    },
    featured: true,
  },
  {
    id: "019",
    slug: "peak-performance-fitness",
    title: "Peak Performance Fitness",
    client: "Peak Performance Ltd.",
    categories: ["SOCIAL", "CAMPAIGNS"],
    dept: "social",
    industry: "Fitness",
    year: "2025",
    services: ["Social Management", "Content Creation", "Paid Social"],
    coverSeed: 7,
    image: "/covers/peak-performance-fitness.webp",
    hue: 14,
    summary: "Monthly content engine and paid campaigns for a growing gym brand.",
    caseStudy: {
      challenge: "Posting was irregular and purely promotional — the feed filled up but the business didn't move.",
      strategy: "Shift from announcements to a content system: training value, member stories and offers in a fixed weekly rhythm.",
      creative: "A repeatable template family for feed, stories and Reels with a bold, high-energy visual tone.",
      execution: "Five posts weekly, active community management and an always-on retargeting campaign.",
      result: "Steady audience growth and a measurable lift in trial-signup enquiries. Exact figures shared during consultation.",
    },
    featured: true,
  },
  {
    id: "017",
    slug: "coral-real-estate",
    title: "Coral Real Estate",
    client: "Coral Realty Group",
    categories: ["WEB", "BRANDING"],
    dept: "web",
    industry: "Real Estate",
    year: "2025",
    services: ["Business Website", "Brand Refresh"],
    coverSeed: 63,
    image: "/covers/coral-real-estate.webp",
    hue: 190,
    summary: "A six-page business website with listing-focused UX and lead capture.",
    caseStudy: {
      challenge: "The old site looked dated and leaked enquiries — no clear path from listing to contact.",
      strategy: "Treat every listing as a landing page: one property, one call to action, one form.",
      creative: "A clean, image-led design with a refreshed wordmark and a calmer, premium palette.",
      execution: "Six-page build with basic SEO setup, mobile optimization and enquiry tracking on every listing.",
      result: "A faster, clearer path from browsing to enquiry. Performance details available on request.",
    },
  },
  {
    id: "018",
    slug: "pinstripes-rentals",
    title: "Pinstripes Rentals",
    client: "Pinstripes Party & Event Rentals",
    categories: ["WEB"],
    dept: "web",
    industry: "Events & Rentals",
    year: "2026",
    services: ["Business Website", "Mobile Optimization"],
    coverSeed: 41,
    image: "/covers/pinstripes-rentals.webp",
    hue: 28,
    summary: "A business website for a party and event rentals company — built to turn browsers into bookings.",
    liveUrl: "https://pinstripesrentals.com/",
    caseStudy: {
      challenge: "Event rentals live or die on enquiry volume — the site needed to make browsing inventory and requesting a quote effortless on any device.",
      strategy: "Lead with the inventory and the occasions it serves, with a clear path from inspiration to enquiry on every page.",
      creative: "A bright, celebration-led look that keeps the focus on the products and the events they create.",
      execution: "Mobile-first build with clear calls to action, fast-loading pages and enquiry capture throughout.",
      result: "A live, working storefront for the rentals business — preview it in the contained Live Window on this page.",
    },
  },
  {
    id: "015",
    slug: "jamrock-eats",
    title: "Jamrock Eats",
    client: "Jamrock Eats",
    categories: ["WEB", "SOCIAL"],
    dept: "web",
    industry: "Food & Beverage",
    year: "2026",
    services: ["Ecommerce Website", "Social Launch"],
    coverSeed: 88,
    image: "/covers/jamrock-eats.webp",
    hue: 28,
    summary: "Ecommerce build and social launch for a Jamaican food brand selling direct.",
    caseStudy: {
      challenge: "Orders lived in DMs — manual, error-prone and impossible to scale.",
      strategy: "Move the menu online with checkout and automated receipts, then point all social traffic at it.",
      creative: "A warm, appetite-first storefront design with a matching social launch kit.",
      execution: "Ecommerce site with payment integration and inventory for the launch catalogue, plus a four-week social rollout.",
      result: "Direct online ordering replaced DM-based sales from week one. Figures shared during consultations.",
    },
    featured: true,
  },
  {
    id: "012",
    slug: "vertex-conference",
    title: "Vertex Conference",
    client: "Vertex Business Network",
    categories: ["EVENTS", "GRAPHIC"],
    dept: "brand",
    industry: "Corporate",
    year: "2025",
    services: ["Event Creative", "Collateral"],
    coverSeed: 12,
    image: "/covers/vertex-conference.webp",
    hue: 250,
    summary: "Speaker reveals, schedules, signage and stage graphics for a business conference.",
    caseStudy: {
      challenge: "A corporate conference needed to feel like a flagship production, not a hotel meeting.",
      strategy: "Borrow the language of music events — reveals, countdowns, lineups — and translate it to a corporate register.",
      creative: "Speaker reveal system, schedule graphics, wayfinding signage and stage screens in one identity.",
      execution: "Delivered digital and large-format print assets on a compressed production timeline.",
      result: "A cohesive event experience across screen, print and social. Outcomes available on request.",
    },
  },
  {
    id: "009",
    slug: "sol-y-mar-resort",
    title: "Sol y Mar Resort",
    client: "Sol y Mar",
    categories: ["SOCIAL"],
    dept: "social",
    industry: "Tourism",
    year: "2025",
    services: ["Social Management", "Content Bundle"],
    coverSeed: 31,
    image: "/covers/sol-y-mar-resort.webp",
    hue: 168,
    summary: "Always-on content program for a Caribbean resort's booking season.",
    caseStudy: {
      challenge: "Beautiful property, inconsistent feed — and peak booking season approaching.",
      strategy: "A seasonal content calendar built around booking windows, mixing property, experience and offer content.",
      creative: "A warm, editorial template family for feed and stories with strong photography direction.",
      execution: "Three posts weekly, monthly analytics reviews and campaign pushes around key dates.",
      result: "A consistent, booking-focused presence through the season. Measured results available on request.",
    },
  },
  {
    id: "006",
    slug: "atlas-logistics",
    title: "Atlas Logistics",
    client: "Atlas Logistics Ltd.",
    categories: ["WEB"],
    dept: "web",
    industry: "Logistics",
    year: "2026",
    services: ["Landing Page", "Care Plan"],
    coverSeed: 52,
    image: "/covers/atlas-logistics.webp",
    hue: 220,
    summary: "Recruitment-focused landing page with quote-request flow for a logistics firm.",
    caseStudy: {
      challenge: "Two audiences — shippers and drivers — arriving at one generic homepage.",
      strategy: "Split intent at the first screen: get a quote, or apply to drive.",
      creative: "A technical, grid-driven one-pager with a precise, engineered feel.",
      execution: "Two-week build with quote form, application form and analytics events on both paths.",
      result: "Both funnels measurable from launch day. Details shared during consultation.",
    },
  },
];

export const WORK_FILTERS = ["ALL", "BRANDING", "GRAPHIC", "SOCIAL", "WEB", "EVENTS", "CAMPAIGNS"];

/* ---------------- testimonials (contextual by department) ---------------- */

export const TESTIMONIALS: Testimonial[] = [
  { name: "Marketing Lead", company: "Oasis Events JA", service: "brand", quote: "The identity system carried our entire festival campaign. Every asset felt like it came from the same brain." },
  { name: "Owner", company: "Harbour & Co.", service: "brand", quote: "Three venues finally look like one family. The brand guidelines book alone was worth it." },
  { name: "Director", company: "Peak Performance Fitness", service: "social", quote: "Our feed went from random announcements to a real content engine. Enquiries followed." },
  { name: "Manager", company: "Sol y Mar Resort", service: "social", quote: "They run our socials like a newsroom — calendar, deadlines, reporting. We just approve." },
  { name: "Principal", company: "Coral Realty Group", service: "web", quote: "The new site turned listings into leads. The path from browsing to enquiry is finally obvious." },
  { name: "Founder", company: "Jamrock Eats", service: "web", quote: "Orders moved out of our DMs and into a real store within weeks of launch." },
];

/* ---------------- FAQs ---------------- */

export const FAQS: FaqItem[] = [
  { dept: "brand", q: "How many logo concepts do I receive?", a: "The Logo Design package includes 3 initial concepts and 2 rounds of revisions. The Complete Brand Identity expands that into a full logo system with primary and secondary marks." },
  { dept: "brand", q: "Do I own the final files?", a: "Yes. On final payment you receive the source and print-ready files, and full rights to the approved design." },
  { dept: "brand", q: "Can you match an existing look?", a: "Yes — we can extend an existing identity or refresh it. If the foundation is weak, we'll tell you honestly and show you the options." },
  { dept: "brand", q: "What's the difference between a logo and a brand identity?", a: "A logo is one mark. A brand identity is the full system — logo variations, colours, typography and usage rules — so everything you produce looks consistent without guessing." },
  { dept: "brand", q: "How long does a brand project take?", a: "Logo Design runs 7–10 business days; a Complete Brand Identity takes 3–4 weeks. Rush production under 72 hours is available on most design work at a 25% premium." },
  { dept: "brand", q: "Can you redesign my existing logo?", a: "Yes. We can refresh what you have while keeping its recognition, or rebuild from the ground up if the brand has outgrown it. We'll recommend one after reviewing your current assets." },
  { dept: "brand", q: "Do you design for both print and digital?", a: "Yes — every deliverable includes print-ready vector files and web-optimised digital formats, so the same design works on a billboard and a phone screen." },
  { dept: "social", q: "Do you create the content?", a: "Yes. Management packages include content creation — graphics, captions and, on Growth, custom Reels/TikToks. You approve everything before it publishes." },
  { dept: "social", q: "Do you guarantee sales or follower numbers?", a: "No — and be cautious of anyone who does. Our campaigns are built to increase qualified traffic, leads and conversions, and we report transparently every month." },
  { dept: "social", q: "Which platforms do you manage?", a: "Instagram, Facebook, TikTok and LinkedIn. Packages start at two platforms; Growth covers three, and Pro is configured around your audience." },
  { dept: "social", q: "Do I approve content before it goes live?", a: "Always. You receive your content calendar in advance each month, and nothing publishes without your sign-off. Revisions are part of the process, not an extra." },
  { dept: "social", q: "How soon should I expect results?", a: "Engagement and reach typically build within the first 60–90 days as the strategy compounds. Paid advertising can drive traffic and leads much faster — often within the first few weeks." },
  { dept: "social", q: "Can I run ads without monthly management?", a: "Yes. Paid Social Advertising is available as a standalone service — campaign setup, targeting, creative and ongoing optimization, scaled to your ad budget." },
  { dept: "social", q: "What do you need from me each month?", a: "Very little. After onboarding, most clients spend under an hour a month: approve the calendar, flag any promotions or news, and review the monthly report." },
  { dept: "web", q: "Do you provide hosting?", a: "Hosting, domains and third-party platform fees (e.g. Squarespace, Shopify) are billed directly to you — you always own your accounts. Our Care Plan then keeps everything updated, monitored and secure." },
  { dept: "web", q: "How long does a website take?", a: "Landing pages run 2–3 weeks, business sites 4–6 weeks, ecommerce 6–8 weeks. Rush production under 72 hours is available on design work at a 25% premium." },
  { dept: "web", q: "Will my site work on phones?", a: "Mobile optimization is included in every web package — we design mobile-first, not as an afterthought." },
  { dept: "web", q: "Do I own my website?", a: "Yes — completely. Your domain, hosting and accounts are registered in your name, and on final payment the finished site and its files are yours." },
  { dept: "web", q: "Can I update the site myself?", a: "Yes. We build on platforms you can edit without code, and we walk you through the basics at handover. If you'd rather never touch it, the Care Plan covers updates for you." },
  { dept: "web", q: "Will my site show up on Google?", a: "Every build includes SEO fundamentals — proper page structure, titles, descriptions, speed and mobile optimization. Ongoing ranking campaigns are available as a separate marketing engagement." },
  { dept: "web", q: "What happens after launch?", a: "You get a handover walkthrough and a support window for any launch issues. After that, the Care Plan keeps your site updated, backed up, monitored and secure — or you can maintain it yourself." },
  { dept: "checkout", q: "Do I have to pay everything upfront?", a: "No. A 50% non-refundable deposit secures your project kickoff; the balance is due upon final approval, before files are delivered. The Care Plan is billed monthly." },
  { dept: "checkout", q: "What payment methods do you accept?", a: "Credit and debit cards and PayPal. Prices are quoted in USD; Bermudian dollar (BMD) is accepted at the 1:1 peg. JMD and CAD display rates are available at checkout." },
  { dept: "checkout", q: "How many revisions are included?", a: "Flat-rate packages include up to 3 revision rounds (2 for Logo Design and content bundles). Additional rounds are billed at the standard hourly rate of $100." },
];

/* ---------------- insights ---------------- */

export const INSIGHTS: InsightPost[] = [
  {
    slug: "more-than-a-logo", title: "Why Your Business Needs More Than a Logo", category: "Branding", minutes: 6, date: "2026-01-12",
    excerpt: "A logo is a signature, not a system. Here's what a real identity does that a mark alone can't.",
    body: [
      "Every week, a business launches with a logo and calls it a brand. Six months later the same business is back — the logo looks fine on Instagram, but the flyer looks different, the website looks different again, and nothing feels like it belongs to the same company.",
      "That gap is the difference between a logo and an identity. A logo is one file. An identity is a system: a primary mark and its alternates, a color palette with rules, typography that pairs correctly, and guidance on how all of it behaves across print, screen and social.",
      "## What the system actually buys you",
      "Consistency is not an aesthetic luxury — it's a trust mechanism. Customers rarely compliment a consistent brand, but they absolutely notice an inconsistent one. Every mismatched touchpoint quietly taxes your credibility.",
      "A system also makes you faster. With templates, defined colors and locked typography, a Tuesday flyer no longer requires a design decision — it requires a decision about content. Your team stops reinventing and starts publishing.",
      "## When a logo alone is enough",
      "Honestly? Sometimes. If you're testing an idea with no revenue, a clean wordmark and a Canva account will carry you further than debt will. We tell startups this in consultations all the time.",
      "But the moment you have staff, signage, packaging, sponsorships or ads running, the cost of inconsistency overtakes the cost of the system. That's the inflection point where a real identity stops being an expense and starts being infrastructure.",
    ],
  },
  {
    slug: "branding-cost-jamaica", title: "How Much Does Branding Cost in Jamaica?", category: "Branding", minutes: 8, date: "2026-01-28",
    excerpt: "Honest numbers on what identity work costs, what drives the price, and where the money actually goes.",
    body: [
      "Ask five Jamaican designers what a logo costs and you'll get five answers between $50 and $5,000 USD. All of them are telling the truth — they're just selling different things.",
      "At the low end you're buying a mark: one concept, light revision, files at the end. At the professional end you're buying a process: discovery, strategy, multiple concepts, refinement, a full file system and guidelines. Neither is a scam. The question is which one your business actually needs.",
      "## What drives the price",
      "Three things move a branding quote more than anything else. First, scope — a logo is not a logo system, and a logo system is not an identity with stationery, social assets and guidelines. Second, stakeholder count — three decision-makers means three times the alignment work. Third, timeline — anything under two weeks carries a rush premium everywhere in the industry.",
      "## Realistic brackets",
      "In the Jamaican market today: a professional logo package typically starts around $750 USD. A complete identity — logo system, palette, typography, social assets, stationery and a guidelines book — starts around $2,500 USD. Event branding sits in between, scaled by how many assets the event needs.",
      "If a quote is dramatically below these brackets, ask what's excluded. If it's dramatically above, ask what the process includes. Both questions are fair, and any serious studio will answer them plainly.",
      "## The cheapest option is rarely the cheapest",
      "The most expensive branding we see isn't the $2,500 identity — it's the $150 logo that gets replaced three times in two years, with new signage, new menus and new uniforms each time. Buy the system once, and everything downstream gets cheaper.",
    ],
  },
  {
    slug: "social-management-vs-diy", title: "Social Media Management vs Doing It Yourself", category: "Social Media", minutes: 7, date: "2026-02-09",
    excerpt: "The real cost of DIY isn't money — it's consistency. A framework for deciding when to hand it over.",
    body: [
      "Nobody needs an agency to post on Instagram. The tools are free, the phone in your pocket shoots 4K, and you know your business better than any outsider ever will. So what are businesses actually paying for when they hire social media management?",
      "Not posting. They're paying for consistency, and for everything that has to happen before the post exists: strategy, a calendar, design, captions, scheduling, community replies and a monthly report that says what worked.",
      "## The DIY reality curve",
      "Week one of DIY is great. Week four, a supplier issue eats Tuesday and the post doesn't happen. Week eight, posting is 'whenever we remember.' The algorithm doesn't punish you for this — it simply stops rewarding you, and reach decays quietly.",
      "## A simple decision framework",
      "Keep it in-house if you genuinely have five to eight hours a week protected for content, someone on the team with a design eye, and a business where social is nice-to-have. Hand it over if social drives real revenue, if posting has already gone irregular, or if you're spending money on ads without a content engine behind them.",
      "The hybrid works too: some clients keep stories and behind-the-scenes content in-house — nobody does that better than the owner — while we run the calendar, campaigns and reporting. That split plays to both sides' strengths.",
      "## What good management looks like",
      "A content calendar you approve in advance. Consistent visual quality. Replies handled within a day. And a monthly report you can read in five minutes that tells you reach, engagement and what happens next month. If your provider can't show you all four, you're buying posts, not management.",
    ],
  },
  {
    slug: "website-that-converts", title: "What Makes a Website Actually Convert?", category: "Web Design", minutes: 9, date: "2026-02-20",
    excerpt: "Speed, clarity and one job per page. The unglamorous mechanics behind sites that sell.",
    body: [
      "The websites that convert best are rarely the ones that win design awards. They're the ones that load fast, say one thing clearly, and make the next step obvious. Conversion is engineering more than artistry.",
      "## Speed is the first impression",
      "Most of your visitors are on a phone, on a network that isn't fibre. Every second of load time costs you a measurable slice of them. This is why we optimize images, split code and treat animation budget as a performance decision, not a style choice.",
      "## One page, one job",
      "The most common conversion killer is a page trying to do five jobs. A landing page for your event should sell the event — not also introduce the company, list every service and link to your blog. Each additional choice you offer a visitor dilutes the one you actually want.",
      "Look at your homepage and count the calls to action. If there are more than two competing for the same screen, some of them are decoration, and decoration doesn't convert.",
      "## Clarity beats cleverness",
      "Within five seconds, a first-time visitor should be able to answer: what is this, is it for me, and what do I do next. Clever headlines that require a second read fail this test. Plain, confident language passes it.",
      "## Proof closes the gap",
      "After clarity comes evidence: real work, real clients, real numbers where you have them. A visitor who understands your offer and believes your proof has only one question left — how to start. Make sure that answer is a button, not a scavenger hunt.",
    ],
  },
  {
    slug: "brand-sponsors-want", title: "How to Build a Brand Sponsors Want to Work With", category: "Marketing", minutes: 6, date: "2026-03-05",
    excerpt: "Sponsors buy audiences and professionalism. Here's how to present both.",
    body: [
      "Sponsorship is a purchase. The sponsor is buying access to your audience and the reflected credibility of your brand. Once you see it that way, the checklist for becoming sponsor-ready gets very practical.",
      "## Professionalism is visible before the first meeting",
      "Before a sponsor replies to your proposal, they've already seen your Instagram, your flyer quality and your website. A coherent visual identity signals that working with you will be low-friction and that their logo will appear next to good design, not clip art.",
      "## Know your numbers",
      "You don't need a million followers. You need to know who your audience is and prove you can reach them: attendance figures, engagement rates, email list size, demographics. A small, well-documented audience beats a big, vague one every time.",
      "## Make the offer concrete",
      "'Exposure' is not a package. Sponsors respond to inventory: stage mentions, logo placements, content deliverables, booth space, ticket allocations. Price your tiers, define what's included, and put it in a clean deck. The businesses that get sponsored are usually the ones that made saying yes easy.",
      "## Deliver, then document",
      "The renewal is won during fulfilment. Send sponsors their visibility report after the event — photos of their placement, reach numbers, tagged content. Most organizers never do this. The ones who do rarely start the next pitch from zero.",
    ],
  },
  {
    slug: "prepare-social-campaigns", title: "How Businesses Should Prepare for Social Media Campaigns", category: "Social Media", minutes: 5, date: "2026-03-19",
    excerpt: "The two weeks before a campaign decide its results. A preparation checklist.",
    body: [
      "Campaigns rarely fail during the campaign. They fail in the two weeks before, when the assets, the offer and the logistics weren't finished. Here's the checklist we run before any client's campaign goes live.",
      "## Lock the offer first",
      "'Come to our event' is not an offer. Early-bird pricing, a bundle, a deadline, a limited quantity — the campaign needs one concrete reason to act now. Everything in the creative flows from this decision, so make it first.",
      "## Build assets before the start date",
      "Every graphic, video and caption should exist before day one. A campaign that produces content mid-flight always drifts off-schedule, and the algorithm rewards rhythm. We typically build a full asset bank two weeks out: launch posts, reminders, countdowns, last-call creatives.",
      "## Prepare the destination",
      "Where does the click land? If the answer is a slow page, a DM inbox nobody watches, or a form that breaks on mobile, the ad spend is subsidizing a bad experience. Test the whole path yourself, on a phone, before spending a dollar.",
      "## Assign the humans",
      "Who replies to comments and DMs during the campaign, and how fast? Campaigns multiply inbound volume. A question unanswered for two days is a lead that cooled. Decide coverage before launch, not during it.",
      "Do these four things and the campaign itself becomes the easy part — publishing, watching the numbers, and adjusting spend toward what's working.",
    ],
  },
  {
    slug: "branding-mistakes", title: "10 Branding Mistakes Small Businesses Make", category: "Branding", minutes: 10, date: "2026-04-02",
    excerpt: "Inconsistent logos, five fonts, no guidelines — and the fixes that don't require a rebrand.",
    body: [
      "Most brand problems we fix aren't dramatic. They're small habits that compound. Here are the ten we see most often — and the fix for each, most of which don't require a rebrand.",
      "## 1–3: The identity problems",
      "One: using different versions of the logo everywhere. Fix: pick one master file set, delete the rest from circulation. Two: too many fonts. Fix: two families maximum — one for headlines, one for body. Three: colors that shift between posts. Fix: write down your exact hex codes and share them with everyone who touches design.",
      "## 4–6: The system problems",
      "Four: no guidelines document, so every new designer starts from guesswork. Fix: even a five-page brand sheet beats nothing. Five: templates that don't exist, so every flyer is a new invention. Fix: build three to five reusable layouts and lock them. Six: a logo that fails at small sizes. Fix: you need a simplified mark or icon variant for avatars and favicons.",
      "## 7–8: The message problems",
      "Seven: describing what you do instead of what the customer gets. Fix: rewrite your headline around the outcome. Eight: a different tone on every platform — formal website, chaotic TikTok, corporate LinkedIn. Fix: define the voice in three adjectives and hold every caption to them.",
      "## 9–10: The strategy problems",
      "Nine: rebranding out of boredom instead of strategy. Fix: refresh the assets, keep the equity — recognition you've already earned is worth money. Ten: treating the brand as done. Fix: schedule a yearly brand audit, the same way you service equipment.",
      "Notice what this list isn't: it's not 'spend more money.' Most of these fixes are decisions, not purchases. The brands that look expensive are usually just the ones that made the decisions once and stuck to them.",
    ],
  },
];

/* ---------------- process + creative system ---------------- */

export const PROCESS_STEPS = [
  { n: "01", name: "Discover", line: "Understand your business." },
  { n: "02", name: "Strategize", line: "Define the direction." },
  { n: "03", name: "Create", line: "Build the creative." },
  { n: "04", name: "Refine", line: "Review and improve." },
  { n: "05", name: "Launch", line: "Put it into the world." },
  { n: "06", name: "Grow", line: "Measure and evolve." },
];

export const CREATIVE_SYSTEM = [
  { name: "Brand", line: "creates recognition." },
  { name: "Content", line: "creates attention." },
  { name: "Website", line: "creates conversion." },
  { name: "Marketing", line: "creates growth." },
];

export const WHY_POINTS = [
  { name: "Strategy", line: "We don't create blindly." },
  { name: "Creative", line: "We create work people notice." },
  { name: "Consistency", line: "Your brand should look right everywhere." },
  { name: "Performance", line: "Creative should support business goals." },
  { name: "Partnership", line: "We work with clients rather than simply handing over files." },
];

/* ---------------- promo codes ---------------- */

export const PROMO_CODES: Record<string, { type: "pct" | "fixed"; value: number; label: string }> = {
  WELCOME10: { type: "pct", value: 10, label: "10% off first order" },
  EVENT2026: { type: "pct", value: 15, label: "15% off event packages" },
  BRAND20: { type: "pct", value: 20, label: "20% off brand identity" },
  BOTTOM5: { type: "pct", value: 5, label: "5% off — scroll reward" },
};

/* ---------------- contact ---------------- */

export const CONTACT = {
  phone: "1 (876) 255-4848",
  phoneHref: "+18762554848",
  whatsapp: "1 (876) 255-4848",
  whatsappHref: "18762554848",
  email: "socialkon10@gmail.com",
  location: "Kingston, Jamaica",
};

/** Contextual WhatsApp deep link — pre-filled message per context (hybrid commerce journey B). */
export function waLink(message: string): string {
  return `https://wa.me/${CONTACT.whatsappHref}?text=${encodeURIComponent(message)}`;
}

/** Per-service message: "Hi, I'd like to discuss an Event Flyer design." */
export function waServiceMessage(serviceName?: string): string {
  return serviceName
    ? `Hi, I'd like to discuss a ${serviceName} project.`
    : "Hi, I'd like to discuss a custom graphic design project.";
}

/** Default social links — admin can override via Settings (PRD §74). */
export const SOCIAL_LINKS = [
  { id: "instagram", label: "Instagram", href: "https://instagram.com/socialkon10" },
  { id: "facebook", label: "Facebook", href: "https://facebook.com/socialkon10" },
  { id: "tiktok", label: "TikTok", href: "https://tiktok.com/@socialkon10" },
  { id: "linkedin", label: "LinkedIn", href: "https://linkedin.com/company/socialkon10" },
];

/* ---------------- currency display (display-only estimates) ---------------- */

export const CURRENCIES = [
  { code: "USD", symbol: "$", rate: 1, label: "US Dollar" },
  { code: "BMD", symbol: "$", rate: 1, label: "Bermudian Dollar (1:1 peg)" },
  { code: "JMD", symbol: "J$", rate: 160, label: "Jamaican Dollar (est.)" },
  { code: "CAD", symbol: "C$", rate: 1.36, label: "Canadian Dollar (est.)" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

export function formatMoney(usd: number, code: CurrencyCode = "USD"): string {
  const c = CURRENCIES.find((x) => x.code === code) ?? CURRENCIES[0];
  const v = usd * c.rate;
  return `${c.symbol}${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export const serviceBySlug = (slug: string) => SERVICES.find((s) => s.slug === slug);
export const projectBySlug = (slug: string) => PROJECTS.find((p) => p.slug === slug);
export const deptById = (id: DeptId) => DEPARTMENTS.find((d) => d.id === id)!;
