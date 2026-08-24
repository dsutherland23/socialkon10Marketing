import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  CONTACT, FAQS, PROJECTS, SERVICES, SOCIAL_LINKS, TESTIMONIALS,
  type FaqItem, type Project, type ServiceProduct, type Testimonial,
} from "./data";
import { getServiceOverrides, getSettings, listManaged } from "./backend";

/* ------------------------------------------------------------------
   CONTENT PROVIDER
   Loads admin-managed content from Firestore (or demo localStorage)
   once, and exposes merged content: service prices/deposits/
   availability + testimonials + FAQs + portfolio + promo codes +
   site settings. Falls back to shipped defaults.
------------------------------------------------------------------- */

export interface PromoCode { type: "pct" | "fixed"; value: number; label: string }

export interface HomeContent {
  headline: string | null;      // null → styled default hero
  sub: string;
  marquee: string[];
  sections: Record<string, boolean>; // section key → visible
}

export const HOME_SECTIONS: { key: string; label: string }[] = [
  { key: "departments", label: "Departments index" },
  { key: "creativeSystem", label: "The creative system" },
  { key: "featuredWork", label: "Featured work" },
  { key: "why", label: "Why Social Kon10" },
  { key: "process", label: "Process" },
  { key: "packages", label: "Packages teaser" },
  { key: "testimonials", label: "Testimonials" },
  { key: "faq", label: "FAQ" },
];

const DEFAULT_HOME: HomeContent = {
  headline: null,
  sub: "Branding. Social Media. Websites. Creative strategy built to help businesses look better, connect better and grow.",
  marquee: ["Branding", "Social Media", "Websites", "Design that connects", "Marketing that moves", "Digital that grows"],
  sections: Object.fromEntries(HOME_SECTIONS.map((s) => [s.key, true])),
};

interface ContentState {
  services: ServiceProduct[];
  testimonials: Testimonial[];
  faqs: FaqItem[];
  projects: Project[];
  promos: Record<string, PromoCode>;
  contact: { phone: string; phoneHref: string; email: string; location: string };
  socials: { id: string; label: string; href: string }[];
  home: HomeContent;
}

const defaults: ContentState = {
  services: SERVICES,
  testimonials: TESTIMONIALS,
  faqs: FAQS,
  projects: PROJECTS,
  promos: {},
  contact: CONTACT,
  socials: SOCIAL_LINKS,
  home: DEFAULT_HOME,
};
const ContentCtx = createContext<ContentState>(defaults);

