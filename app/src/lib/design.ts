/* ------------------------------------------------------------------
   GRAPHIC DESIGN COMMERCE — DATA & PRICING KERNEL (PRD §6–§24, §57–58)

   Seeds are the editable starting catalog. EVERY business value here
   can be overridden from Studio → Design (managed in the database);
   the provider merges managed docs over these seeds by slug/id, so no
   price, size, option, package or discount is ever hard-coded live.
------------------------------------------------------------------- */

/* ---------------- types ---------------- */

export type PricingType = "fixed" | "starting_at" | "per_quantity" | "custom_quote";
export type AdjType = "fixed" | "percentage";
export type OptionScope = "project" | "design" | "quantity";
export type SizeUnit = "px" | "in" | "mm" | "cm" | "ft";
export type FormatType = "digital" | "print" | "large_format";
export type Orientation = "portrait" | "landscape" | "square" | "auto";

export interface DesignCategory { slug: string; name: string; blurb: string; sort: number; active?: boolean }

export interface DesignSize {
  id: string;
  name: string;
  w: number; h: number; unit: SizeUnit;
  orientation: Orientation;
  format: FormatType;
  bleed?: string; safeArea?: string; dpi?: number; colorMode?: string; fileFormat?: string;
  active?: boolean;
}

export interface DesignOption {
  id: string;
  name: string;
  description: string;
  pricing: AdjType;          // fixed $ or percentage of line base
  price: number;             // $ amount or % value
  scope: OptionScope;        // per project / per design / per quantity (PRD §16)
  active?: boolean;
}

export interface ServiceSize {
  sizeId: string;
  isDefault?: boolean;
  isRecommended?: boolean;
  adjType?: AdjType;         // size price adjustment (PRD §9)
  adj?: number;              // $ or %
}

/* First-class design variations (Folding styles, Sides, Color schemes, Page counts).
   Each variation option has its own explicit individual price and turnaround. */
export interface ServiceVariantOption {
  id: string;
  name: string;              // e.g. "Tri-Fold (6 Panels)", "Double-Sided", "Full Color Vector"
  blurb?: string;            // e.g. "Standard 3-panel roll or letter fold"
  price: number;             // USD — individual price for this specific variation
  turnaround?: string;       // overrides service turnaround when set
  revisions?: number;        // overrides revisions when set
  isDefault?: boolean;
  icon?: string;             // visual badge / emoji: "🗂️", "📑", "🎨", "📖", "✨"
}

export interface ServiceVariationGroup {
  id: string;                // e.g. "folding", "sides", "color_mode", "page_structure"
  name: string;              // e.g. "Folding Style", "Print Sides", "Color Mode", "Page Count"
  options: ServiceVariantOption[];
}

/* Productized tiers — Basic / Premium / Professional style packages
   per service (hybrid e-commerce journey A). Price replaces the base. */
export interface ServiceTier {
  id: string;
  name: string;              // "Basic" | "Premium" | "Professional" | …
  blurb: string;             // what the tier includes
  price: number;             // USD — replaces the base price when picked
  turnaround?: string;       // overrides service turnaround when set
  revisions?: number;        // overrides included revisions when set
}

export type PurchaseMode = "DIRECT_PURCHASE" | "QUOTE_ONLY";

export interface DesignService {
  slug: string;
  name: string;
  category: string;          // category slug
  short: string;
  price: number;             // USD base; 0 with custom_quote = quote only
  pricingType: PricingType;
  purchaseMode?: PurchaseMode; // explicit override; defaults derived from pricingType/price
  tiers?: ServiceTier[];     // optional productized packages for this service
  variations?: ServiceVariationGroup[]; // first-class design variations with individual pricing
  minQty: number;
  maxQty: number;
  turnaround: string;
  revisions: number;
  sizes: ServiceSize[];
  allowCustomSize?: boolean;
  customLimits?: { minW: number; maxW: number; minH: number; maxH: number; unit: SizeUnit };
  optionIds: string[];
  recommended: string[];     // service slugs — Studio-controlled upsells (PRD §24/25)
  featured?: boolean;
  popular?: boolean;
  packageEligible?: boolean; // allow_custom_package
  active?: boolean;
}

/** A service is quote-only when explicitly flagged, priced as custom_quote, or has no price. */
export function isQuoteOnly(s: Pick<DesignService, "purchaseMode" | "pricingType" | "price">): boolean {
  if (s.purchaseMode) return s.purchaseMode === "QUOTE_ONLY";
  return s.pricingType === "custom_quote" || s.price <= 0;
}

export interface DesignPackage {
  slug: string;
  name: string;
  blurb: string;
  pricing: "calculated" | "fixed" | "pct_off" | "fixed_off"; // PRD §23
  price?: number;            // fixed package price
  value?: number;            // % off or $ off
  items: { slug: string; qty: number }[];
  featured?: boolean;
  active?: boolean;
}

export interface DesignDiscount {
  id: string;
  name: string;
  minSubtotal: number;
  minItems: number;
  type: AdjType;             // percentage | fixed
  value: number;
  priority: number;          // highest priority wins
  active?: boolean;
}

/* ---------------- categories (PRD §6) ---------------- */

export const DESIGN_CATEGORIES: DesignCategory[] = [
  { slug: "social-media", name: "Social Media Design", blurb: "Posts, stories, covers and ad creative for every platform.", sort: 1 },
  { slug: "events", name: "Event & Entertainment", blurb: "Flyers, posters and promo graphics that fill the venue.", sort: 2 },
  { slug: "business", name: "Business & Corporate", blurb: "Flyers, brochures, cards and company documents.", sort: 3 },
  { slug: "branding", name: "Branding", blurb: "Logos, identities, style guides and brand kits.", sort: 4 },
  { slug: "print", name: "Print Design", blurb: "Cards, banners, brochures and everything ink-on-paper.", sort: 5 },
  { slug: "advertising", name: "Advertising & Marketing", blurb: "Campaign graphics built to convert.", sort: 6 },
  { slug: "product", name: "Product & E-Commerce", blurb: "Listing graphics, labels, packaging and mockups.", sort: 7 },
  { slug: "real-estate", name: "Real Estate", blurb: "Listing flyers, feature sheets and open-house promo.", sort: 8 },
  { slug: "restaurant", name: "Restaurant & Food", blurb: "Menus, specials and food promo that sells.", sort: 9 },
  { slug: "specialty", name: "Specialty", blurb: "Invitations, programs and community pieces.", sort: 10 },
];

/* ---------------- size presets (PRD §8/§13) ---------------- */

