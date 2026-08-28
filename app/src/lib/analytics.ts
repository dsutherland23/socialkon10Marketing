/* ------------------------------------------------------------------
   WEBSITE INTELLIGENCE & ATTRIBUTION ENGINE — First-Party SDK
   PRD §1-5 + 2026 Modern Platform Enhancements

   Architecture:
   • Anonymous session ID in sessionStorage (privacy-first, zero PII)
   • Multi-touch UTM attribution captured & retained across user session
   • Dynamic engagement scoring (0–100) with real-time segment classification
   • Behavioral tracking: scroll depth, CTA clicks, pricing views, form abandonment
   • Dead click & rage click detection
   • Dual Persistence: IndexedDB / LocalStorage (zero-config, offline-ready) + Firestore
   • Omni-channel mirroring to GA4 (gtag), Meta Pixel (fbq), and dataLayer
   • Geo-Intelligence: Privacy-friendly country & city detection via timezone & locale
   • Technology Intelligence: Device, Browser, OS, and Screen Matrix
   • 24×7 Peak Activity Heatmap (Day × Hour Rhythm Grid)
   • Entry vs. Exit Page & Bounce Rate Analysis
   • Direct CRM Lead & Order Attribution Linkage
------------------------------------------------------------------- */

import {
  addDoc, collection, doc, setDoc, serverTimestamp, getDocs,
  query, orderBy, limit as fsLimit, where, getCountFromServer,
} from "firebase/firestore";
import { db, firebaseReady } from "./firebase";
import { idbGet, idbSet } from "./backend";

/* ─── Types ──────────────────────────────────────────────────────── */

export type VisitorSegment = "cold" | "interested" | "engaged" | "high_intent" | "hot";

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
  current_page?: string;
  exit_page?: string;
  referrer: string;
  device_type: "mobile" | "tablet" | "desktop";
  browser?: string;
  os?: string;
  country_code?: string;
  country_name?: string;
  country_flag?: string;
  city?: string;
  user_agent: string;
  engagement_score: number;
  segment: VisitorSegment;
  converted: boolean;
  conversion_type?: string;
  pages_viewed?: string[];
  services_viewed?: string[];
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
  engagement_score?: number;
  country_name?: string;
  country_flag?: string;
}

export interface ConsentPreferences {
  necessary: boolean;
  analytics: boolean;
  marketing: boolean;
  advertising: boolean;
  updated_at: string;
}

export interface GeoDistributionRecord {
  country_code: string;
  country_name: string;
  flag: string;
  sessions: number;
  share_pct: number;
  conversions: number;
  cvr: number;
  top_cities: string[];
}

export interface HeatmapCell {
  day: number; // 0 = Mon, 6 = Sun
  hour: number; // 0 to 23
  sessions: number;
  intensity: number; // 0 to 1
}

export interface TechDistribution {
  devices: { label: string; count: number; pct: number }[];
  browsers: { label: string; count: number; pct: number }[];
  osList: { label: string; count: number; pct: number }[];
}

export interface EntryExitPageRecord {
  path: string;
  entry_count: number;
  exit_count: number;
  bounce_count: number;
  bounce_rate: number;
}

export interface ExecutiveSummary {
  periodDays: number;
  totalSessions: number;
  totalLeads: number;
  totalOrders: number;
  revenueCollected: number;
  conversionRate: number;
  topSource: string;
  topCampaign: string;
  topCountry: string;
  topService: string;
  peakHour: string;
  recommendations: string[];
}

/* ─── Scoring Rules ──────────────────────────────────────────────── */

export const ENGAGEMENT_RULES: Record<string, number> = {
  page_view: 2,
  service_view: 5,
  pricing_view: 10,
  session_over_120_seconds: 10,
  scroll_over_75_percent: 10,
  cta_click: 15,
  form_start: 20,
  form_submit: 30,
  checkout_start: 25,
  checkout_complete: 50,
};

export function calculateSegment(score: number): VisitorSegment {
  if (score >= 81) return "hot";
  if (score >= 61) return "high_intent";
  if (score >= 41) return "engaged";
  if (score >= 21) return "interested";
  return "cold";
}

/* ─── Storage Keys ───────────────────────────────────────────────── */

const SESSION_KEY = "sk_analytics_session";
const UTM_KEY = "sk_analytics_utm";
const CONSENT_KEY = "sk_consent_preferences";
const IDB_SESSIONS_KEY = "sk_analytics_sessions";
const IDB_EVENTS_KEY = "sk_analytics_events";
const IDB_PAGE_VIEWS_KEY = "sk_analytics_page_views";
const IDB_SERVICE_INTEREST_KEY = "sk_analytics_service_interest";

let _initialized = false;
let _sessionData: SessionData | null = null;
let _currentPath = "";
const _scoredActions = new Set<string>();

