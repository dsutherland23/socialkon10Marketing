import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  addManaged, getFileUrl, listManaged,
  type OrderRecord,
} from "./backend";
import { firebaseReady } from "./firebase";
import { track } from "./seo";

/* ------------------------------------------------------------------
   DESIGN TEMPLATES MARKETPLACE (Templates PRD)
   Data model (§53), seed catalog, provider with admin-managed merge,
   entitlements (§54), favorites (§30), secure downloads (§22–§24).
   Extends the existing backend — no duplicate auth/checkout/storage.
------------------------------------------------------------------- */

export type TemplateStatus = "draft" | "published" | "unpublished" | "archived";
export type Orientation = "square" | "portrait" | "landscape";

export interface TemplateVersion {
  version: string;      // "1.0", "1.1"…
  date: string;         // ISO
  notes: string;        // changelog
  status: "current" | "superseded";
}

export interface Template {
  slug: string;
  name: string;
  description: string;
  category: string;         // category slug
  subcategory?: string;
  tags: string[];
  keywords: string[];
  software: string;         // "Adobe Photoshop", "Canva"…
  fileFormat: string;       // "PSD", "AI", "INDD", "Canva Link"…
  dimensions: string;       // "1080 × 1350 px"
  resolution: string;       // "300 DPI"
  colorMode: string;        // "CMYK" / "RGB"
  fileSize: string;         // "48 MB"
  orientation: Orientation;
  features: string[];       // keys from TEMPLATE_FEATURES
  fonts: string[];          // e.g. "Montserrat — free, link included"
  price: number;            // USD; 0 = free
  salePrice?: number;       // USD, when on sale
  licenseFees: { personal: number; commercial: number; extended: number };
  customizePrice: number;   // designer customization add-on (Option B)
  customizeAvailable: boolean;
  versions: TemplateVersion[];
  previewImages: string[];  // public preview assets only — NEVER the source file
  thumbnail?: string;       // public thumbnail
  privateFilePath?: string; // admin-only storage path; never rendered publicly
  canvasJson?: string;      // Kon10 Editor master doc (serialized Kon10Doc) — never public
  exports?: { png: boolean; jpg: boolean; pdf: boolean }; // editor export permissions (§37)
  status: TemplateStatus;
  bestseller: boolean;
  isNew: boolean;
  sales: number;            // seed popularity for "best selling" sort
  hue: number;              // generative preview hue
  createdAt: string;
}

export interface TemplateCategory {
  slug: string;
  name: string;
  subs: string[];
  sort: number;
  active?: boolean;
}

export interface TemplateBundle {
  slug: string;
  name: string;
  description: string;
  templateSlugs: string[];
  price: number;
  hue: number;
  active?: boolean;
}

export interface TemplateReview {
  id?: string;
  templateSlug: string;
  orderId: string;
  name: string;
  email: string;
  rating: number;           // 1–5
  review: string;
  status: "pending" | "approved";
  createdAt?: string;
}

/* ---------------- licenses (§16) ---------------- */

export const LICENSES = [
  { id: "personal", name: "Personal License", blurb: "For personal, non-commercial projects." },
  { id: "commercial", name: "Commercial License", blurb: "For business and commercial marketing use." },
  { id: "extended", name: "Agency / Extended License", blurb: "For professional and client work across multiple projects." },
] as const;
export type LicenseId = (typeof LICENSES)[number]["id"];

/* ---------------- feature vocabulary (§6 filters, §13 checklist) ---------------- */

export const TEMPLATE_FEATURES = [
  "Editable", "Print Ready", "Social Media", "Fully Layered",
  "Includes Fonts", "Commercial License",
] as const;

export const INCLUDED_CHECKLIST = [
  { feature: "Editable", label: "Editable source file" },
  { feature: "Fully Layered", label: "Organized layers" },
  { feature: "Print Ready", label: "Print ready" },
  { feature: "Includes Fonts", label: "Fonts included / linked" },
  { feature: "Social Media", label: "Sized for social" },
  { feature: "Commercial License", label: "Commercial use allowed" },
] as const;