export const DESIGN_SIZES: DesignSize[] = [
  // business cards
  { id: "bc-standard", name: 'Standard 3.5 × 2"', w: 3.5, h: 2, unit: "in", orientation: "landscape", format: "print", bleed: '0.125"', safeArea: '0.125"', dpi: 300, colorMode: "CMYK", fileFormat: "PDF" },
  { id: "bc-vertical", name: 'Vertical 2 × 3.5"', w: 2, h: 3.5, unit: "in", orientation: "portrait", format: "print", bleed: '0.125"', safeArea: '0.125"', dpi: 300, colorMode: "CMYK", fileFormat: "PDF" },
  { id: "bc-square", name: 'Square 3.5 × 3.5"', w: 3.5, h: 3.5, unit: "in", orientation: "square", format: "print", bleed: '0.125"', safeArea: '0.125"', dpi: 300, colorMode: "CMYK", fileFormat: "PDF" },
  // print
  { id: "p-4x6", name: '4 × 6"', w: 4, h: 6, unit: "in", orientation: "portrait", format: "print", bleed: '0.125"', dpi: 300, colorMode: "CMYK", fileFormat: "PDF" },
  { id: "p-5x7", name: '5 × 7"', w: 5, h: 7, unit: "in", orientation: "portrait", format: "print", bleed: '0.125"', dpi: 300, colorMode: "CMYK", fileFormat: "PDF" },
  { id: "p-letter", name: '8.5 × 11" (Letter)', w: 8.5, h: 11, unit: "in", orientation: "portrait", format: "print", bleed: '0.125"', dpi: 300, colorMode: "CMYK", fileFormat: "PDF" },
  { id: "p-tabloid", name: '11 × 17" (Tabloid)', w: 11, h: 17, unit: "in", orientation: "portrait", format: "print", bleed: '0.125"', dpi: 300, colorMode: "CMYK", fileFormat: "PDF" },
  { id: "p-18x24", name: '18 × 24" Poster', w: 18, h: 24, unit: "in", orientation: "portrait", format: "large_format", bleed: '0.25"', dpi: 300, colorMode: "CMYK", fileFormat: "PDF" },
  { id: "p-24x36", name: '24 × 36" Poster', w: 24, h: 36, unit: "in", orientation: "portrait", format: "large_format", bleed: '0.25"', dpi: 300, colorMode: "CMYK", fileFormat: "PDF" },
  { id: "a5", name: "A5 (148 × 210mm)", w: 148, h: 210, unit: "mm", orientation: "portrait", format: "print", bleed: "3mm", dpi: 300, colorMode: "CMYK", fileFormat: "PDF" },
  { id: "a4", name: "A4 (210 × 297mm)", w: 210, h: 297, unit: "mm", orientation: "portrait", format: "print", bleed: "3mm", dpi: 300, colorMode: "CMYK", fileFormat: "PDF" },
  { id: "a3", name: "A3 (297 × 420mm)", w: 297, h: 420, unit: "mm", orientation: "portrait", format: "large_format", bleed: "3mm", dpi: 300, colorMode: "CMYK", fileFormat: "PDF" },
  { id: "banner-pullup", name: 'Pull-Up Banner 33 × 81"', w: 33, h: 81, unit: "in", orientation: "portrait", format: "large_format", bleed: '0.5"', dpi: 150, colorMode: "CMYK", fileFormat: "PDF" },
  // digital
  { id: "d-square", name: "1080 × 1080 px (Square)", w: 1080, h: 1080, unit: "px", orientation: "square", format: "digital", dpi: 72, colorMode: "RGB", fileFormat: "PNG/JPG" },
  { id: "d-portrait", name: "1080 × 1350 px (Portrait)", w: 1080, h: 1350, unit: "px", orientation: "portrait", format: "digital", dpi: 72, colorMode: "RGB", fileFormat: "PNG/JPG" },
  { id: "d-story", name: "1080 × 1920 px (Story)", w: 1080, h: 1920, unit: "px", orientation: "portrait", format: "digital", dpi: 72, colorMode: "RGB", fileFormat: "PNG/JPG" },
  { id: "d-landscape", name: "1920 × 1080 px (Landscape)", w: 1920, h: 1080, unit: "px", orientation: "landscape", format: "digital", dpi: 72, colorMode: "RGB", fileFormat: "PNG/JPG" },
  { id: "d-720", name: "1280 × 720 px (HD)", w: 1280, h: 720, unit: "px", orientation: "landscape", format: "digital", dpi: 72, colorMode: "RGB", fileFormat: "PNG/JPG" },
  { id: "d-fbcover", name: "Facebook Cover 820 × 312 px", w: 820, h: 312, unit: "px", orientation: "landscape", format: "digital", dpi: 72, colorMode: "RGB", fileFormat: "PNG/JPG" },
  { id: "d-ytthumb", name: "YouTube Thumbnail 1280 × 720 px", w: 1280, h: 720, unit: "px", orientation: "landscape", format: "digital", dpi: 72, colorMode: "RGB", fileFormat: "PNG/JPG" },
];

/* ---------------- options / add-ons (PRD §14) ---------------- */

export const DESIGN_OPTIONS: DesignOption[] = [
  { id: "double-sided", name: "Double-sided", description: "Design for front and back.", pricing: "fixed", price: 25, scope: "design" },
  { id: "rounded-corners", name: "Rounded corners", description: "Print spec for rounded corner finishing.", pricing: "fixed", price: 15, scope: "project" },
  { id: "rush", name: "Rush delivery (72h)", description: "Jump the queue — under 72 hours.", pricing: "percentage", price: 25, scope: "project" },
  { id: "same-day", name: "Same-day delivery", description: "Delivered today — order before noon.", pricing: "percentage", price: 50, scope: "project" },
  { id: "animated-version", name: "Animated version", description: "A motion version of the same creative for stories/reels.", pricing: "fixed", price: 45, scope: "design" },
  { id: "extra-size", name: "Additional size", description: "The same design adapted to one more size/platform.", pricing: "fixed", price: 25, scope: "design" },
  { id: "print-ready", name: "Print-ready file", description: "Press-ready PDF with bleed and marks.", pricing: "fixed", price: 20, scope: "design" },
  { id: "source-file", name: "Editable source file", description: "Layered, editable working file.", pricing: "fixed", price: 45, scope: "design" },
  { id: "extra-revision", name: "Additional revision round", description: "One more revision round beyond the included set.", pricing: "fixed", price: 30, scope: "project" },
  { id: "extra-variation", name: "Additional design variation", description: "A second layout/concept of the same piece.", pricing: "fixed", price: 40, scope: "design" },
  { id: "retouch", name: "Premium retouching", description: "Detailed image cleanup and colour grading.", pricing: "fixed", price: 55, scope: "design" },
  { id: "extra-concept", name: "Additional concept", description: "One more initial concept direction.", pricing: "fixed", price: 120, scope: "project" },
  { id: "style-guide-addon", name: "Mini brand style guide", description: "One-page colours, type and usage sheet.", pricing: "fixed", price: 150, scope: "project" },
];