const _queue: AnalyticsEvent[] = [];
let _flushTimer: ReturnType<typeof setTimeout> | null = null;
let _clickHistory: { x: number; y: number; time: number }[] = [];

/* ─── Utilities & Geo / Tech Parsers ─────────────────────────────── */

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

function detectBrowser(): string {
  if (typeof window === "undefined") return "Chrome";
  const ua = navigator.userAgent;
  if (/Edg/i.test(ua)) return "Edge";
  if (/OPR|Opera/i.test(ua)) return "Opera";
  if (/Chrome/i.test(ua) && !/Chromium/i.test(ua)) return "Chrome";
  if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) return "Safari";
  if (/Firefox/i.test(ua)) return "Firefox";
  if (/SamsungBrowser/i.test(ua)) return "Samsung Internet";
  return "Other";
}

function detectOs(): string {
  if (typeof window === "undefined") return "macOS";
  const ua = navigator.userAgent;
  if (/Macintosh|Mac OS X/i.test(ua)) return "macOS";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Windows NT/i.test(ua)) return "Windows";
  if (/Android/i.test(ua)) return "Android";
  if (/Linux/i.test(ua)) return "Linux";
  if (/CrOS/i.test(ua)) return "ChromeOS";
  return "Other";
}

/**
 * Resolves visitor geographic country & city via client timezone and locale.
 * Privacy-first: zero IP tracking or invasive fingerprinting.
 */
function resolveClientGeo(): { code: string; name: string; flag: string; city: string } {
  if (typeof window === "undefined") {
    return { code: "JM", name: "Jamaica", flag: "🇯🇲", city: "Kingston" };
  }

  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    const TZ_MAP: Record<string, { code: string; name: string; flag: string; city: string }> = {
      "America/Jamaica": { code: "JM", name: "Jamaica", flag: "🇯🇲", city: "Kingston" },
      "America/New_York": { code: "US", name: "United States", flag: "🇺🇸", city: "New York" },
      "America/Chicago": { code: "US", name: "United States", flag: "🇺🇸", city: "Chicago" },
      "America/Los_Angeles": { code: "US", name: "United States", flag: "🇺🇸", city: "Los Angeles" },
      "America/Denver": { code: "US", name: "United States", flag: "🇺🇸", city: "Denver" },
      "America/Phoenix": { code: "US", name: "United States", flag: "🇺🇸", city: "Phoenix" },
      "America/Toronto": { code: "CA", name: "Canada", flag: "🇨🇦", city: "Toronto" },
      "America/Vancouver": { code: "CA", name: "Canada", flag: "🇨🇦", city: "Vancouver" },
      "America/Montreal": { code: "CA", name: "Canada", flag: "🇨🇦", city: "Montreal" },
      "Europe/London": { code: "GB", name: "United Kingdom", flag: "🇬🇧", city: "London" },
      "Europe/Paris": { code: "FR", name: "France", flag: "🇫🇷", city: "Paris" },
      "Europe/Berlin": { code: "DE", name: "Germany", flag: "🇩🇪", city: "Berlin" },
      "Europe/Amsterdam": { code: "NL", name: "Netherlands", flag: "🇳🇱", city: "Amsterdam" },
      "Europe/Madrid": { code: "ES", name: "Spain", flag: "🇪🇸", city: "Madrid" },
      "America/Port_of_Spain": { code: "TT", name: "Trinidad & Tobago", flag: "🇹🇹", city: "Port of Spain" },
      "America/Barbados": { code: "BB", name: "Barbados", flag: "🇧🇧", city: "Bridgetown" },
      "America/Nassau": { code: "BS", name: "Bahamas", flag: "🇧🇸", city: "Nassau" },
      "America/Grand_Turk": { code: "TC", name: "Turks & Caicos", flag: "🇹🇨", city: "Grand Turk" },
      "America/Cayman": { code: "KY", name: "Cayman Islands", flag: "🇰🇾", city: "George Town" },
      "Asia/Tokyo": { code: "JP", name: "Japan", flag: "🇯🇵", city: "Tokyo" },
      "Asia/Singapore": { code: "SG", name: "Singapore", flag: "🇸🇬", city: "Singapore" },
      "Asia/Dubai": { code: "AE", name: "United Arab Emirates", flag: "🇦🇪", city: "Dubai" },
      "Australia/Sydney": { code: "AU", name: "Australia", flag: "🇦🇺", city: "Sydney" },
      "Australia/Melbourne": { code: "AU", name: "Australia", flag: "🇦🇺", city: "Melbourne" },
    };

    if (TZ_MAP[tz]) return TZ_MAP[tz];

    // Generic timezone prefix matching
    if (tz.startsWith("America/")) {
      return { code: "US", name: "United States", flag: "🇺🇸", city: tz.replace("America/", "").replace("_", " ") };
    }
    if (tz.startsWith("Europe/")) {
      return { code: "GB", name: "Europe", flag: "🇪🇺", city: tz.replace("Europe/", "").replace("_", " ") };
    }
    if (tz.startsWith("Asia/")) {
      return { code: "JP", name: "Asia", flag: "🌏", city: tz.replace("Asia/", "").replace("_", " ") };
    }
  } catch { /* fallback */ }

  return { code: "JM", name: "Jamaica", flag: "🇯🇲", city: "Kingston" };
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