/* ---------------- categories (§4) ---------------- */

export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  { slug: "events", name: "Events", sort: 1, subs: ["Party Flyers", "Concert Flyers", "Festival Flyers", "Birthday Flyers", "Wedding", "Invitations", "Event Posters"] },
  { slug: "business", name: "Business", sort: 2, subs: ["Business Flyers", "Company Profiles", "Business Cards", "Brochures", "Price Lists", "Corporate Materials"] },
  { slug: "social", name: "Social Media", sort: 3, subs: ["Instagram Posts", "Instagram Stories", "Facebook Posts", "Social Media Ads", "Carousels", "Promotional Graphics"] },
  { slug: "music", name: "Music & Entertainment", sort: 4, subs: ["Album Covers", "Single Covers", "Mixtapes", "DJ Flyers", "Concert Flyers", "Artist Promotion"] },
  { slug: "food", name: "Food & Restaurant", sort: 5, subs: ["Menus", "Restaurant Flyers", "Food Promotions", "Specials", "Delivery Promotions"] },
  { slug: "realestate", name: "Real Estate", sort: 6, subs: ["Property Flyers", "Open House", "Property Listings", "Realtor Marketing"] },
  { slug: "beauty", name: "Beauty & Lifestyle", sort: 7, subs: ["Salon", "Barber", "Spa", "Beauty", "Fashion", "Wellness"] },
];

/* ---------------- seed catalog ---------------- */

const v1 = (date: string): TemplateVersion[] => [{ version: "1.0", date, notes: "Initial release.", status: "current" }];

const STD_LICENSE_FEES = { personal: 0, commercial: 10, extended: 25 };

function t(partial: Omit<Template, "licenseFees" | "versions" | "previewImages" | "status" | "sales" | "customizeAvailable" | "keywords"> & Partial<Template>): Template {
  return {
    licenseFees: STD_LICENSE_FEES,
    versions: v1(partial.createdAt),
    previewImages: [],
    status: "published",
    sales: 0,
    customizeAvailable: true,
    keywords: [],
    ...partial,
  };
}