/* ---------------- services seed (PRD §6, curated) ---------------- */

const SQ = "d-square", ST = "d-story", PO = "d-portrait", LS = "d-landscape";
const printSizes = (def = "p-letter"): ServiceSize[] => [
  { sizeId: "p-4x6" }, { sizeId: "p-5x7" }, { sizeId: "a5" },
  { sizeId: "p-letter", isDefault: def === "p-letter" }, { sizeId: "a4" },
  { sizeId: "p-tabloid", adjType: "fixed", adj: 20 }, { sizeId: "a3", adjType: "fixed", adj: 20 },
];
const digitalSizes = (def = SQ): ServiceSize[] => [
  { sizeId: SQ, isDefault: def === SQ }, { sizeId: PO }, { sizeId: ST, isDefault: def === ST }, { sizeId: LS },
];
const stdOpts = ["double-sided", "rush", "print-ready", "source-file", "extra-revision"];

function svc(partial: Partial<DesignService> & Pick<DesignService, "slug" | "name" | "category" | "price">): DesignService {
  return {
    short: "", pricingType: "fixed", minQty: 1, maxQty: 50, turnaround: "3–5 days", revisions: 2,
    sizes: [], optionIds: stdOpts, recommended: [], packageEligible: true, active: true,
    ...partial,
  };
}