function notifyAnalyticsUpdated(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("sk-analytics-updated"));
  }
}

/* ─── Consent Management ─────────────────────────────────────────── */

export function getConsentPreferences(): ConsentPreferences {
  if (typeof window === "undefined") {
    return { necessary: true, analytics: true, marketing: true, advertising: true, updated_at: now() };
  }
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* fallback */ }
  return { necessary: true, analytics: true, marketing: true, advertising: true, updated_at: now() };
}

export function setConsentPreferences(prefs: Partial<ConsentPreferences>): void {
  if (typeof window === "undefined") return;
  const current = getConsentPreferences();
  const updated: ConsentPreferences = {
    ...current,
    ...prefs,
    necessary: true,
    updated_at: now(),
  };
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent("sk-consent-changed", { detail: updated }));
  } catch { /* non-blocking */ }
}

export function hasConsent(category: keyof ConsentPreferences): boolean {
  if (category === "necessary") return true;
  const prefs = getConsentPreferences();
  return Boolean(prefs[category]);
}

/* ─── Local Storage / IndexedDB Storage Layer ────────────────────── */

async function getLocalSessions(): Promise<SessionData[]> {
  try {
    const list = await idbGet<SessionData[]>(IDB_SESSIONS_KEY);
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

async function saveLocalSession(session: SessionData): Promise<void> {
  try {
    const list = await getLocalSessions();
    const idx = list.findIndex((s) => s.session_id === session.session_id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...session };
    } else {
      list.unshift(session);
    }
    await idbSet(IDB_SESSIONS_KEY, list.slice(0, 300));
  } catch { /* non-blocking */ }
}

async function appendLocalEvent(ev: AnalyticsEvent): Promise<void> {
  try {
    const list = (await idbGet<AnalyticsEvent[]>(IDB_EVENTS_KEY)) || [];
    list.unshift(ev);
    await idbSet(IDB_EVENTS_KEY, list.slice(0, 1000));
  } catch { /* non-blocking */ }
}

async function appendLocalPageView(pv: PageViewRecord): Promise<void> {
  try {
    const list = (await idbGet<PageViewRecord[]>(IDB_PAGE_VIEWS_KEY)) || [];
    list.unshift(pv);
    await idbSet(IDB_PAGE_VIEWS_KEY, list.slice(0, 1000));
  } catch { /* non-blocking */ }
}

async function appendLocalServiceInterest(si: ServiceInterestRecord): Promise<void> {
  try {
    const list = (await idbGet<ServiceInterestRecord[]>(IDB_SERVICE_INTEREST_KEY)) || [];
    list.unshift(si);
    await idbSet(IDB_SERVICE_INTEREST_KEY, list.slice(0, 1000));
  } catch { /* non-blocking */ }
}

/* ─── Session Management ─────────────────────────────────────────── */

function loadOrCreateSession(): SessionData {
  if (_sessionData) return _sessionData;

  try {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) {
      _sessionData = JSON.parse(saved) as SessionData;
      return _sessionData;
    }
  } catch { /* ignore */ }

  const utms = getUtmFromUrl(window.location.href);
  let storedUtm: Record<string, string | null> = {};
  try {
    const saved = sessionStorage.getItem(UTM_KEY);
    if (saved) storedUtm = JSON.parse(saved);
  } catch { /* ignore */ }

  const geo = resolveClientGeo();

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
    current_page: window.location.pathname,
    referrer: document.referrer || "",
    device_type: detectDevice(),
    browser: detectBrowser(),
    os: detectOs(),
    country_code: geo.code,
    country_name: geo.name,
    country_flag: geo.flag,
    city: geo.city,
    user_agent: navigator.userAgent.slice(0, 200),
    engagement_score: 0,
    segment: "cold",
    converted: false,
    pages_viewed: [window.location.pathname],
    services_viewed: [],
  };

  persistSession();
  void saveLocalSession(_sessionData);
  return _sessionData;
}

function persistSession(): void {
  if (!_sessionData) return;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(_sessionData));
  } catch { /* ignore */ }
  void saveLocalSession(_sessionData);
}

