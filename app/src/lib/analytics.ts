/* ------------------------------------------------------------------
   WEBSITE INTELLIGENCE & ATTRIBUTION ENGINE — First-Party SDK
   PRD §1-5 — Tracking Foundation

   Architecture:
   • Anonymous session ID in sessionStorage (never PII)
   • UTM params captured from first URL in session
   • Event queue batched to Firestore analytics_* collections
   • Mirrors every event to GA4 (gtag), Meta Pixel (fbq), dataLayer
   • All writes async + fault-tolerant (try/catch on every Firestore call)
   • Consent-aware: tracking only fires after initTracking() is called
   • Server secrets (CAPI, GA4 MP) are NOT included here — admin notes
     will document the Cloud Function upgrade path for those.
------------------------------------------------------------------- */

import {
  addDoc, collection, doc, setDoc, serverTimestamp, getDocs,
  query, orderBy, limit as fsLimit, where, getCountFromServer,
} from "firebase/firestore";
import { db, firebaseReady } from "./firebase";

/* ─── Types ──────────────────────────────────────────────────────── */

export interface SessionData {
  session_id: string;
  started_at: string;
  last_active: string;
  page_count: number;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  landing_page: string;
  referrer: string;
  device_type: "mobile" | "tablet" | "desktop";
  user_agent: string;
}

export interface AnalyticsEvent {
  session_id: string;
  event_name: string;
  path: string;
  props: Record<string, unknown>;
  created_at: string;
}

export interface PageViewRecord {
  session_id: string;
  path: string;
  title: string;
  referrer: string;
  time_on_page_ms?: number;
  created_at: string;
}

export interface ServiceInterestRecord {
  session_id: string;
  service_slug: string;
  service_name: string;
  created_at: string;
}

export interface AttributionData {
  session_id: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  landing_page: string;
  referrer: string;
}

/* ─── Internal state ─────────────────────────────────────────────── */

const SESSION_KEY = "sk_analytics_session";
const UTM_KEY = "sk_analytics_utm";
let _initialized = false;
let _sessionData: SessionData | null = null;
let _currentPath = "";

// Event batch queue — flush every 3 seconds or when queue reaches 10
const _queue: AnalyticsEvent[] = [];
let _flushTimer: ReturnType<typeof setTimeout> | null = null;

/* ─── Utilities ──────────────────────────────────────────────────── */

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function detectDevice(): "mobile" | "tablet" | "desktop" {
  if (typeof window === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/Mobi|Android|iPhone/i.test(ua)) return "mobile";
  if (/iPad|Tablet/i.test(ua)) return "tablet";
  return "desktop";
}

function getUtmFromUrl(url: string): Record<string, string | null> {
  try {
    const p = new URL(url).searchParams;
    return {
      utm_source: p.get("utm_source"),
      utm_medium: p.get("utm_medium"),
      utm_campaign: p.get("utm_campaign"),
      utm_content: p.get("utm_content"),
      utm_term: p.get("utm_term"),
    };
  } catch {
    return { utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null, utm_term: null };
  }
}

function now(): string {
  return new Date().toISOString();
}

/* ─── Session management ─────────────────────────────────────────── */

function loadOrCreateSession(): SessionData {
  if (_sessionData) return _sessionData;

  try {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) {
      _sessionData = JSON.parse(saved) as SessionData;
      return _sessionData;
    }
  } catch { /* ignore */ }

  // Capture UTM from current URL (first touch in this session)
  const utms = getUtmFromUrl(window.location.href);

  // Also check for stored UTM from URL that might have been set before the
  // analytics SDK loaded (e.g., from a redirect)
  let storedUtm: Record<string, string | null> = {};
  try {
    const saved = sessionStorage.getItem(UTM_KEY);
    if (saved) storedUtm = JSON.parse(saved);
  } catch { /* ignore */ }

  const merged = {
    utm_source: utms.utm_source ?? storedUtm.utm_source ?? null,
    utm_medium: utms.utm_medium ?? storedUtm.utm_medium ?? null,
    utm_campaign: utms.utm_campaign ?? storedUtm.utm_campaign ?? null,
    utm_content: utms.utm_content ?? storedUtm.utm_content ?? null,
    utm_term: utms.utm_term ?? storedUtm.utm_term ?? null,
  };

  _sessionData = {
    session_id: generateId(),
    started_at: now(),
    last_active: now(),
    page_count: 0,
    ...merged,
    landing_page: window.location.pathname + window.location.search,
    referrer: document.referrer || "",
    device_type: detectDevice(),
    user_agent: navigator.userAgent.slice(0, 200),
  };

  persistSession();
  return _sessionData;
}

function persistSession(): void {
  if (!_sessionData) return;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(_sessionData));
  } catch { /* ignore */ }
}