export const DESIGN_SERVICES: DesignService[] = [
  /* social media */
  svc({ slug: "social-media-post-design", name: "Social Media Post Design", category: "social-media", price: 65, short: "A scroll-stopping single post for any platform.", sizes: digitalSizes(), popular: true, featured: true, optionIds: [...stdOpts, "animated-version", "extra-size", "same-day"], recommended: ["instagram-story-design", "carousel-design", "social-media-ad-creative"],
    tiers: [
      { id: "basic", name: "Basic", blurb: "1 concept, 1 revision, one platform size.", price: 45, revisions: 1 },
      { id: "standard", name: "Standard", blurb: "2 concepts, 2 revisions, print-ready files.", price: 65 },
      { id: "premium", name: "Premium", blurb: "3 concepts, 3 revisions, animated version + source file.", price: 110, revisions: 3, turnaround: "2–4 days" },
    ] }),
  svc({ slug: "instagram-story-design", name: "Instagram Story Design", category: "social-media", price: 55, short: "Full-screen story creative that taps through.", sizes: [{ sizeId: ST, isDefault: true }], optionIds: [...stdOpts, "animated-version", "same-day"], recommended: ["social-media-post-design", "event-countdown-graphic"] }),
  svc({ slug: "carousel-design", name: "Carousel Design", category: "social-media", price: 140, short: "Multi-slide carousels people actually swipe.", sizes: digitalSizes(), pricingType: "starting_at", popular: true }),
  svc({ slug: "facebook-cover-design", name: "Facebook Cover Design", category: "social-media", price: 60, short: "A cover that makes the page look official.", sizes: [{ sizeId: "d-fbcover", isDefault: true }] }),
  svc({ slug: "youtube-thumbnail", name: "YouTube Thumbnail", category: "social-media", price: 50, short: "Thumbnails engineered for the click.", sizes: [{ sizeId: "d-ytthumb", isDefault: true }], popular: true }),
  svc({ slug: "social-media-ad-creative", name: "Social Media Ad Creative", category: "social-media", price: 95, short: "Ad creative built to convert, not just look good.", sizes: digitalSizes(), featured: true, recommended: ["carousel-design", "social-media-post-design"] }),
  svc({ slug: "event-countdown-graphic", name: "Event Countdown Graphic", category: "social-media", price: 45, short: "Countdown creative that builds anticipation.", sizes: digitalSizes(ST), recommended: ["ticket-sale-graphic", "instagram-story-design"] }),
  svc({ slug: "social-profile-graphics", name: "Social Media Profile Graphics", category: "social-media", price: 120, short: "Avatar, cover and highlight covers as one kit.", sizes: digitalSizes(), pricingType: "starting_at" }),

  /* events */
  svc({ slug: "event-flyer", name: "Event Flyer", category: "events", price: 65, short: "The classic — digital, print-ready, double-sided or motion video.", sizes: [...digitalSizes(), ...printSizes()], popular: true, featured: true, optionIds: [...stdOpts, "same-day", "animated-version", "extra-size"], recommended: ["instagram-story-design", "ticket-sale-graphic", "event-poster", "event-countdown-graphic"],
    variations: [
      {
        id: "sides_and_motion",
        name: "Format & Sides",
        options: [
          { id: "digital-single", name: "Single-Sided Digital Flyer", blurb: "1080×1350/Square for Instagram, WhatsApp & web.", price: 55, icon: "📱", revisions: 1 },
          { id: "print-single", name: "Single-Sided Print-Ready", blurb: "300 DPI CMYK PDF with 0.125\" bleed & crop marks.", price: 65, isDefault: true, icon: "🖨️", revisions: 2 },
          { id: "double-sided", name: "Double-Sided (Front & Back)", blurb: "Front headline art + back venue/details/sponsors layout.", price: 90, icon: "📑", revisions: 2 },
          { id: "motion-animated", name: "Print/Digital + Animated Motion Reel", blurb: "Static flyer plus a 15s synced motion video for Reels & Stories.", price: 120, icon: "🎬", turnaround: "2–4 days", revisions: 3 },
        ],
      },
    ] }),
  svc({ slug: "event-poster", name: "Event Poster", category: "events", price: 85, short: "Large-format impact for walls and windows.", sizes: [{ sizeId: "p-tabloid" }, { sizeId: "p-18x24", isDefault: true }, { sizeId: "p-24x36", adjType: "fixed", adj: 25 }, { sizeId: "a3" }], recommended: ["event-flyer", "step-and-repeat"] }),
  svc({ slug: "concert-flyer", name: "Concert / Club Night Flyer", category: "events", price: 75, short: "High-energy creative for nightlife and shows.", sizes: digitalSizes(), popular: true, recommended: ["artist-announcement", "lineup-flyer", "ticket-sale-graphic"],
    variations: [
      {
        id: "sides_and_motion",
        name: "Format & Motion",
        options: [
          { id: "digital-single", name: "Digital Feed Flyer", blurb: "Static high-energy flyer for feeds & promos.", price: 65, icon: "📱" },
          { id: "print-single", name: "Print + Digital Flyer", blurb: "Press-ready CMYK + web PNG/JPG.", price: 75, isDefault: true, icon: "🖨️" },
          { id: "motion-pack", name: "Flyer + DJ Motion Reel Pack", blurb: "Static flyer + 15s video reel with DJ tags & audio sync.", price: 135, icon: "🔥", turnaround: "2–4 days", revisions: 3 },
        ],
      },
    ] }),
  svc({ slug: "artist-announcement", name: "Artist / DJ Announcement", category: "events", price: 60, short: "Announcement creative for bookings and guests.", sizes: digitalSizes() }),
  svc({ slug: "lineup-flyer", name: "Lineup Flyer", category: "events", price: 80, short: "The full lineup, laid out to hype.", sizes: digitalSizes() }),
  svc({ slug: "ticket-sale-graphic", name: "Ticket Sale Graphic", category: "events", price: 55, short: "Early bird and ticket-drop promo.", sizes: digitalSizes(), recommended: ["event-countdown-graphic", "event-flyer"] }),
  svc({ slug: "vip-flyer", name: "VIP / Table Package Flyer", category: "events", price: 70, short: "Premium-tier promo for premium guests.", sizes: digitalSizes() }),
  svc({ slug: "step-and-repeat", name: "Step & Repeat / Backdrop", category: "events", price: 180, short: "Red-carpet backdrops and media walls.", sizes: [], allowCustomSize: true, customLimits: { minW: 4, maxW: 40, minH: 4, maxH: 12, unit: "ft" }, pricingType: "starting_at" }),

  /* business */
  svc({ slug: "business-flyer", name: "Business Flyer", category: "business", price: 65, short: "Promo and announcement flyers for business.", sizes: printSizes(), recommended: ["brochure-design", "social-media-post-design"],
    variations: [
      {
        id: "sides",
        name: "Sides",
        options: [
          { id: "single", name: "Single-Sided (Front Only)", blurb: "Front-only business announcement.", price: 65, isDefault: true, icon: "📄" },
          { id: "double", name: "Double-Sided (Front & Back)", blurb: "Front headline promo + back services & terms.", price: 95, icon: "📑" },
        ],
      },
    ] }),
  svc({ slug: "brochure-design", name: "Brochure", category: "business", price: 220, short: "Bi-fold, tri-fold, z-fold, and gate-fold brochures that inform and sell.", sizes: printSizes(), pricingType: "starting_at", optionIds: ["double-sided", "print-ready", "source-file", "extra-revision", "rush"],
    variations: [
      {
        id: "folding",
        name: "Folding & Panel Structure",
        options: [
          { id: "flat-insert", name: "Flat Flyer / Insert (No Fold · 2 Sides)", blurb: "Two-sided promotional sell sheet or binder insert.", price: 95, icon: "📄", turnaround: "2–3 days", revisions: 2 },
          { id: "bi-fold", name: "Bi-Fold / Half Fold (4 Panels)", blurb: "Single center fold creating a 4-page booklet layout.", price: 160, icon: "📖", turnaround: "3–5 days", revisions: 2 },
          { id: "tri-fold", name: "Tri-Fold / Letter Fold (6 Panels)", blurb: "Classic 3-panel roll or letter fold for mailers and countertop displays.", price: 220, isDefault: true, icon: "🗂️", turnaround: "3–5 days", revisions: 2 },
          { id: "z-fold", name: "Z-Fold (6 Panels Accordion)", blurb: "Zig-zag accordion 3-panel fold opening outward sequentially.", price: 240, icon: "⚡", turnaround: "4–6 days", revisions: 3 },
          { id: "gate-fold", name: "Gate Fold / Double Parallel (8 Panels)", blurb: "Two side panels opening inward like double doors for executive impact.", price: 290, icon: "🚪", turnaround: "5–7 days", revisions: 3 },
        ],
      },
    ] }),
  svc({ slug: "company-profile", name: "Company / Corporate Profile", category: "business", price: 450, short: "Multi-page profiles that win contracts.", pricingType: "starting_at", purchaseMode: "QUOTE_ONLY", turnaround: "7–10 days", revisions: 3, optionIds: ["print-ready", "source-file", "extra-revision"],
    variations: [
      {
        id: "page_count",
        name: "Profile Scope",
        options: [
          { id: "summary-4", name: "4-Page Executive Snapshot", blurb: "Cover, company overview, core services, and contact.", price: 250, icon: "📄" },
          { id: "standard-8", name: "8-Page Corporate Deck", blurb: "Mission, leadership, detailed offerings, case studies & clients.", price: 450, isDefault: true, icon: "📊" },
          { id: "master-12", name: "12–16 Page Master Profile", blurb: "Comprehensive tender/RFP-ready company portfolio document.", price: 680, icon: "💼", turnaround: "10–14 days", revisions: 4 },
        ],
      },
    ] }),
  svc({ slug: "business-card", name: "Business Card Design", category: "business", price: 95, short: "Cards people keep, not bin.", sizes: [{ sizeId: "bc-standard", isDefault: true }, { sizeId: "bc-vertical" }, { sizeId: "bc-square", adjType: "fixed", adj: 10 }], popular: true, featured: true, optionIds: ["double-sided", "rounded-corners", "print-ready", "source-file", "extra-revision", "rush"], recommended: ["logo-design", "letterhead-design", "email-signature"],
    variations: [
      {
        id: "sides",
        name: "Print Sides",
        options: [
          { id: "single", name: "Single-Sided (Front Only)", blurb: "Minimalist front-only layout or appointment card.", price: 65, icon: "📄", revisions: 1 },
          { id: "double", name: "Double-Sided (Front & Back)", blurb: "Front brand mark + back details, QR code, and social links.", price: 95, isDefault: true, icon: "📑", revisions: 2 },
          { id: "team-suite", name: "Multi-Person Team Suite (3 Names)", blurb: "Front/back template with individualized contact files for 3 team members.", price: 160, icon: "👥", revisions: 3 },
        ],
      },
    ] }),
  svc({ slug: "letterhead-design", name: "Letterhead", category: "business", price: 60, short: "Branded stationery for official correspondence.", sizes: [{ sizeId: "p-letter", isDefault: true }, { sizeId: "a4" }] }),
  svc({ slug: "invoice-template", name: "Invoice / Receipt Template", category: "business", price: 70, short: "Branded, reusable billing templates." }),
  svc({ slug: "presentation-design", name: "Presentation / Proposal Design", category: "business", price: 300, short: "Decks and proposals that close.", pricingType: "starting_at", turnaround: "5–7 days",
    variations: [
      {
        id: "slide_count",
        name: "Presentation Scope",
        options: [
          { id: "deck-5", name: "Up to 5 Slides / One-Pager Deck", price: 175, icon: "📊" },
          { id: "deck-10", name: "Up to 10 Slides (Standard Pitch)", price: 300, isDefault: true, icon: "📈" },
          { id: "deck-20", name: "Up to 20 Slides (Master Keynote)", price: 550, icon: "🎯", turnaround: "7–10 days", revisions: 3 },
        ],
      },
    ] }),
  svc({ slug: "menu-design", name: "Menu Design", category: "restaurant", price: 120, short: "Menus engineered to sell the high-margin items.", sizes: printSizes(), pricingType: "starting_at", popular: true, optionIds: ["double-sided", "print-ready", "source-file", "extra-revision", "rush"],
    variations: [
      {
        id: "menu_structure",
        name: "Menu Format & Panels",
        options: [
          { id: "single-page", name: "Single Page Flat Menu", blurb: "Single-sided laminated or clipboard menu layout.", price: 80, icon: "📄", revisions: 1 },
          { id: "double-sided", name: "Double-Sided 2-Page Menu", blurb: "Front and back food + drink layout.", price: 120, isDefault: true, icon: "📑", revisions: 2 },
          { id: "tri-fold", name: "Tri-Fold 6-Panel Takeout Menu", blurb: "6-panel takeout / delivery menu with category segmentation.", price: 180, icon: "🗂️", revisions: 2 },
          { id: "booklet", name: "Multi-Page Dining Booklet Menu (8+ Pages)", blurb: "Multi-page bound dining menu with photography and cocktail sections.", price: 260, icon: "📖", turnaround: "5–7 days", revisions: 3 },
        ],
      },
    ] }),
  svc({ slug: "price-list", name: "Price List / Service Menu", category: "business", price: 75, short: "Clear, on-brand pricing documents.", sizes: [...printSizes(), ...digitalSizes()] }),
  svc({ slug: "recruitment-flyer", name: "Recruitment / Announcement Flyer", category: "business", price: 60, short: "Hiring and company news, designed properly.", sizes: [...printSizes(), ...digitalSizes()] }),

  /* branding */
  svc({ slug: "logo-design", name: "Logo Design", category: "branding", price: 350, short: "Custom identity vectors engineered for recognition across all media.", turnaround: "5–7 days", revisions: 2, featured: true, popular: true, optionIds: ["extra-concept", "extra-revision", "source-file", "style-guide-addon"], recommended: ["business-card", "social-profile-graphics", "brand-style-guide"],
    variations: [
      {
        id: "color_mode",
        name: "Color & Style Edition",
        options: [
          { id: "bw", name: "Black & White / Monochrome Vector", blurb: "Crisp black and white vector mark for minimalists or stamping.", price: 250, icon: "⚫", turnaround: "4–6 days", revisions: 1 },
          { id: "full-color", name: "Full Color Dynamic Vector Suite", blurb: "Primary color palette, dark & light backgrounds, color breakdown codes.", price: 350, isDefault: true, icon: "🎨", turnaround: "5–7 days", revisions: 2 },
          { id: "metallic-3d", name: "3D Metallic / Luxury Edition", blurb: "Gold/silver foil textures, 3D photoreal shading & luxury product mockups.", price: 495, icon: "✨", turnaround: "7–10 days", revisions: 3 },
        ],
      },
    ] }),
  svc({ slug: "logo-redesign", name: "Logo Redesign", category: "branding", price: 280, short: "A careful evolution of what you already have.", turnaround: "5–7 days", optionIds: ["extra-concept", "extra-revision", "source-file"],
    variations: [
      {
        id: "color_mode",
        name: "Redesign Scope",
        options: [
          { id: "vector-cleanup", name: "Vector Cleanup & High-Res Redraw", blurb: "Recreate low-res logo into infinite resolution SVG/EPS.", price: 195, icon: "📐", revisions: 1 },
          { id: "color-modernization", name: "Full Color Modernization", blurb: "Modern typography, refreshed color palette & vector master files.", price: 280, isDefault: true, icon: "🎨", revisions: 2 },
          { id: "complete-system", name: "Modernization + Submark & Icons", blurb: "Primary logo refresh + matching avatar icon & horizontal lockup.", price: 395, icon: "✨", revisions: 3 },
        ],
      },
    ] }),
  svc({ slug: "brand-identity", name: "Brand Identity", category: "branding", price: 1200, short: "Logo suite, colours, type and usage — the full system.", pricingType: "starting_at", purchaseMode: "QUOTE_ONLY", turnaround: "2–3 weeks", revisions: 3, featured: true, optionIds: ["style-guide-addon", "extra-revision", "source-file"], recommended: ["brand-style-guide", "business-card", "social-profile-graphics"] }),
  svc({ slug: "brand-style-guide", name: "Brand Style Guide", category: "branding", price: 400, short: "The rulebook that keeps your brand consistent.", turnaround: "7–10 days" }),
  svc({ slug: "email-signature", name: "Email Signature", category: "branding", price: 45, short: "A signature that markets on every send." }),
  svc({ slug: "social-branding-kit", name: "Social Media Branding Kit", category: "branding", price: 350, short: "Templates and profile assets for every platform.", pricingType: "starting_at", recommended: ["social-media-post-design", "brand-style-guide"] }),
  svc({ slug: "brand-templates", name: "Brand Templates", category: "branding", price: 250, short: "Editable templates your team can't break.", pricingType: "starting_at" }),

  /* print */
  svc({ slug: "poster-design", name: "Poster", category: "print", price: 85, short: "Posters from tabloid to billboard thinking.", sizes: [{ sizeId: "p-tabloid" }, { sizeId: "p-18x24", isDefault: true }, { sizeId: "p-24x36", adjType: "fixed", adj: 25 }, { sizeId: "a3" }] }),
  svc({ slug: "pull-up-banner", name: "Pull-Up / Retractable Banner", category: "print", price: 150, short: "Trade-show and storefront banners.", sizes: [{ sizeId: "banner-pullup", isDefault: true }], allowCustomSize: true, customLimits: { minW: 24, maxW: 60, minH: 60, maxH: 96, unit: "in" } }),
  svc({ slug: "postcard-invitation", name: "Postcards & Invitations", category: "print", price: 70, short: "Mailers and invites that get kept.", sizes: [{ sizeId: "p-4x6", isDefault: true }, { sizeId: "p-5x7" }, { sizeId: "a5" }],
    variations: [
      {
        id: "sides",
        name: "Sides",
        options: [
          { id: "single", name: "Single-Sided Postcard", price: 55, icon: "✉️" },
          { id: "double", name: "Double-Sided (Art Front + Mailer Back)", price: 80, isDefault: true, icon: "💌" },
        ],
      },
    ] }),
  svc({ slug: "stickers-labels", name: "Stickers & Labels", category: "print", price: 65, short: "Product labels, sticker sheets and seals.", pricingType: "starting_at", allowCustomSize: true, customLimits: { minW: 1, maxW: 12, minH: 1, maxH: 12, unit: "in" },
    variations: [
      {
        id: "label_format",
        name: "Sticker Format",
        options: [
          { id: "single-die-cut", name: "Single Die-Cut / Kiss-Cut Sticker", blurb: "Individual contoured sticker artwork.", price: 65, isDefault: true, icon: "🏷️" },
          { id: "front-back-set", name: "Front & Back Label Set", blurb: "Matching front brand label + back ingredients/barcode label.", price: 110, icon: "🧴" },
          { id: "sheet-pack", name: "Multi-Design Sticker Sheet (4–8 Stickers)", blurb: "Full sticker sheet layout for merch.", price: 150, icon: "📦", revisions: 3 },
        ],
      },
    ] }),
  svc({ slug: "certificate-design", name: "Certificates & Gift Certificates", category: "print", price: 55, short: "Awards and vouchers worth framing.", sizes: [{ sizeId: "p-letter", isDefault: true }, { sizeId: "a4" }] }),

  /* advertising */
  svc({ slug: "facebook-ad", name: "Facebook / Instagram Ad", category: "advertising", price: 95, short: "Feed and story ads designed to convert.", sizes: digitalSizes(), recommended: ["social-media-ad-creative", "web-banner"] }),
  svc({ slug: "google-display-ad", name: "Google Display Ad Set", category: "advertising", price: 140, short: "The core display sizes, one coherent set.", pricingType: "starting_at", sizes: [{ sizeId: LS, isDefault: true }, { sizeId: SQ }, { sizeId: ST }] }),
  svc({ slug: "sale-promotion", name: "Sale / Discount Promotion", category: "advertising", price: 60, short: "Promo graphics for launches and sales.", sizes: digitalSizes(), popular: true }),
  svc({ slug: "grand-opening", name: "Grand Opening / Launch Graphic", category: "advertising", price: 75, short: "Launch-day creative across every channel.", sizes: digitalSizes(), recommended: ["event-flyer", "sale-promotion"] }),
  svc({ slug: "email-marketing-graphic", name: "Email Marketing Graphics", category: "advertising", price: 80, short: "Headers and bodies that get the click." }),
  svc({ slug: "web-banner", name: "Web Banner / Hero Graphic", category: "advertising", price: 90, short: "Hero art and banners for your website.", sizes: [{ sizeId: LS, isDefault: true }, { sizeId: "d-720" }] }),

  /* product & e-commerce */
  svc({ slug: "product-promo-graphic", name: "Product Promotional Graphic", category: "product", price: 70, short: "Feature and comparison graphics that sell the product.", sizes: digitalSizes() }),
  svc({ slug: "ecommerce-listing", name: "E-Commerce Listing Graphics", category: "product", price: 120, short: "Listing image sets for your store.", pricingType: "starting_at" }),
  svc({ slug: "product-label", name: "Product Label", category: "product", price: 130, short: "Labels that earn shelf presence.", pricingType: "starting_at", allowCustomSize: true, customLimits: { minW: 1, maxW: 12, minH: 1, maxH: 12, unit: "in" },
    variations: [
      {
        id: "label_type",
        name: "Label Style",
        options: [
          { id: "single-wrap", name: "Single Full-Wrap Container Label", blurb: "Complete 360 wrap label for bottles or jars.", price: 130, isDefault: true, icon: "🏷️" },
          { id: "front-back", name: "Front & Back Two-Piece Set", blurb: "Separate front branding + back nutrition/directions.", price: 180, icon: "🧴" },
        ],
      },
    ] }),
  svc({ slug: "packaging-design", name: "Packaging Design", category: "product", price: 600, short: "Structural-ready packaging artwork.", pricingType: "starting_at", purchaseMode: "QUOTE_ONLY", turnaround: "2–3 weeks", revisions: 3 }),
  svc({ slug: "product-mockup", name: "Product Mockup", category: "product", price: 85, short: "Photoreal mockups of your product or packaging." }),

  /* real estate */
  svc({ slug: "property-listing-flyer", name: "Property Listing Flyer", category: "real-estate", price: 75, short: "Listings presented to sell.", sizes: [...printSizes(), ...digitalSizes()], recommended: ["open-house-flyer", "property-brochure"],
    variations: [
      {
        id: "sides",
        name: "Sides",
        options: [
          { id: "single", name: "Single-Sided Property Feature", blurb: "Hero photo, price, specs, and agent details.", price: 75, isDefault: true, icon: "🏠" },
          { id: "double", name: "Double-Sided Feature Sheet", blurb: "Hero front + back floorplan, photo gallery & neighborhood stats.", price: 110, icon: "📑" },
        ],
      },
    ] }),
  svc({ slug: "open-house-flyer", name: "Open House Flyer", category: "real-estate", price: 70, short: "Fill the open house.", sizes: [...printSizes(), ...digitalSizes()] }),
  svc({ slug: "sold-graphic", name: "For Sale / Sold Graphic", category: "real-estate", price: 45, short: "Proof-of-work posts for your pipeline.", sizes: digitalSizes() }),
  svc({ slug: "property-brochure", name: "Property Brochure / Feature Sheet", category: "real-estate", price: 180, short: "Multi-page property presentations.", pricingType: "starting_at" }),

  /* restaurant (menu-design lives above under its catalog slug) */
  svc({ slug: "food-promo-flyer", name: "Food Promotional Flyer", category: "restaurant", price: 65, short: "Specials and promos that fill tables.", sizes: [...printSizes(), ...digitalSizes()], recommended: ["menu-design", "daily-special-graphic"] }),
  svc({ slug: "daily-special-graphic", name: "Daily Special / New Item Graphic", category: "restaurant", price: 45, short: "Fast-turnaround daily promo.", sizes: digitalSizes() }),
  svc({ slug: "table-tent", name: "Table Tent", category: "restaurant", price: 55, short: "On-table promo for upsells and events.", sizes: [{ sizeId: "p-4x6", isDefault: true }, { sizeId: "p-5x7" }, { sizeId: "a5" }] }),

  /* specialty */
  svc({ slug: "wedding-invitation", name: "Wedding Invitation", category: "specialty", price: 150, short: "Suites and single cards for the big day.", pricingType: "starting_at", sizes: [{ sizeId: "p-5x7", isDefault: true }, { sizeId: "a5" }],
    variations: [
      {
        id: "suite_scope",
        name: "Invitation Scope",
        options: [
          { id: "single-card", name: "Single Main Invitation Card", price: 95, icon: "✉️" },
          { id: "double-sided", name: "Double-Sided Invitation Card", price: 130, icon: "💌" },
          { id: "full-suite", name: "Complete 3-Piece Suite (Invite + RSVP + Details)", price: 195, isDefault: true, icon: "💍", turnaround: "5–7 days", revisions: 3 },
        ],
      },
    ] }),
  svc({ slug: "birthday-invitation", name: "Birthday / Baby Shower Invitation", category: "specialty", price: 55, short: "Invites worth keeping.", sizes: [{ sizeId: "p-5x7", isDefault: true }, { sizeId: "p-4x6" }, ...digitalSizes()] }),
  svc({ slug: "funeral-program", name: "Funeral Program / Memorial Booklet", category: "specialty", price: 140, short: "Handled with care, delivered on time.", pricingType: "starting_at", turnaround: "2–4 days",
    variations: [
      {
        id: "program_structure",
        name: "Page & Binding Structure",
        options: [
          { id: "single-sheet", name: "Single Sheet 2-Page Card", blurb: "Front photo tribute + back order of service.", price: 90, icon: "📄", revisions: 1 },
          { id: "bi-fold", name: "Bi-Fold 4-Page Program", blurb: "Cover, obituary, order of service, and pallbearers/acknowledgments.", price: 140, isDefault: true, icon: "📖", revisions: 2 },
          { id: "booklet-8", name: "8-Page Memorial Booklet", blurb: "Photo collage spreads, reflections, tributes, and family memories.", price: 220, icon: "📚", turnaround: "3–5 days", revisions: 3 },
          { id: "booklet-12", name: "12-Page Deluxe Commemorative Book", blurb: "Comprehensive life celebration keepsake booklet.", price: 320, icon: "🕊️", turnaround: "4–6 days", revisions: 3 },
        ],
      },
    ] }),
  svc({ slug: "church-flyer", name: "Church / Community Flyer", category: "specialty", price: 55, short: "Services, revivals and community events.", sizes: [...printSizes(), ...digitalSizes()] }),
  svc({ slug: "graduation-design", name: "Graduation Design", category: "specialty", price: 65, short: "Announcements and celebration graphics.", sizes: [...printSizes(), ...digitalSizes()] }),
];