export function ContentProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ContentState>(defaults);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [overrides, managedT, managedF, managedP, managedPromo, managedServices, settings] = await Promise.all([
          getServiceOverrides(),
          listManaged("testimonials"),
          listManaged("faqs"),
          listManaged("portfolio"),
          listManaged("promos"),
          listManaged("services"),
          getSettings(),
        ]);
        if (!alive) return;

        const services: ServiceProduct[] = SERVICES
          .map((s) => {
            const o = overrides[s.slug];
            if (!o) return s;
            return {
              ...s,
              price: o.price ?? s.price,
              depositPct: o.depositPct ?? s.depositPct,
              revisions: o.revisions ?? s.revisions,
              featured: o.featured ?? s.featured,
              name: o.name ?? s.name,
              tagline: o.tagline ?? s.tagline,
              description: o.description ?? s.description,
              timeline: o.timeline ?? s.timeline,
              deliverables: o.deliverables ?? s.deliverables,
            };
          })
          .filter((s) => overrides[s.slug]?.enabled !== false);

        // admin-created custom services (PRD §33 — add service without code)
        managedServices.forEach((m, i) => {
          const name = String(m.name ?? "").trim();
          if (!name) return;
          const slug = String(m.slug ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
          services.push({
            id: String(m.pid ?? `SK-CMS-${String(i + 1).padStart(2, "0")}`),
            dept: (["brand", "social", "web"].includes(String(m.dept)) ? m.dept : "brand") as ServiceProduct["dept"],
            slug,
            name,
            tagline: String(m.tagline ?? ""),
            description: String(m.description ?? ""),
            price: Number(m.price) || 0,
            priceType: Number(m.price) > 0 ? "fixed" : "quote",
            currency: "USD",
            billing: m.billing === "monthly" ? "monthly" : "one_time",
            depositPct: Number(m.depositPct) || 50,
            timeline: String(m.timeline ?? "Scoped per project"),
            revisions: Number(m.revisions ?? 3),
            deliverables: String(m.deliverables ?? "").split("\n").map((d) => d.trim()).filter(Boolean),
            addons: [],
            featured: m.featured === true || m.featured === "true",
            seoTitle: `${name} — Social Kon10 Marketing`,
            seoDescription: String(m.description ?? "").slice(0, 155),
          });
        });

        const testimonials = [
          ...TESTIMONIALS,
          ...managedT.map((t) => ({ name: String(t.name), company: String(t.company), service: (t.service as Testimonial["service"]) ?? "brand", quote: String(t.quote) })),
        ];
        const faqs = [
          ...FAQS,
          ...managedF.map((f) => ({ q: String(f.q), a: String(f.a), dept: (f.dept as FaqItem["dept"]) ?? "checkout" })),
        ];

        // admin-added / edited portfolio projects (PRD §67)
        const managedProjects: Project[] = managedP
          .filter((p) => p.enabled !== false)
          .map((p, i) => ({
            id: String(p.pid ?? `CMS-${String(i + 1).padStart(3, "0")}`),
            slug: String(p.slug ?? p.id),
            title: String(p.title ?? "Untitled"),
            client: String(p.client ?? ""),
            categories: String(p.categories ?? "BRANDING").split(",").map((c) => c.trim().toUpperCase()).filter(Boolean),
            dept: (p.dept as Project["dept"]) ?? "brand",
            industry: String(p.industry ?? ""),
            year: String(p.year ?? new Date().getFullYear()),
            services: String(p.services ?? "").split(",").map((s) => s.trim()).filter(Boolean),
            coverSeed: (Number(p.id) || 7) * 13 + 5,
            hue: Number(p.hue ?? 210),
            summary: String(p.summary ?? ""),
            image: p.image ? String(p.image) : undefined,
            liveUrl: p.liveUrl && /^https:\/\//.test(String(p.liveUrl)) ? String(p.liveUrl) : undefined,
            featured: p.featured === true || p.featured === "true",
            caseStudy: {
              challenge: String(p.challenge ?? ""),
              strategy: String(p.strategy ?? ""),
              creative: String(p.creative ?? ""),
              execution: String(p.execution ?? ""),
              result: String(p.result ?? ""),
            },
          }));

        // Built-ins: exclude any that were overridden or disabled by the CMS
        const managedSlugs = new Set(managedP.map((p) => String(p.slug || p.id)));
        const builtIns = PROJECTS
          .filter((p) => !managedSlugs.has(p.slug) && !managedSlugs.has(p.id));

        const projects = [...managedProjects, ...builtIns];

        const promos: Record<string, PromoCode> = {};
        managedPromo.forEach((m) => {
          const code = String(m.code ?? "").trim().toUpperCase();
          if (!code) return;
          promos[code] = {
            type: m.type === "fixed" ? "fixed" : "pct",
            value: Number(m.value) || 0,
            label: String(m.label ?? code),
          };
        });

        const contact = {
          phone: settings.phone || CONTACT.phone,
          phoneHref: `+${(settings.phone || CONTACT.phone).replace(/\D/g, "")}`,
          email: settings.email || CONTACT.email,
          location: settings.location || CONTACT.location,
        };

        const home: HomeContent = {
          headline: settings.home?.headline?.trim() ? settings.home.headline.trim() : null,
          sub: settings.home?.sub?.trim() || DEFAULT_HOME.sub,
          marquee: settings.home?.marquee?.trim()
            ? settings.home.marquee.split("\n").map((x) => x.trim()).filter(Boolean)
            : DEFAULT_HOME.marquee,
          sections: { ...DEFAULT_HOME.sections, ...(settings.home?.sections ?? {}) },
        };

        setState({
          services,
          testimonials,
          faqs,
          projects,
          promos,
          contact,
          socials: settings.socials?.length ? settings.socials : SOCIAL_LINKS,
          home,
        });
      } catch {
        /* defaults remain */
      }
    };
    load();
    // live refresh: admin mutations dispatch this — no reload needed
    const onChange = () => load();
    window.addEventListener("sk-content-changed", onChange);
    return () => { alive = false; window.removeEventListener("sk-content-changed", onChange); };
  }, []);

  return <ContentCtx.Provider value={state}>{children}</ContentCtx.Provider>;
}

export const useContent = () => useContext(ContentCtx);
export const useServiceBySlug = (slug: string | undefined) => {
  const { services } = useContent();
  return slug ? services.find((s) => s.slug === slug) : undefined;
};