export const TEMPLATE_SEEDS: Template[] = [
  t({
    slug: "summer-vibes-party-flyer", name: "Summer Vibes Party Flyer",
    description: "A sun-soaked portrait flyer for summer parties, beach events and DJ nights. Swap the headline, date and venue, drop in your own photo, and you're print- and story-ready in minutes.",
    category: "events", subcategory: "Party Flyers",
    tags: ["summer", "party", "tropical", "beach", "event", "dj", "festival"],
    software: "Adobe Photoshop", fileFormat: "PSD", dimensions: "1080 × 1350 px",
    resolution: "300 DPI", colorMode: "CMYK", fileSize: "48 MB", orientation: "portrait",
    features: ["Editable", "Print Ready", "Social Media", "Fully Layered", "Includes Fonts"],
    fonts: ["Montserrat — free, link included", "Bebas Neue — free, link included"],
    price: 35, salePrice: 25, customizePrice: 75,
    bestseller: true, isNew: false, hue: 16, createdAt: "2026-05-02", sales: 184,
  }),
  t({
    slug: "neon-nights-concert-flyer", name: "Neon Nights Concert Flyer",
    description: "A high-contrast neon concert flyer built for clubs and live venues. Fully layered with editable glow effects, lineup lists and ticket info blocks.",
    category: "events", subcategory: "Concert Flyers",
    tags: ["concert", "neon", "club", "night", "live music", "lineup"],
    software: "Adobe Photoshop", fileFormat: "PSD", dimensions: "1080 × 1350 px",
    resolution: "300 DPI", colorMode: "RGB", fileSize: "62 MB", orientation: "portrait",
    features: ["Editable", "Social Media", "Fully Layered", "Includes Fonts"],
    fonts: ["Anton — free, link included"],
    price: 20, customizePrice: 65,
    bestseller: false, isNew: true, hue: 285, createdAt: "2026-08-04", sales: 41,
  }),
  t({
    slug: "elegant-wedding-invitation", name: "Elegant Wedding Invitation Suite",
    description: "A refined wedding invitation with matching detail card. Serif-led typography, delicate dividers and print-ready bleed setup for professional output.",
    category: "events", subcategory: "Wedding",
    tags: ["wedding", "invitation", "elegant", "serif", "romantic"],
    software: "Adobe InDesign", fileFormat: "INDD", dimensions: "5 × 7 in",
    resolution: "300 DPI", colorMode: "CMYK", fileSize: "24 MB", orientation: "portrait",
    features: ["Editable", "Print Ready", "Fully Layered", "Includes Fonts"],
    fonts: ["Cormorant Garamond — free, link included"],
    price: 30, customizePrice: 90,
    bestseller: false, isNew: false, hue: 36, createdAt: "2026-03-18", sales: 96,
  }),
  t({
    slug: "corporate-company-profile", name: "Corporate Company Profile",
    description: "A 12-page company profile layout for proposals and capability decks. Master pages, paragraph styles and a grid system keep every edit consistent.",
    category: "business", subcategory: "Company Profiles",
    tags: ["corporate", "profile", "proposal", "brochure", "business"],
    software: "Adobe InDesign", fileFormat: "INDD", dimensions: "A4",
    resolution: "300 DPI", colorMode: "CMYK", fileSize: "38 MB", orientation: "portrait",
    features: ["Editable", "Print Ready", "Fully Layered", "Commercial License"],
    fonts: ["Inter — free, link included"],
    price: 45, customizePrice: 150,
    bestseller: false, isNew: false, hue: 215, createdAt: "2026-01-22", sales: 73,
  }),
  t({
    slug: "minimal-business-card-pack", name: "Minimal Business Card Pack",
    description: "Four minimal business card layouts, front and back, with smart-object logo placement and 3.5 × 2 in print specs. Includes a one-page editing guide.",
    category: "business", subcategory: "Business Cards",
    tags: ["business card", "minimal", "stationery", "branding"],
    software: "Adobe Illustrator", fileFormat: "AI", dimensions: "3.5 × 2 in",
    resolution: "300 DPI", colorMode: "CMYK", fileSize: "12 MB", orientation: "landscape",
    features: ["Editable", "Print Ready", "Fully Layered"],
    fonts: ["Inter — free, link included"],
    price: 15, customizePrice: 45,
    bestseller: false, isNew: false, hue: 150, createdAt: "2026-02-10", sales: 128,
  }),
  t({
    slug: "instagram-carousel-coach", name: "Coach Carousel — 10 Slides",
    description: "A free 10-slide Instagram carousel for coaches and educators. Editable in Canva — change the text, swap the palette, export and post.",
    category: "social", subcategory: "Carousels",
    tags: ["instagram", "carousel", "coach", "education", "free"],
    software: "Canva", fileFormat: "Canva Link", dimensions: "1080 × 1080 px",
    resolution: "72 DPI", colorMode: "RGB", fileSize: "Online", orientation: "square",
    features: ["Editable", "Social Media"],
    fonts: ["Canva built-in fonts"],
    price: 0, customizePrice: 55,
    bestseller: false, isNew: true, hue: 200, createdAt: "2026-08-10", sales: 312,
  }),
  t({
    slug: "social-ad-launch-pack", name: "Product Launch Social Ad Pack",
    description: "Six coordinated ad layouts for product launches — feed, story and landscape crops on one artboard system, with editable CTA blocks.",
    category: "social", subcategory: "Social Media Ads",
    tags: ["ads", "launch", "promo", "instagram", "facebook"],
    software: "Adobe Photoshop", fileFormat: "PSD", dimensions: "1080 × 1080 / 1080 × 1920 px",
    resolution: "72 DPI", colorMode: "RGB", fileSize: "54 MB", orientation: "square",
    features: ["Editable", "Social Media", "Fully Layered", "Commercial License"],
    fonts: ["Montserrat — free, link included"],
    price: 28, salePrice: 22, customizePrice: 80,
    bestseller: true, isNew: false, hue: 330, createdAt: "2026-04-15", sales: 158,
  }),
  t({
    slug: "midnight-album-cover", name: "Midnight Album Cover",
    description: "A moody, texture-driven album cover for streaming platforms. 3000 × 3000 px master with editable typography and grain layers.",
    category: "music", subcategory: "Album Covers",
    tags: ["album", "cover", "music", "spotify", "moody"],
    software: "Adobe Photoshop", fileFormat: "PSD", dimensions: "3000 × 3000 px",
    resolution: "300 DPI", colorMode: "RGB", fileSize: "86 MB", orientation: "square",
    features: ["Editable", "Fully Layered", "Includes Fonts", "Commercial License"],
    fonts: ["Bebas Neue — free, link included"],
    price: 25, customizePrice: 70,
    bestseller: true, isNew: false, hue: 255, createdAt: "2026-03-01", sales: 203,
  }),
  t({
    slug: "dj-residency-flyer", name: "DJ Residency Flyer",
    description: "A bold weekly-residency flyer with a modular date strip — duplicate the row, change the date, done. Built for fast weekly turnarounds.",
    category: "music", subcategory: "DJ Flyers",
    tags: ["dj", "residency", "club", "weekly", "party"],
    software: "Adobe Photoshop", fileFormat: "PSD", dimensions: "1080 × 1350 px",
    resolution: "300 DPI", colorMode: "CMYK", fileSize: "44 MB", orientation: "portrait",
    features: ["Editable", "Print Ready", "Social Media", "Fully Layered"],
    fonts: ["Anton — free, link included"],
    price: 18, customizePrice: 60,
    bestseller: false, isNew: true, hue: 100, createdAt: "2026-08-12", sales: 22,
  }),
  t({
    slug: "restaurant-menu-board", name: "Restaurant Menu Board",
    description: "A clean single-page menu layout with price columns and special-callout blocks. Sized for print and for screen display in-store.",
    category: "food", subcategory: "Menus",
    tags: ["menu", "restaurant", "food", "price list", "cafe"],
    software: "Adobe Illustrator", fileFormat: "AI", dimensions: "11 × 17 in",
    resolution: "300 DPI", colorMode: "CMYK", fileSize: "18 MB", orientation: "portrait",
    features: ["Editable", "Print Ready", "Fully Layered", "Commercial License"],
    fonts: ["Inter — free, link included"],
    price: 28, customizePrice: 85,
    bestseller: false, isNew: false, hue: 24, createdAt: "2026-02-26", sales: 87,
  }),
  t({
    slug: "weekend-brunch-promo", name: "Weekend Brunch Promo Set",
    description: "A matching flyer + Instagram post pair for brunch specials and weekend promotions. One palette, two formats, five-minute edits.",
    category: "food", subcategory: "Food Promotions",
    tags: ["brunch", "promo", "restaurant", "specials", "weekend"],
    software: "Adobe Photoshop", fileFormat: "PSD", dimensions: "1080 × 1350 + 1080 × 1080 px",
    resolution: "300 DPI", colorMode: "CMYK", fileSize: "52 MB", orientation: "portrait",
    features: ["Editable", "Print Ready", "Social Media", "Fully Layered"],
    fonts: ["Montserrat — free, link included"],
    price: 16, customizePrice: 60,
    bestseller: false, isNew: false, hue: 42, createdAt: "2026-05-20", sales: 64,
  }),
  t({
    slug: "open-house-property-flyer", name: "Open House Property Flyer",
    description: "A photo-forward property flyer with feature list, agent block and QR space. Built for same-day open-house turnarounds.",
    category: "realestate", subcategory: "Open House",
    tags: ["real estate", "open house", "property", "realtor", "listing"],
    software: "Adobe Photoshop", fileFormat: "PSD", dimensions: "8.5 × 11 in",
    resolution: "300 DPI", colorMode: "CMYK", fileSize: "34 MB", orientation: "portrait",
    features: ["Editable", "Print Ready", "Fully Layered"],
    fonts: ["Inter — free, link included"],
    price: 20, customizePrice: 65,
    bestseller: false, isNew: false, hue: 175, createdAt: "2026-04-02", sales: 58,
  }),
  t({
    slug: "salon-price-list", name: "Salon Price List",
    description: "An elegant service price list for salons and spas — tiered sections, fine rules and plenty of whitespace. Print or post.",
    category: "beauty", subcategory: "Salon",
    tags: ["salon", "price list", "spa", "beauty", "elegant"],
    software: "Canva", fileFormat: "Canva Link", dimensions: "A4 + 1080 × 1350 px",
    resolution: "300 DPI", colorMode: "CMYK", fileSize: "Online", orientation: "portrait",
    features: ["Editable", "Print Ready", "Social Media"],
    fonts: ["Canva built-in fonts"],
    price: 15, customizePrice: 50,
    bestseller: false, isNew: true, hue: 320, createdAt: "2026-08-15", sales: 19,
  }),
];