/* ---------------- package discounts (PRD §20) ---------------- */

export const DESIGN_DISCOUNTS: DesignDiscount[] = [
  { id: "tier-250", name: "Package saver 5%", minSubtotal: 250, minItems: 2, type: "percentage", value: 5, priority: 1 },
  { id: "tier-500", name: "Package saver 10%", minSubtotal: 500, minItems: 2, type: "percentage", value: 10, priority: 2 },
  { id: "tier-1000", name: "Package saver 15%", minSubtotal: 1000, minItems: 2, type: "percentage", value: 15, priority: 3 },
];

/* ---------------- predefined packages (PRD §21) ---------------- */

export const DESIGN_PACKAGES: DesignPackage[] = [
  { slug: "social-starter", name: "Social Starter", blurb: "5 posts, 3 stories and a promo graphic — one month of presence.", pricing: "pct_off", value: 10, items: [{ slug: "social-media-post-design", qty: 5 }, { slug: "instagram-story-design", qty: 3 }, { slug: "sale-promotion", qty: 1 }], featured: true },
  { slug: "business-essentials", name: "Business Essentials", blurb: "Logo, card, letterhead, flyer and profile graphics — launch-ready.", pricing: "pct_off", value: 12, items: [{ slug: "logo-design", qty: 1 }, { slug: "business-card", qty: 1 }, { slug: "letterhead-design", qty: 1 }, { slug: "business-flyer", qty: 1 }, { slug: "social-profile-graphics", qty: 1 }], featured: true },
  { slug: "event-promotion", name: "Event Promotion", blurb: "Flyer, poster, socials, ticket and countdown creative — the full push.", pricing: "pct_off", value: 10, items: [{ slug: "event-flyer", qty: 1 }, { slug: "event-poster", qty: 1 }, { slug: "social-media-post-design", qty: 1 }, { slug: "instagram-story-design", qty: 1 }, { slug: "ticket-sale-graphic", qty: 1 }, { slug: "event-countdown-graphic", qty: 1 }] },
  { slug: "brand-launch", name: "Brand Launch", blurb: "Logo, identity, card, social kit and templates — the complete system.", pricing: "pct_off", value: 15, items: [{ slug: "logo-design", qty: 1 }, { slug: "brand-identity", qty: 1 }, { slug: "business-card", qty: 1 }, { slug: "social-branding-kit", qty: 1 }, { slug: "brand-templates", qty: 1 }], featured: true },
];