async function upsertSessionInFirestore(session: SessionData): Promise<void> {
  if (!firebaseReady || !db) return;
  try {
    await setDoc(
      doc(db, "analytics_sessions", session.session_id),
      {
        ...session,
        last_active: serverTimestamp(),
      },
      { merge: true }
    );
  } catch { /* non-blocking */ }
}

/* ─── Event batching ─────────────────────────────────────────────── */

async function flushQueue(): Promise<void> {
  if (_queue.length === 0) return;
  const batch = _queue.splice(0, _queue.length);

  if (!firebaseReady || !db) return;

  try {
    // Write each event as an individual doc (subcollection style)
    await Promise.all(
      batch.map((ev) =>
        addDoc(collection(db!, "analytics_events"), {
          ...ev,
          created_at: serverTimestamp(),
        })
      )
    );
  } catch { /* non-blocking — events are best-effort */ }
}

function scheduleFlush(): void {
  if (_flushTimer) return;
  _flushTimer = setTimeout(() => {
    _flushTimer = null;
    void flushQueue();
  }, 3000);
}

function enqueue(ev: Omit<AnalyticsEvent, "created_at">): void {
  _queue.push({ ...ev, created_at: now() });
  if (_queue.length >= 10) {
    if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; }
    void flushQueue();
  } else {
    scheduleFlush();
  }
}

/* ─── GA4 / Meta Pixel / dataLayer mirrors ───────────────────────── */

function mirrorToGa4(event: string, params: Record<string, unknown>): void {
  try {
    if (typeof window !== "undefined" && (window as any).gtag) {
      (window as any).gtag("event", event, params);
    }
  } catch { /* ignore */ }
}

function mirrorToPixel(event: string, params: Record<string, unknown>): void {
  try {
    if (typeof window !== "undefined" && (window as any).fbq) {
      // Map to standard FB events where possible
      const FB_MAP: Record<string, string> = {
        page_view: "PageView",
        checkout_complete: "Purchase",
        lead_submit: "Lead",
        form_submit: "Lead",
        add_to_cart: "AddToCart",
        checkout_start: "InitiateCheckout",
        service_view: "ViewContent",
      };
      const fbEvent = FB_MAP[event];
      if (fbEvent) {
        (window as any).fbq("track", fbEvent, params);
      } else {
        (window as any).fbq("trackCustom", event, params);
      }
    }
  } catch { /* ignore */ }
}

function mirrorToDataLayer(event: string, params: Record<string, unknown>): void {
  try {
    if (typeof window !== "undefined" && (window as any).dataLayer) {
      (window as any).dataLayer.push({ event, ...params });
    }
  } catch { /* ignore */ }
}

/* ─── Public API ─────────────────────────────────────────────────── */

/**
 * Initialize the tracking engine. Call once on app boot.
 * Safe to call multiple times — idempotent.
 */
export function initTracking(): void {
  if (typeof window === "undefined") return;
  if (_initialized) return;
  _initialized = true;

  const session = loadOrCreateSession();

  // Persist session to Firestore in the background
  void upsertSessionInFirestore(session);

  if (import.meta.env.DEV) console.info("[analytics] Session initialized:", session.session_id);
}

/**
 * Track a generic event. Fires to Firestore + GA4 + Meta Pixel + dataLayer.
 */
export function trackEvent(name: string, props: Record<string, unknown> = {}): void {
  if (typeof window === "undefined") return;

  const session = loadOrCreateSession();

  // Update last_active
  if (_sessionData) {
    _sessionData.last_active = now();
    persistSession();
  }

  const enriched = {
    ...props,
    session_id: session.session_id,
    utm_source: session.utm_source,
    utm_medium: session.utm_medium,
    utm_campaign: session.utm_campaign,
  };

  // Enqueue for Firestore
  enqueue({
    session_id: session.session_id,
    event_name: name,
    path: window.location.pathname,
    props: enriched,
  });

  // Mirror to third-party
  mirrorToGa4(name, enriched);
  mirrorToPixel(name, enriched);
  mirrorToDataLayer(name, enriched);

  if (import.meta.env.DEV) console.info("[analytics]", name, enriched);
}

/**
 * Track a page view. Call on every route change.
 */