export const TEMPLATE_BUNDLES: TemplateBundle[] = [
  {
    slug: "restaurant-marketing-pack", name: "Restaurant Marketing Pack",
    description: "Menu board, brunch promo set and the free carousel framework — the full weekly-marketing kit for restaurants and cafés.",
    templateSlugs: ["restaurant-menu-board", "weekend-brunch-promo", "instagram-carousel-coach"],
    price: 29, hue: 30,
  },
  {
    slug: "event-starter-pack", name: "Event Starter Pack",
    description: "Summer party flyer, neon concert flyer and DJ residency flyer — three proven event layouts at one bundle price.",
    templateSlugs: ["summer-vibes-party-flyer", "neon-nights-concert-flyer", "dj-residency-flyer"],
    price: 39, hue: 280,
  },
];

/* ---------------- helpers ---------------- */

export function effectivePrice(tpl: Template): number {
  return tpl.salePrice !== undefined && tpl.salePrice < tpl.price ? tpl.salePrice : tpl.price;
}

export function currentVersion(tpl: Template): TemplateVersion | undefined {
  return tpl.versions.find((v) => v.status === "current") ?? tpl.versions[tpl.versions.length - 1];
}

export function bundleValue(b: TemplateBundle, templates: Template[]): number {
  return b.templateSlugs.reduce((s, slug) => {
    const tpl = templates.find((x) => x.slug === slug);
    return s + (tpl ? effectivePrice(tpl) : 0);
  }, 0);
}