/* ---------------- pricing engine (PRD §16) ---------------- */

export interface ConfigSelection {
  sizeId?: string;                 // preset size
  customSize?: { w: number; h: number; unit: SizeUnit };
  optionIds: string[];
  qty: number;
  tierId?: string;                 // productized tier (replaces base price)
  selectedVariants?: Record<string, string>; // variation group id -> selected option id
}

export interface PricedLine {
  service: DesignService;
  tier: ServiceTier | null;
  selectedVariants?: { groupId: string; groupName: string; option: ServiceVariantOption }[];
  variantLabel?: string;
  size: DesignSize | null;
  customSize: ConfigSelection["customSize"] | null;
  sizeLabel: string;
  sizeAdj: number;
  options: { id: string; name: string; amount: number }[];
  qty: number;
  unitBase: number;                // base (or variant/tier price) + size adj (per design)
  optionsPerDesign: number;
  projectFees: number;
  lineTotal: number;
  isQuote: boolean;
  turnaround: string;              // variant/tier override → service default
  revisions: number;               // variant/tier override → service default
}

export function sizeById(id: string | undefined, sizes: DesignSize[] = DESIGN_SIZES): DesignSize | null {
  return sizes.find((s) => s.id === id) ?? null;
}

export function validateCustomSize(
  s: DesignService, w: number, h: number
): string | null {
  if (!s.allowCustomSize || !s.customLimits) return "This service doesn't support custom sizes.";
  const L = s.customLimits;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return "Enter valid width and height.";
  if (w < L.minW || w > L.maxW) return `Width must be between ${L.minW} and ${L.maxW} ${L.unit}.`;
  if (h < L.minH || h > L.maxH) return `Height must be between ${L.minH} and ${L.maxH} ${L.unit}.`;
  return null;
}

