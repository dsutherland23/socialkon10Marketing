import { useEffect } from "react";
import { initTracking, trackEvent } from "./analytics";

const SITE = "https://socialkon10.com";

/** Lightweight per-page SEO: title, meta description, canonical, OG/Twitter, JSON-LD. */
export function useSEO(opts: { title: string; description: string; path?: string; jsonLd?: object }) {
  useEffect(() => {
    document.title = opts.title;

    const setMeta = (name: string, content: string, prop = false) => {
      const sel = prop ? `meta[property="${name}"]` : `meta[name="${name}"]`;
      let el = document.head.querySelector(sel) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        if (prop) el.setAttribute("property", name);
        else el.setAttribute("name", name);
        document.head.appendChild(el);
      }
      el.content = content;
    };

    setMeta("description", opts.description);
    setMeta("og:title", opts.title, true);
    setMeta("og:description", opts.description, true);
    setMeta("twitter:title", opts.title);
    setMeta("twitter:description", opts.description);

    if (opts.path) {
      let link = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement("link");
        link.rel = "canonical";
        document.head.appendChild(link);
      }
      link.href = `${SITE}${opts.path}`;
      setMeta("og:url", `${SITE}${opts.path}`, true);
    }

    let ld: HTMLScriptElement | null = null;
    if (opts.jsonLd) {
      ld = document.createElement("script");
      ld.type = "application/ld+json";
      ld.id = "page-jsonld";
      ld.textContent = JSON.stringify(opts.jsonLd);
      document.head.querySelector("#page-jsonld")?.remove();
      document.head.appendChild(ld);
    }
    return () => { ld?.remove(); };
  }, [opts.title, opts.description, opts.path]);
}

/** Shared schema fragments (PRD §55). */
export const ORGANIZATION_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Social Kon10 Marketing",
  url: SITE,
  email: "socialkon10@gmail.com",
  telephone: "+1-876-255-4848",
  address: { "@type": "PostalAddress", addressLocality: "Kingston", addressCountry: "JM" },
};

export const LOCAL_BUSINESS_LD = {
  "@context": "https://schema.org",
  "@type": "ProfessionalService",
  name: "Social Kon10 Marketing",
  url: SITE,
  email: "socialkon10@gmail.com",
  telephone: "+1-876-255-4848",
  address: { "@type": "PostalAddress", addressLocality: "Kingston", addressRegion: "Kingston", addressCountry: "JM" },
  priceRange: "$$",
};

export const breadcrumbLd = (items: { name: string; path: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map((it, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: it.name,
    item: `${SITE}${it.path}`,
  })),
});

export const faqLd = (faqs: { q: string; a: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
});

/**
 * Analytics bootstrap (PRD §60) — loads GA4 and/or Meta Pixel only when
 * IDs are configured via env. No IDs, no third-party scripts.
 * Also initializes the first-party tracking SDK.
 */
export function initAnalytics() {
  const gaId = import.meta.env.VITE_GA_ID as string | undefined;
  const pixelId = import.meta.env.VITE_META_PIXEL_ID as string | undefined;

  if (gaId) {
    const s = document.createElement("script");
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
    document.head.appendChild(s);
    const w = window as any;
    w.dataLayer = w.dataLayer || [];
    w.gtag = function gtag() { w.dataLayer.push(arguments); };
    w.gtag("js", new Date());
    w.gtag("config", gaId);
  }

  if (pixelId) {
    const w = window as any;
    if (!w.fbq) {
      const n: any = (w.fbq = function fbq() { n.queue ? n.queue.push(arguments) : n.callMethod?.apply(n, arguments); });
      n.queue = []; n.loaded = true; n.version = "2.0";
      const t = document.createElement("script");
      t.async = true;
      t.src = "https://connect.facebook.net/en_US/fbevents.js";
      document.head.appendChild(t);
      w.fbq("init", pixelId);
      w.fbq("track", "PageView");
    }
  }

  // Initialize first-party tracking SDK (non-blocking)
  initTracking();
}

/** Analytics event helper — delegates to the unified analytics SDK.
 *  Fires to GA4, Meta Pixel, dataLayer, and Firestore when configured.
 *  Retained for backward-compatibility with all existing track() call sites. */
export function track(event: string, params?: Record<string, unknown>) {
  trackEvent(event, params ?? {});
}