export function matchesQuery(tpl: Template, q: string): boolean {
  const hay = [tpl.name, tpl.description, tpl.category, tpl.subcategory ?? "", tpl.software, ...tpl.tags, ...tpl.keywords]
    .join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

/* ---------------- provider: seeds + admin-managed merge (§37–§40) ---------------- */

interface TemplateCatalog {
  templates: Template[];          // all statuses — admin needs them
  categories: TemplateCategory[];
  bundles: TemplateBundle[];
  ready: boolean;
}

const seedState: TemplateCatalog = {
  templates: TEMPLATE_SEEDS,
  categories: TEMPLATE_CATEGORIES,
  bundles: TEMPLATE_BUNDLES,
  ready: false,
};

const TemplateCtx = createContext<TemplateCatalog>(seedState);

function mergeBySlug<T extends { slug: string }>(seeds: T[], managed: Record<string, unknown>[]): T[] {
  const map = new Map<string, T>(seeds.map((s) => [s.slug, s]));
  managed.forEach((m) => {
    const k = String(m.slug ?? "").trim();
    if (!k) return;
    map.set(k, { ...(map.get(k) ?? {}), ...m, slug: k } as T);
  });
  return [...map.values()];
}

export function TemplateCatalogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TemplateCatalog>(seedState);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [mT, mC, mB] = await Promise.all([
          listManaged("templates"), listManaged("templateCategories"), listManaged("templateBundles"),
        ]);
        if (!alive) return;
        const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) && v !== "" ? Number(v) : d);
        const strArr = (v: unknown): string[] => Array.isArray(v) ? v.map(String) : typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];

        const templates = mergeBySlug<Template>(TEMPLATE_SEEDS, mT).map((x) => ({
          ...x,
          price: num(x.price, 0),
          salePrice: x.salePrice === undefined || x.salePrice === null || (x.salePrice as unknown) === "" ? undefined : num(x.salePrice, 0),
          customizePrice: num(x.customizePrice, 0),
          sales: num(x.sales, 0),
          tags: strArr(x.tags), keywords: strArr(x.keywords), features: strArr(x.features), fonts: strArr(x.fonts),
          previewImages: strArr(x.previewImages),
          versions: Array.isArray(x.versions) && x.versions.length ? x.versions : v1(x.createdAt || new Date().toISOString().slice(0, 10)),
          licenseFees: x.licenseFees ?? STD_LICENSE_FEES,
          status: (x.status ?? "published") as TemplateStatus,
        }));
        const categories = mergeBySlug<TemplateCategory>(TEMPLATE_CATEGORIES, mC)
          .map((c) => ({ ...c, subs: strArr(c.subs), sort: num(c.sort, 99), active: c.active !== false && (c.active as unknown) !== "false" }))
          .sort((a, b) => a.sort - b.sort);
        const bundles = mergeBySlug<TemplateBundle>(TEMPLATE_BUNDLES, mB)
          .map((b) => ({ ...b, templateSlugs: strArr(b.templateSlugs), price: num(b.price, 0), active: b.active !== false && (b.active as unknown) !== "false" }));

        setState({ templates, categories, bundles, ready: true });
      } catch { /* seeds remain */ }
    };
    load();
    window.addEventListener("sk-content-changed", load);
    return () => { alive = false; window.removeEventListener("sk-content-changed", load); };
  }, []);

  return <TemplateCtx.Provider value={state}>{children}</TemplateCtx.Provider>;
}