export async function trackPageView(path: string): Promise<void> {
  if (typeof window === "undefined") return;

  const session = loadOrCreateSession();

  // Increment page count
  if (_sessionData) {
    _sessionData.page_count += 1;
    _sessionData.last_active = now();
    persistSession();
    // Update Firestore session (non-blocking)
    void upsertSessionInFirestore(_sessionData);
  }

  const prevPath = _currentPath;
  _currentPath = path;

  // Write page view to Firestore
  if (firebaseReady && db) {
    const pv: Omit<PageViewRecord, "time_on_page_ms"> = {
      session_id: session.session_id,
      path,
      title: document.title,
      referrer: prevPath || document.referrer,
      created_at: now(),
    };
    try {
      await addDoc(collection(db, "analytics_page_views"), { ...pv, created_at: serverTimestamp() });
    } catch { /* non-blocking */ }
  }

  // Fire GA4 page_view
  mirrorToGa4("page_view", { page_path: path, page_title: document.title });
  mirrorToPixel("page_view", { page_path: path });
  mirrorToDataLayer("page_view", { page_path: path });

  if (import.meta.env.DEV) console.info("[analytics] page_view", path);
}

/**
 * Track a service/department page view.
 */
export async function trackServiceView(serviceSlug: string, serviceName: string): Promise<void> {
  if (typeof window === "undefined") return;

  const session = loadOrCreateSession();

  if (firebaseReady && db) {
    try {
      await addDoc(collection(db, "analytics_service_interest"), {
        session_id: session.session_id,
        service_slug: serviceSlug,
        service_name: serviceName,
        created_at: serverTimestamp(),
      } as Omit<ServiceInterestRecord, "created_at"> & { created_at: unknown });
    } catch { /* non-blocking */ }
  }

  trackEvent("service_view", { service_slug: serviceSlug, service_name: serviceName });
}

/**
 * Track when a user starts interacting with a form (first field focus or intent selection).
 */
export function trackFormStart(formId: string, extra?: Record<string, unknown>): void {
  trackEvent("form_start", { form_id: formId, ...extra });
}

/**
 * Track a successful form submission.
 */
export function trackFormSubmit(formId: string, extra?: Record<string, unknown>): void {
  trackEvent("form_submit", { form_id: formId, ...extra });
}

/**
 * Track a lead form submission — also fires GA4 generate_lead and Meta Lead.
 */
export function trackLeadSubmit(data: {
  intent: string;
  dept?: string | null;
  service?: string | null;
}): void {
  trackEvent("lead_submit", data);

  // GA4 standard event
  mirrorToGa4("generate_lead", {
    currency: "USD",
    value: 0, // unknown at this stage
    ...data,
  });
}

/**
 * Track add-to-cart action.
 */
export function trackAddToCart(item: {
  name: string;
  serviceSlug?: string;
  unitPrice: number;
}): void {
  trackEvent("add_to_cart", {
    item_name: item.name,
    item_id: item.serviceSlug ?? item.name,
    value: item.unitPrice,
    currency: "USD",
  });

  // GA4 standard add_to_cart
  mirrorToGa4("add_to_cart", {
    currency: "USD",
    value: item.unitPrice,
    items: [{ item_id: item.serviceSlug ?? item.name, item_name: item.name, price: item.unitPrice }],
  });
}

/**
 * Track checkout initiation.
 */
export function trackCheckoutStart(total?: number): void {
  trackEvent("checkout_start", { value: total, currency: "USD" });

  mirrorToGa4("begin_checkout", { currency: "USD", value: total ?? 0 });
}

/**
 * Track a completed order/checkout.
 */
export function trackCheckoutComplete(data: {
  orderId: string;
  total: number;
  itemCount: number;
}): void {
  trackEvent("checkout_complete", {
    transaction_id: data.orderId,
    value: data.total,
    currency: "USD",
    items: data.itemCount,
  });

  mirrorToGa4("purchase", {
    transaction_id: data.orderId,
    currency: "USD",
    value: data.total,
  });

  mirrorToPixel("checkout_complete", {
    value: data.total,
    currency: "USD",
    order_id: data.orderId,
  });
}

/**
 * Returns the current session attribution data (for enriching LeadRecord).
 */
export function getSessionAttribution(): AttributionData {
  const session = typeof window !== "undefined" ? loadOrCreateSession() : null;
  return {
    session_id: session?.session_id ?? null,
    utm_source: session?.utm_source ?? null,
    utm_medium: session?.utm_medium ?? null,
    utm_campaign: session?.utm_campaign ?? null,
    utm_content: session?.utm_content ?? null,
    utm_term: session?.utm_term ?? null,
    landing_page: session?.landing_page ?? "",
    referrer: session?.referrer ?? "",
  };
}

/* ─── Dashboard query helpers ────────────────────────────────────── */

/** Get total session count for the last N days. */
export async function getSessionCount(days = 30): Promise<number> {
  if (!firebaseReady || !db) return 0;
  try {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const snap = await getCountFromServer(
      query(collection(db, "analytics_sessions"), where("started_at", ">=", since))
    );
    return snap.data().count;
  } catch { return 0; }
}