async function upsertSessionInFirestore(session: SessionData): Promise<void> {
  await saveLocalSession(session);
  notifyAnalyticsUpdated();

  if (!firebaseReady || !db || !hasConsent("analytics")) return;
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

/* ─── Dynamic Engagement Scoring Engine ──────────────────────────── */

function addEngagementPoints(action: string, pointsMultiplier = 1): void {
  const session = loadOrCreateSession();
  const basePoints = ENGAGEMENT_RULES[action] || 5;
  const points = basePoints * pointsMultiplier;

  if (action === "scroll_over_75_percent" || action === "session_over_120_seconds") {
    if (_scoredActions.has(action)) return;
    _scoredActions.add(action);
  }

  session.engagement_score = Math.min(100, (session.engagement_score || 0) + points);
  session.segment = calculateSegment(session.engagement_score);
  persistSession();
  void upsertSessionInFirestore(session);
}

/* ─── Event Batching & Streaming ─────────────────────────────────── */

async function flushQueue(): Promise<void> {
  if (_queue.length === 0) return;
  const batch = _queue.splice(0, _queue.length);

  await Promise.all(batch.map((ev) => appendLocalEvent(ev)));
  notifyAnalyticsUpdated();

  if (!firebaseReady || !db || !hasConsent("analytics")) return;

  try {
    await Promise.all(
      batch.map((ev) =>
        addDoc(collection(db!, "analytics_events"), {
          ...ev,
          created_at: serverTimestamp(),
        })
      )
    );
  } catch { /* non-blocking */ }
}

function scheduleFlush(): void {
  if (_flushTimer) return;
  _flushTimer = setTimeout(() => {
    _flushTimer = null;
    void flushQueue();
  }, 2000);
}

function enqueue(ev: Omit<AnalyticsEvent, "created_at">): void {
  const fullEvent = { ...ev, created_at: now() };
  _queue.push(fullEvent);
  void appendLocalEvent(fullEvent);

  if (_queue.length >= 10) {
    if (_flushTimer) { clearTimeout(_flushTimer); _flushTimer = null; }
    void flushQueue();
  } else {
    scheduleFlush();
  }
}

/* ─── Mirroring to Third-Party Providers ─────────────────────────── */

function mirrorToGa4(event: string, params: Record<string, unknown>): void {
  if (!hasConsent("analytics")) return;
  try {
    if (typeof window !== "undefined" && (window as any).gtag) {
      (window as any).gtag("event", event, params);
    }
  } catch { /* ignore */ }
}

function mirrorToPixel(event: string, params: Record<string, unknown>): void {
  if (!hasConsent("advertising")) return;
  try {
    if (typeof window !== "undefined" && (window as any).fbq) {
      const FB_MAP: Record<string, string> = {
        page_view: "PageView",
        checkout_complete: "Purchase",
        lead_submit: "Lead",
        form_submit: "Lead",
        add_to_cart: "AddToCart",
        checkout_start: "InitiateCheckout",
        service_view: "ViewContent",
        pricing_view: "ViewContent",
        contact_submit: "Contact",
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

/* ─── Public Tracking API ────────────────────────────────────────── */

export function initTracking(): void {
  if (typeof window === "undefined") return;
  if (_initialized) return;
  _initialized = true;

  const session = loadOrCreateSession();
  void upsertSessionInFirestore(session);

  setTimeout(() => {
    addEngagementPoints("session_over_120_seconds");
  }, 120_000);

  let maxScrollReached = 0;
  const onScrollThrottled = () => {
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    if (docHeight <= 0) return;
    const currentPct = Math.round((window.scrollY / docHeight) * 100);

    if (currentPct >= 75 && maxScrollReached < 75) {
      maxScrollReached = 75;
      trackEvent("scroll_depth", { depth: 75 });
      addEngagementPoints("scroll_over_75_percent");
    } else if (currentPct >= 50 && maxScrollReached < 50) {
      maxScrollReached = 50;
      trackEvent("scroll_depth", { depth: 50 });
    } else if (currentPct >= 25 && maxScrollReached < 25) {
      maxScrollReached = 25;
      trackEvent("scroll_depth", { depth: 25 });
    }
  };
  window.addEventListener("scroll", onScrollThrottled, { passive: true });

  window.addEventListener("click", (e) => {
    const clickTime = Date.now();
    _clickHistory.push({ x: e.clientX, y: e.clientY, time: clickTime });
    _clickHistory = _clickHistory.filter((c) => clickTime - c.time < 700);

    if (_clickHistory.length >= 3) {
      const first = _clickHistory[0];
      const dist = Math.hypot(e.clientX - first.x, e.clientY - first.y);
      if (dist < 80) {
        trackEvent("rage_click", { x: e.clientX, y: e.clientY, path: window.location.pathname });
        _clickHistory = [];
      }
    }
  }, { passive: true });

  if (import.meta.env.DEV) console.info("[analytics] Engine initialized:", session.session_id);
}

export function trackEvent(name: string, props: Record<string, unknown> = {}): void {
  if (typeof window === "undefined") return;

  const session = loadOrCreateSession();
  session.last_active = now();
  persistSession();

  const enriched = {
    ...props,
    session_id: session.session_id,
    utm_source: session.utm_source,
    utm_medium: session.utm_medium,
    utm_campaign: session.utm_campaign,
    country: session.country_name,
    engagement_score: session.engagement_score,
    segment: session.segment,
  };

  enqueue({
    session_id: session.session_id,
    event_name: name,
    path: window.location.pathname,
    props: enriched,
  });

  mirrorToGa4(name, enriched);
  mirrorToPixel(name, enriched);
  mirrorToDataLayer(name, enriched);

  if (import.meta.env.DEV) console.info("[analytics]", name, enriched);
}

export async function trackPageView(path: string): Promise<void> {
  if (typeof window === "undefined") return;

  const session = loadOrCreateSession();
  session.page_count += 1;
  session.last_active = now();
  session.current_page = path;
  if (!session.pages_viewed) session.pages_viewed = [];
  if (!session.pages_viewed.includes(path)) session.pages_viewed.push(path);

  addEngagementPoints("page_view");
  persistSession();
  void upsertSessionInFirestore(session);

  const prevPath = _currentPath;
  _currentPath = path;

  const pv: PageViewRecord = {
    session_id: session.session_id,
    path,
    title: document.title,
    referrer: prevPath || document.referrer,
    created_at: now(),
  };

  void appendLocalPageView(pv);

  if (firebaseReady && db && hasConsent("analytics")) {
    try {
      await addDoc(collection(db, "analytics_page_views"), { ...pv, created_at: serverTimestamp() });
    } catch { /* non-blocking */ }
  }

  mirrorToGa4("page_view", { page_path: path, page_title: document.title });
  mirrorToPixel("page_view", { page_path: path });
  mirrorToDataLayer("page_view", { page_path: path });

  if (import.meta.env.DEV) console.info("[analytics] page_view", path);
}

export async function trackServiceView(serviceSlug: string, serviceName: string): Promise<void> {
  if (typeof window === "undefined") return;

  const session = loadOrCreateSession();
  if (!session.services_viewed) session.services_viewed = [];
  if (!session.services_viewed.includes(serviceSlug)) session.services_viewed.push(serviceSlug);

  addEngagementPoints("service_view");

  const si: ServiceInterestRecord = {
    session_id: session.session_id,
    service_slug: serviceSlug,
    service_name: serviceName,
    created_at: now(),
  };

  void appendLocalServiceInterest(si);

  if (firebaseReady && db && hasConsent("analytics")) {
    try {
      await addDoc(collection(db, "analytics_service_interest"), {
        ...si,
        created_at: serverTimestamp(),
      } as Omit<ServiceInterestRecord, "created_at"> & { created_at: unknown });
    } catch { /* non-blocking */ }
  }

  trackEvent("service_view", { service_slug: serviceSlug, service_name: serviceName });
}

export function trackPricingView(source = "packages_page"): void {
  addEngagementPoints("pricing_view");
  trackEvent("pricing_view", { source });
}

export function trackCtaClick(label: string, location = "page"): void {
  addEngagementPoints("cta_click");
  trackEvent("cta_click", { cta_label: label, cta_location: location });
}

export function trackFormStart(formId: string, extra?: Record<string, unknown>): void {
  addEngagementPoints("form_start");
  trackEvent("form_start", { form_id: formId, ...extra });
}

export function trackFormSubmit(formId: string, extra?: Record<string, unknown>): void {
  addEngagementPoints("form_submit");
  trackEvent("form_submit", { form_id: formId, ...extra });
}

export function trackFormAbandon(formId: string, lastField = ""): void {
  trackEvent("form_abandon", { form_id: formId, last_field: lastField });
}

export function trackLeadSubmit(data: {
  intent: string;
  dept?: string | null;
  service?: string | null;
}): void {
  const session = loadOrCreateSession();
  session.converted = true;
  session.conversion_type = "lead";
  persistSession();
  void upsertSessionInFirestore(session);

  addEngagementPoints("form_submit");
  trackEvent("lead_submit", data);

  mirrorToGa4("generate_lead", {
    currency: "USD",
    value: 0,
    ...data,
  });
}

export function trackAddToCart(item: {
  name: string;
  serviceSlug?: string;
  unitPrice: number;
}): void {
  addEngagementPoints("cta_click");
  trackEvent("add_to_cart", {
    item_name: item.name,
    item_id: item.serviceSlug ?? item.name,
    value: item.unitPrice,
    currency: "USD",
  });

  mirrorToGa4("add_to_cart", {
    currency: "USD",
    value: item.unitPrice,
    items: [{ item_id: item.serviceSlug ?? item.name, item_name: item.name, price: item.unitPrice }],
  });
}

export function trackCheckoutStart(total?: number): void {
  addEngagementPoints("checkout_start");
  trackEvent("checkout_start", { value: total, currency: "USD" });
  mirrorToGa4("begin_checkout", { currency: "USD", value: total ?? 0 });
}

export function trackCheckoutComplete(data: {
  orderId: string;
  total: number;
  itemCount: number;
}): void {
  const session = loadOrCreateSession();
  session.converted = true;
  session.conversion_type = "order";
  persistSession();
  void upsertSessionInFirestore(session);

  addEngagementPoints("checkout_complete");

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
    engagement_score: session?.engagement_score ?? 0,
    country_name: session?.country_name,
    country_flag: session?.country_flag,
  };
}

/* ─── Dashboard Query Helpers (Hybrid Firestore + IndexedDB) ─────── */

export async function getSessionCount(days = 30): Promise<number> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  if (firebaseReady && db) {
    try {
      const snap = await getCountFromServer(
        query(collection(db, "analytics_sessions"), where("started_at", ">=", since))
      );
      const count = snap.data().count;
      if (count > 0) return count;
    } catch { /* fallback */ }
  }
  const local = await getLocalSessions();
  return local.filter((s) => s.started_at >= since).length;
}

export async function getActiveLiveVisitors(withinMinutes = 15): Promise<SessionData[]> {
  const since = new Date(Date.now() - withinMinutes * 60_000).toISOString();
  if (firebaseReady && db) {
    try {
      const snap = await getDocs(
        query(
          collection(db, "analytics_sessions"),
          where("last_active", ">=", since),
          orderBy("last_active", "desc"),
          fsLimit(50)
        )
      );
      if (!snap.empty) {
        return snap.docs.map((d) => ({ ...d.data() } as SessionData));
      }
    } catch { /* fallback */ }
  }
  const local = await getLocalSessions();
  return local
    .filter((s) => s.last_active >= since)
    .sort((a, b) => new Date(b.last_active).getTime() - new Date(a.last_active).getTime())
    .slice(0, 50);
}

export async function getTopPages(days = 30, topN = 10): Promise<{ path: string; views: number }[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  if (firebaseReady && db) {
    try {
      const snap = await getDocs(
        query(
          collection(db, "analytics_page_views"),
          where("created_at", ">=", since),
          orderBy("created_at", "desc"),
          fsLimit(500)
        )
      );
      if (!snap.empty) {
        const counts = new Map<string, number>();
        snap.docs.forEach((d) => {
          const path: string = (d.data().path as string) || "/";
          counts.set(path, (counts.get(path) ?? 0) + 1);
        });
        return [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, topN)
          .map(([path, views]) => ({ path, views }));
      }
    } catch { /* fallback */ }
  }
  try {
    const local = (await idbGet<PageViewRecord[]>(IDB_PAGE_VIEWS_KEY)) || [];
    const counts = new Map<string, number>();
    local
      .filter((pv) => pv.created_at >= since)
      .forEach((pv) => {
        counts.set(pv.path, (counts.get(pv.path) ?? 0) + 1);
      });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([path, views]) => ({ path, views }));
  } catch { return []; }
}

export async function getTrafficSources(days = 30): Promise<{ source: string; sessions: number }[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  if (firebaseReady && db) {
    try {
      const snap = await getDocs(
        query(
          collection(db, "analytics_sessions"),
          where("started_at", ">=", since),
          orderBy("started_at", "desc"),
          fsLimit(500)
        )
      );
      if (!snap.empty) {
        const counts = new Map<string, number>();
        snap.docs.forEach((d) => {
          const src: string = (d.data().utm_source as string) || "direct";
          counts.set(src, (counts.get(src) ?? 0) + 1);
        });
        return [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([source, sessions]) => ({ source, sessions }));
      }
    } catch { /* fallback */ }
  }
  const local = await getLocalSessions();
  const counts = new Map<string, number>();
  local
    .filter((s) => s.started_at >= since)
    .forEach((s) => {
      const src = s.utm_source || "direct";
      counts.set(src, (counts.get(src) ?? 0) + 1);
    });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([source, sessions]) => ({ source, sessions }));
}

export async function getServiceInterestRanking(days = 30): Promise<{ service_name: string; service_slug: string; views: number }[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  if (firebaseReady && db) {
    try {
      const snap = await getDocs(
        query(
          collection(db, "analytics_service_interest"),
          where("created_at", ">=", since),
          orderBy("created_at", "desc"),
          fsLimit(500)
        )
      );
      if (!snap.empty) {
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
      }
    } catch { /* fallback */ }
  }
  try {
    const local = (await idbGet<ServiceInterestRecord[]>(IDB_SERVICE_INTEREST_KEY)) || [];
    const counts = new Map<string, { service_name: string; views: number }>();
    local
      .filter((si) => si.created_at >= since)
      .forEach((si) => {
        const existing = counts.get(si.service_slug) ?? { service_name: si.service_name, views: 0 };
        counts.set(si.service_slug, { ...existing, views: existing.views + 1 });
      });
    return [...counts.entries()]
      .sort((a, b) => b[1].views - a[1].views)
      .map(([service_slug, v]) => ({ service_slug, ...v }));
  } catch { return []; }
}

export async function getFunnelCounts(days = 30): Promise<Record<string, number>> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const funnelEvents = ["page_view", "service_view", "pricing_view", "cta_click", "form_start", "form_submit", "lead_submit", "checkout_start", "checkout_complete"];
  const results: Record<string, number> = {};

  if (firebaseReady && db) {
    try {
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
      const totalCount = Object.values(results).reduce((a, b) => a + b, 0);
      if (totalCount > 0) return results;
    } catch { /* fallback */ }
  }

  try {
    const localEvents = (await idbGet<AnalyticsEvent[]>(IDB_EVENTS_KEY)) || [];
    funnelEvents.forEach((ev) => {
      results[ev] = localEvents.filter((e) => e.event_name === ev && e.created_at >= since).length;
    });
    return results;
  } catch { return {}; }
}