export function useTemplates() {
  return useContext(TemplateCtx);
}

/** Public catalog — published only (§40). */
export function usePublishedTemplates() {
  const { templates, ...rest } = useTemplates();
  return useMemo(
    () => ({ ...rest, templates: templates.filter((x) => x.status === "published") }),
    [templates, rest]
  );
}

export function templateBySlug(templates: Template[], slug: string): Template | undefined {
  return templates.find((x) => x.slug === slug);
}

/* ---------------- entitlements (§54) ----------------
   Customer → Order → Template → License → Version.
   Library entries are derived from order items carrying templateSlug,
   never from product-name matching. */

export interface Entitlement {
  templateSlug: string;
  name: string;
  license: string;
  orderId: string;
  purchasedAt: string;
  version: string;          // version at purchase time
  customized: boolean;      // designer customization was purchased with it
}

export function entitlementsFromOrders(orders: OrderRecord[], bundles: TemplateBundle[] = []): Entitlement[] {
  const out: Entitlement[] = [];
  for (const o of orders) {
    for (const i of o.items) {
      if (!i.templateSlug) continue;
      // bundle purchase → entitlement for every template inside (§33/§54)
      if (i.templateSlug.startsWith("bundle:")) {
        const b = bundles.find((x) => x.slug === i.templateSlug!.slice(7));
        for (const slug of b?.templateSlugs ?? []) {
          out.push({
            templateSlug: slug,
            name: `${b?.name ?? "Bundle"} — ${slug}`,
            license: i.license ?? "Personal License",
            orderId: o.id,
            purchasedAt: o.createdAt,
            version: i.version ?? "1.0",
            customized: false,
          });
        }
        continue;
      }
      out.push({
        templateSlug: i.templateSlug,
        name: i.name,
        license: i.license ?? i.tierLabel ?? "Personal License",
        orderId: o.id,
        purchasedAt: o.createdAt,
        version: i.version ?? "1.0",
        customized: i.addons.some((a) => /custom/i.test(a.name)),
      });
    }
  }
  return out.sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));
}