export function priceLine(
  s: DesignService,
  sel: ConfigSelection,
  opts: { sizes?: DesignSize[]; options?: DesignOption[] } = {}
): PricedLine {
  const sizes = opts.sizes ?? DESIGN_SIZES;
  const allOptions = opts.options ?? DESIGN_OPTIONS;
  const qty = Math.max(s.minQty, Math.min(s.maxQty, Math.round(sel.qty) || s.minQty));
  const isQuote = isQuoteOnly(s);

  // 1. Resolve selected variations (first-class variant pricing)
  const selectedVariantDetails: PricedLine["selectedVariants"] = [];
  let variantBasePrice: number | null = null;
  let variantTurnaround: string | undefined;
  let variantRevisions: number | undefined;

  if (s.variations && s.variations.length > 0) {
    s.variations.forEach((group, idx) => {
      const chosenId = sel.selectedVariants?.[group.id] || group.options.find((o) => o.isDefault)?.id || group.options[0]?.id;
      const opt = group.options.find((o) => o.id === chosenId) || group.options[0];
      if (opt) {
        selectedVariantDetails.push({ groupId: group.id, groupName: group.name, option: opt });
        if (idx === 0) {
          variantBasePrice = opt.price;
        } else {
          // secondary variation groups add their price
          variantBasePrice = (variantBasePrice ?? s.price) + opt.price;
        }
        if (opt.turnaround) variantTurnaround = opt.turnaround;
        if (opt.revisions !== undefined) variantRevisions = opt.revisions;
      }
    });
  }

  // 2. Productized tier — replaces base price when picked
  const tier = (s.tiers ?? []).find((t) => t.id === sel.tierId) ?? null;
  const basePrice = tier ? tier.price : (variantBasePrice !== null ? variantBasePrice : s.price);

  const variantLabel = selectedVariantDetails.map((v) => v.option.name).join(" · ");

  // 3. Size adjustment
  let size: DesignSize | null = null;
  let sizeAdj = 0;
  let sizeLabel = "";
  if (sel.customSize && s.allowCustomSize) {
    sizeLabel = `Custom ${sel.customSize.w} × ${sel.customSize.h} ${sel.customSize.unit}`;
  } else if (sel.sizeId) {
    size = sizeById(sel.sizeId, sizes);
    const rel = s.sizes.find((x) => x.sizeId === sel.sizeId);
    if (rel?.adjType === "fixed") sizeAdj = rel.adj ?? 0;
    if (rel?.adjType === "percentage") sizeAdj = (basePrice * (rel.adj ?? 0)) / 100;
    sizeLabel = size?.name ?? "";
  }

  const unitBase = basePrice + sizeAdj;

  // 4. Options, by scope (PRD §16)
  let optionsPerDesign = 0;
  let projectFees = 0;
  const options: PricedLine["options"] = [];
  for (const id of sel.optionIds) {
    const o = allOptions.find((x) => x.id === id && x.active !== false);
    if (!o || !s.optionIds.includes(id)) continue;
    const amount = o.pricing === "percentage" ? (unitBase * o.price) / 100 : o.price;
    if (o.scope === "project") projectFees += amount;
    else if (o.scope === "quantity") optionsPerDesign += amount; // multiplied by qty below
    else optionsPerDesign += amount;                             // per design (qty = designs)
    options.push({ id, name: o.name, amount });
  }

  const lineTotal = isQuote ? 0 : (unitBase + optionsPerDesign) * qty + projectFees;
  return {
    service: s, tier, selectedVariants: selectedVariantDetails, variantLabel: variantLabel || undefined,
    size, customSize: sel.customSize ?? null, sizeLabel, sizeAdj,
    options, qty, unitBase, optionsPerDesign, projectFees, lineTotal, isQuote,
    turnaround: tier?.turnaround ?? variantTurnaround ?? s.turnaround,
    revisions: tier?.revisions ?? variantRevisions ?? s.revisions,
  };
}