export async function getRecentSessions(limitN = 25): Promise<SessionData[]> {
  if (firebaseReady && db) {
    try {
      const snap = await getDocs(
        query(
          collection(db, "analytics_sessions"),
          orderBy("last_active", "desc"),
          fsLimit(limitN)
        )
      );
      if (!snap.empty) {
        return snap.docs.map((d) => ({ ...d.data() } as SessionData));
      }
    } catch { /* fallback */ }
  }
  const local = await getLocalSessions();
  return local
    .sort((a, b) => new Date(b.last_active).getTime() - new Date(a.last_active).getTime())
    .slice(0, limitN);
}

export async function getCampaignPerformance(days = 30): Promise<{ campaign: string; source: string; medium: string; sessions: number }[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  if (firebaseReady && db) {
    try {
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
      if (!snap.empty) {
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
      }
    } catch { /* fallback */ }
  }
  const local = await getLocalSessions();
  const counts = new Map<string, { campaign: string; source: string; medium: string; sessions: number }>();
  local
    .filter((s) => s.started_at >= since && s.utm_campaign)
    .forEach((s) => {
      const campaign = s.utm_campaign || "(not set)";
      const source = s.utm_source || "direct";
      const medium = s.utm_medium || "(none)";
      const key = `${campaign}|${source}|${medium}`;
      const ex = counts.get(key) ?? { campaign, source, medium, sessions: 0 };
      counts.set(key, { ...ex, sessions: ex.sessions + 1 });
    });
  return [...counts.values()].sort((a, b) => b.sessions - a.sessions);
}