/* ---------------- cart wiring (§17) — reuses the existing shop/checkout ---------------- */

export function templateCartItem(tpl: Template, licenseId: LicenseId, withCustomization: boolean) {
  const license = LICENSES.find((l) => l.id === licenseId) ?? LICENSES[0];
  return {
    serviceSlug: `template:${tpl.slug}`,
    name: tpl.name,
    unitPrice: effectivePrice(tpl) + (tpl.licenseFees[license.id] ?? 0),
    tierLabel: license.name,
    addons: withCustomization
      ? [{ id: "customize", name: "Designer customization", price: tpl.customizePrice }]
      : [],
    rush: false,
    billing: "one_time" as const,
    depositPct: 100, // digital goods are paid in full — no deposit split
    templateSlug: tpl.slug,
    license: license.name,
    version: currentVersion(tpl)?.version ?? "1.0",
  };
}

export function bundleCartItem(b: TemplateBundle) {
  return {
    serviceSlug: `template-bundle:${b.slug}`,
    name: b.name,
    unitPrice: b.price,
    tierLabel: "Bundle — Personal License",
    addons: [] as { id: string; name: string; price: number }[],
    rush: false,
    billing: "one_time" as const,
    depositPct: 100,
    templateSlug: `bundle:${b.slug}`,
    license: "Personal License",
  };
}

/* ---------------- favorites (§30) — local, account-free in demo mode ---------------- */

const FAV_KEY = "sk-template-favorites";

export function useTemplateFavorites() {
  const [favs, setFavs] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(FAV_KEY) || "[]"); } catch { return []; }
  });
  useEffect(() => { localStorage.setItem(FAV_KEY, JSON.stringify(favs)); }, [favs]);
  const toggle = (slug: string) => {
    setFavs((xs) => {
      const next = xs.includes(slug) ? xs.filter((x) => x !== slug) : [...xs, slug];
      track("template_favorite", { template: slug, favorited: !xs.includes(slug) });
      return next;
    });
  };
  return { favs, toggle, isFav: (slug: string) => favs.includes(slug) };
}

/* ---------------- secure download (§22–§24, §57) ----------------
   Flow: authenticated customer → entitlement verified by caller →
   storage path resolved to a temporary URL at request time → download.
   The storage path itself is never rendered on public pages. */

export type DownloadResult = { ok: true } | { ok: false; error: string };

export async function downloadTemplate(
  tpl: Template,
  orderId: string,
  customerEmail: string,
): Promise<DownloadResult> {
  try {
    // download record (§24) — customer support / fraud / analytics
    const version = currentVersion(tpl)?.version ?? "1.0";
    void addManaged("downloadRecords", {
      templateSlug: tpl.slug, version, orderId, email: customerEmail,
      downloadedAt: new Date().toISOString(),
    });
    track("template_download", { template: tpl.slug, version });

    const path = tpl.privateFilePath;
    if (firebaseReady && path && !path.startsWith("demo://")) {
      const url = await getFileUrl(path); // temporary, tokened URL resolved at request time
      const a = document.createElement("a");
      a.href = url;
      a.download = `${tpl.slug}-v${version}`;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      return { ok: true };
    }
    // demo mode (or no file uploaded yet): deliver a license/readme bundle stub
    const blob = new Blob(
      [
        `${tpl.name}\n${"=".repeat(tpl.name.length)}\n\n`,
        `Version: ${version}\nOrder: ${orderId}\nLicensed to: ${customerEmail}\n\n`,
        `This is a demo download — connect Firebase and upload the source file\n`,
        `(PSD/AI/INDD/ZIP) in Admin → Templates to deliver the real asset.\n`,
      ],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tpl.slug}-v${version}-readme.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return { ok: true };
  } catch {
    return { ok: false, error: "Download failed — please try again." }; // never expose internals (§59)
  }
}