export function bestDiscount(
  subtotal: number, itemCount: number, discounts: DesignDiscount[] = DESIGN_DISCOUNTS
): { discount: DesignDiscount; amount: number } | null {
  const eligible = discounts
    .filter((d) => d.active !== false && subtotal >= d.minSubtotal && itemCount >= d.minItems)
    .sort((a, b) => b.priority - a.priority);
  const d = eligible[0];
  if (!d) return null;
  const amount = d.type === "percentage" ? (subtotal * d.value) / 100 : Math.min(d.value, subtotal);
  return { discount: d, amount };
}

export function packageValue(
  pkg: DesignPackage, catalog: DesignService[] = DESIGN_SERVICES
): { regular: number; price: number; savings: number } {
  const regular = pkg.items.reduce((sum, it) => {
    const s = catalog.find((x) => x.slug === it.slug);
    return sum + (s && s.price > 0 ? s.price * it.qty : 0);
  }, 0);
  let price = regular;
  if (pkg.pricing === "fixed" && pkg.price != null) price = pkg.price;
  else if (pkg.pricing === "pct_off" && pkg.value != null) price = regular * (1 - pkg.value / 100);
  else if (pkg.pricing === "fixed_off" && pkg.value != null) price = Math.max(0, regular - pkg.value);
  return { regular, price, savings: Math.max(0, regular - price) };
}

/** Display helper: "From $95" / "$95" / "Custom quote" — currency-aware. */
export function priceLabel(s: DesignService, fmtFn?: (n: number) => string): string {
  if (isQuoteOnly(s)) return "Custom quote";
  const f = fmtFn ?? ((n: number) => `$${n.toLocaleString()}`);
  const tierPrices = (s.tiers ?? []).map((t) => t.price);
  const variantPrices = (s.variations ?? []).flatMap((g) => g.options.map((o) => o.price)).filter((p) => p > 0);
  const allPrices = [s.price, ...tierPrices, ...variantPrices].filter((p) => p > 0);
  const lowest = allPrices.length ? Math.min(...allPrices) : s.price;
  const base = f(lowest);
  const hasVariantsOrTiers = (s.tiers ?? []).length > 0 || (s.variations ?? []).length > 0;
  return s.pricingType === "starting_at" || hasVariantsOrTiers ? `From ${base}` : base;
}