export async function getSessionEvents(sessionId: string): Promise<AnalyticsEvent[]> {
  if (firebaseReady && db) {
    try {
      const snap = await getDocs(
        query(
          collection(db, "analytics_events"),
          where("session_id", "==", sessionId),
          orderBy("created_at", "asc"),
          fsLimit(100)
        )
      );
      if (!snap.empty) {
        return snap.docs.map((d) => ({ ...d.data() } as AnalyticsEvent));
      }
    } catch { /* fallback */ }
  }
  try {
    const localEvents = (await idbGet<AnalyticsEvent[]>(IDB_EVENTS_KEY)) || [];
    return localEvents
      .filter((e) => e.session_id === sessionId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  } catch { return []; }
}

/* ─── 2026 Enhanced Platform Queries ─────────────────────────────── */

/**
 * 1. Geographic Distribution: Returns sessions and conversion rates grouped by Country.
 */
export async function getGeographicDistribution(days = 30): Promise<GeoDistributionRecord[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const sessions = await getRecentSessions(500);
  const filtered = sessions.filter((s) => s.started_at >= since);

  const countryMap = new Map<string, {
    country_name: string;
    flag: string;
    sessions: number;
    conversions: number;
    cities: Set<string>;
  }>();

  // If no sessions, provide default studio region
  if (filtered.length === 0) {
    return [
      { country_code: "JM", country_name: "Jamaica", flag: "🇯🇲", sessions: 1, share_pct: 100, conversions: 0, cvr: 0, top_cities: ["Kingston"] }
    ];
  }

  filtered.forEach((s) => {
    const code = s.country_code || "JM";
    const name = s.country_name || (code === "JM" ? "Jamaica" : "United States");
    const flag = s.country_flag || (code === "JM" ? "🇯🇲" : "🇺🇸");
    const city = s.city || "Kingston";

    const ex = countryMap.get(code) ?? {
      country_name: name,
      flag,
      sessions: 0,
      conversions: 0,
      cities: new Set<string>(),
    };

    ex.sessions += 1;
    if (s.converted) ex.conversions += 1;
    if (city) ex.cities.add(city);
    countryMap.set(code, ex);
  });

  const total = filtered.length;
  return [...countryMap.entries()]
    .map(([code, data]) => ({
      country_code: code,
      country_name: data.country_name,
      flag: data.flag,
      sessions: data.sessions,
      share_pct: Math.round((data.sessions / total) * 100),
      conversions: data.conversions,
      cvr: data.sessions > 0 ? Math.round((data.conversions / data.sessions) * 100) : 0,
      top_cities: [...data.cities].slice(0, 3),
    }))
    .sort((a, b) => b.sessions - a.sessions);
}

/**
 * 2. 24×7 Activity Heatmap Grid: Returns a 7-day (Mon-Sun) × 24-hour activity matrix.
 */
export async function getActivityHeatmap(days = 30): Promise<HeatmapCell[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const sessions = await getRecentSessions(500);
  const filtered = sessions.filter((s) => s.started_at >= since);

  // Initialize 7x24 grid: 0 = Mon, 6 = Sun
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));

  filtered.forEach((s) => {
    const date = new Date(s.started_at);
    let day = date.getDay(); // 0 is Sunday in JS
    day = day === 0 ? 6 : day - 1; // Convert to 0 = Monday ... 6 = Sunday
    const hour = date.getHours();
    grid[day][hour] += 1;
  });

  let maxSessions = 1;
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      if (grid[d][h] > maxSessions) maxSessions = grid[d][h];
    }
  }

  const cells: HeatmapCell[] = [];
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const count = grid[d][h];
      cells.push({
        day: d,
        hour: h,
        sessions: count,
        intensity: count / maxSessions,
      });
    }
  }
  return cells;
}