/** Get top pages by view count for the last N days. */
export async function getTopPages(days = 30, topN = 10): Promise<{ path: string; views: number }[]> {
  if (!firebaseReady || !db) return [];
  try {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const snap = await getDocs(
      query(
        collection(db, "analytics_page_views"),
        where("created_at", ">=", since),
        orderBy("created_at", "desc"),
        fsLimit(500)
      )
    );
    const counts = new Map<string, number>();
    snap.docs.forEach((d) => {
      const path: string = (d.data().path as string) || "/";
      counts.set(path, (counts.get(path) ?? 0) + 1);
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([path, views]) => ({ path, views }));
  } catch { return []; }
}

/** Get traffic source breakdown for the last N days. */
export async function getTrafficSources(days = 30): Promise<{ source: string; sessions: number }[]> {
  if (!firebaseReady || !db) return [];
  try {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const snap = await getDocs(
      query(
        collection(db, "analytics_sessions"),
        where("started_at", ">=", since),
        orderBy("started_at", "desc"),
        fsLimit(500)
      )
    );
    const counts = new Map<string, number>();
    snap.docs.forEach((d) => {
      const src: string = (d.data().utm_source as string) || "direct";
      counts.set(src, (counts.get(src) ?? 0) + 1);
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([source, sessions]) => ({ source, sessions }));
  } catch { return []; }
}

/** Get service interest ranking for the last N days. */
export async function getServiceInterestRanking(days = 30): Promise<{ service_name: string; service_slug: string; views: number }[]> {
  if (!firebaseReady || !db) return [];
  try {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const snap = await getDocs(
      query(
        collection(db, "analytics_service_interest"),
        where("created_at", ">=", since),
        orderBy("created_at", "desc"),
        fsLimit(500)
      )
    );
    const counts = new Map<string, { service_name: string; views: number }>();
    snap.docs.forEach((d) => {
      const slug: string = d.data().service_slug as string;
      const name: string = d.data().service_name as string;
      const existing = counts.get(slug) ?? { service_name: name, views: 0 };
      counts.set(slug, { ...existing, views: existing.views + 1 });
    });
    return [...counts.entries()]
      .sort((a, b) => b[1].views - a[1].views)
      .map(([service_slug, v]) => ({ service_slug, ...v }));
  } catch { return []; }
}

/** Get event funnel counts for the last N days. */
export async function getFunnelCounts(days = 30): Promise<Record<string, number>> {
  if (!firebaseReady || !db) return {};
  try {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const funnelEvents = ["service_view", "form_start", "form_submit", "lead_submit", "checkout_start", "checkout_complete"];
    const results: Record<string, number> = {};
    await Promise.all(
      funnelEvents.map(async (ev) => {
        try {
          const snap = await getCountFromServer(
            query(
              collection(db!, "analytics_events"),
              where("event_name", "==", ev),
              where("created_at", ">=", since)
            )
          );
          results[ev] = snap.data().count;
        } catch {
          results[ev] = 0;
        }
      })
    );
    return results;
  } catch { return {}; }
}

/** Get recent sessions (for live visitor view). */
export async function getRecentSessions(limitN = 20): Promise<SessionData[]> {
  if (!firebaseReady || !db) return [];
  try {
    const snap = await getDocs(
      query(
        collection(db, "analytics_sessions"),
        orderBy("last_active", "desc"),
        fsLimit(limitN)
      )
    );
    return snap.docs.map((d) => ({ ...d.data() } as SessionData));
  } catch { return []; }
}

/** Get UTM campaign performance for the last N days. */
export async function getCampaignPerformance(days = 30): Promise<{ campaign: string; source: string; medium: string; sessions: number }[]> {
  if (!firebaseReady || !db) return [];
  try {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const snap = await getDocs(
      query(
        collection(db, "analytics_sessions"),
        where("started_at", ">=", since),
        where("utm_campaign", "!=", null),
        orderBy("utm_campaign"),
        orderBy("started_at", "desc"),
        fsLimit(500)
      )
    );
    const counts = new Map<string, { campaign: string; source: string; medium: string; sessions: number }>();
    snap.docs.forEach((d) => {
      const campaign: string = (d.data().utm_campaign as string) || "(not set)";
      const source: string = (d.data().utm_source as string) || "direct";
      const medium: string = (d.data().utm_medium as string) || "(none)";
      const key = `${campaign}|${source}|${medium}`;
      const ex = counts.get(key) ?? { campaign, source, medium, sessions: 0 };
      counts.set(key, { ...ex, sessions: ex.sessions + 1 });
    });
    return [...counts.values()].sort((a, b) => b.sessions - a.sessions);
  } catch { return []; }
}

/** Check whether the analytics_sessions collection exists and has any data. */
export async function analyticsHasData(): Promise<boolean> {
  if (!firebaseReady || !db) return false;
  try {
    const snap = await getDocs(query(collection(db, "analytics_sessions"), fsLimit(1)));
    return !snap.empty;
  } catch { return false; }
}