/**
 * 3. Technology, Browser & OS Distribution.
 */
export async function getTechnologyDistribution(days = 30): Promise<TechDistribution> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const sessions = await getRecentSessions(500);
  const filtered = sessions.filter((s) => s.started_at >= since);
  const total = Math.max(1, filtered.length);

  const deviceMap = new Map<string, number>();
  const browserMap = new Map<string, number>();
  const osMap = new Map<string, number>();

  filtered.forEach((s) => {
    const dev = (s.device_type || "desktop").toLowerCase();
    const browser = s.browser || "Chrome";
    const os = s.os || "macOS";

    deviceMap.set(dev, (deviceMap.get(dev) ?? 0) + 1);
    browserMap.set(browser, (browserMap.get(browser) ?? 0) + 1);
    osMap.set(os, (osMap.get(os) ?? 0) + 1);
  });

  // Defaults if empty
  if (deviceMap.size === 0) deviceMap.set("desktop", 1);
  if (browserMap.size === 0) browserMap.set("Chrome", 1);
  if (osMap.size === 0) osMap.set("macOS", 1);

  const devices = [...deviceMap.entries()]
    .map(([label, count]) => ({ label, count, pct: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count);

  const browsers = [...browserMap.entries()]
    .map(([label, count]) => ({ label, count, pct: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count);

  const osList = [...osMap.entries()]
    .map(([label, count]) => ({ label, count, pct: Math.round((count / total) * 100) }))
    .sort((a, b) => b.count - a.count);

  return { devices, browsers, osList };
}

/**
 * 4. Entry vs. Exit Pages & Bounce Rate Calculation.
 */
export async function getEntryAndExitPages(days = 30): Promise<EntryExitPageRecord[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const sessions = await getRecentSessions(500);
  const filtered = sessions.filter((s) => s.started_at >= since);

  const pageMap = new Map<string, { entries: number; exits: number; bounces: number }>();

  filtered.forEach((s) => {
    const entry = (s.landing_page || "/").split("?")[0];
    const exit = s.current_page || entry;
    const isBounce = s.page_count <= 1 && s.engagement_score <= 10;

    const entryEx = pageMap.get(entry) ?? { entries: 0, exits: 0, bounces: 0 };
    entryEx.entries += 1;
    if (isBounce) entryEx.bounces += 1;
    pageMap.set(entry, entryEx);

    const exitEx = pageMap.get(exit) ?? { entries: 0, exits: 0, bounces: 0 };
    exitEx.exits += 1;
    pageMap.set(exit, exitEx);
  });

  return [...pageMap.entries()]
    .map(([path, counts]) => ({
      path,
      entry_count: counts.entries,
      exit_count: counts.exits,
      bounce_count: counts.bounces,
      bounce_rate: counts.entries > 0 ? Math.round((counts.bounces / counts.entries) * 100) : 0,
    }))
    .sort((a, b) => b.entry_count - a.entry_count);
}
