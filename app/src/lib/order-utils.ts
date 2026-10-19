/* ------------------------------------------------------------------
   ORDER DOMAIN — pure, framework-free logic (Dual-Mode Checkout)
   No Firebase / React imports so every function here is unit-testable
   in isolation. Firebase-bound orchestration lives in checkout.ts.
------------------------------------------------------------------- */

import type { CartItem } from "./shop";
import type { ServiceProduct } from "./data";

/* ---------------- checkout modes ---------------- */

export const CHECKOUT_MODES = ["ORDER_REQUEST", "ONLINE_PAYMENT", "HYBRID"] as const;
export type CheckoutMode = (typeof CHECKOUT_MODES)[number];

export const CHECKOUT_METHODS = ["order_request", "online_payment"] as const;
export type CheckoutMethod = (typeof CHECKOUT_METHODS)[number];

export const DEFAULT_CHECKOUT_MODE: CheckoutMode = "ORDER_REQUEST";

export interface GatewayReadiness {
  providerId: string | null;
  environment: "live" | "sandbox";
  /** set only after every readiness check passes (Phase 9) */
  verified: boolean;
  verifiedAt?: string;
  verifiedBy?: string;
  /** human-readable checklist results from the last verification run */
  checks?: { id: string; label: string; ok: boolean; detail?: string }[];
}

export interface CheckoutSettings {
  mode: CheckoutMode;
  gateway: GatewayReadiness;
}

export const DEFAULT_CHECKOUT_SETTINGS: CheckoutSettings = {
  mode: DEFAULT_CHECKOUT_MODE,
  gateway: { providerId: null, environment: "sandbox", verified: false },
};

/** Normalize whatever is stored (partial / legacy) into a complete settings object. */
export function normalizeCheckoutSettings(raw: unknown): CheckoutSettings {
  const r = (raw ?? {}) as Partial<CheckoutSettings>;
  const g = (r.gateway ?? {}) as Partial<GatewayReadiness>;
  return {
    mode: CHECKOUT_MODES.includes(r.mode as CheckoutMode) ? (r.mode as CheckoutMode) : DEFAULT_CHECKOUT_MODE,
    gateway: {
      providerId: typeof g.providerId === "string" && g.providerId ? g.providerId : null,
      environment: g.environment === "live" ? "live" : "sandbox",
      verified: g.verified === true,
      ...(typeof g.verifiedAt === "string" ? { verifiedAt: g.verifiedAt } : {}),
      ...(typeof g.verifiedBy === "string" ? { verifiedBy: g.verifiedBy } : {}),
      ...(Array.isArray(g.checks) ? { checks: g.checks as GatewayReadiness["checks"] } : {}),
    },
  };
}

/**
 * The mode customers actually experience.
 * Safe-switching rule: any mode that needs online payment silently degrades
 * to ORDER_REQUEST while the gateway is unverified — the site can never
 * present a card checkout that cannot work.
 */
export function effectiveCheckoutMode(settings: CheckoutSettings): CheckoutMode {
  if (settings.mode === "ORDER_REQUEST") return "ORDER_REQUEST";
  return settings.gateway.verified && settings.gateway.providerId ? settings.mode : "ORDER_REQUEST";
}

export function onlinePaymentEnabled(settings: CheckoutSettings): boolean {
  const m = effectiveCheckoutMode(settings);
  return m === "ONLINE_PAYMENT" || m === "HYBRID";
}

export function orderRequestEnabled(settings: CheckoutSettings): boolean {
  const m = effectiveCheckoutMode(settings);
  return m === "ORDER_REQUEST" || m === "HYBRID";
}

/* ---------------- mode-aware customer-facing copy ---------------- */

/**
 * Copy that must never promise online payment while the studio runs in
 * ORDER_REQUEST mode. Every string here is the DEFAULT (payment-capable)
 * wording unless the effective mode is ORDER_REQUEST — admins switching
 * modes never need to edit page copy by hand.
 */
export function orderCtaCopy(settings: CheckoutSettings): {
  /** Service page primary CTA, e.g. "Order now — pay online" */
  orderNow: string;
  /** Reassurance line under the CTA (empty when paying online) */
  orderNowNote: string;
  /** Template store instant-checkout CTA */
  buyNow: string;
  /** Template store standard CTA prefix ("Buy" vs "Order") */
  buyVerb: string;
  /** Tail for quote-proposal microcopy ("…you can accept and pay online.") */
  proposalTail: string;
} {
  if (effectiveCheckoutMode(settings) === "ORDER_REQUEST") {
    return {
      orderNow: "Order now — no payment today",
      orderNowNote:
        "Nothing is charged online. The studio reviews your order, confirms scope & pricing, and emails payment instructions.",
      buyNow: "⚡ Order Now — Skip to Review",
      buyVerb: "Order",
      proposalTail: "you can accept online — payment is arranged directly with the studio after approval.",
    };
  }
  return {
    orderNow: "Order now — pay online",
    orderNowNote: "",
    buyNow: "⚡ Buy Now — Skip to Payment",
    buyVerb: "Buy",
    proposalTail: "you can accept and pay online.",
  };
}

/* ---------------- payment status ---------------- */

export const PAYMENT_STATUSES = ["UNPAID", "PENDING", "PARTIALLY_PAID", "PAID", "REFUNDED", "FAILED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export interface PaymentLike {
  total: number;
  amountPaid: number;
  paymentStatus?: PaymentStatus;
}

/**
 * Derives the effective payment status for any order, including legacy
 * records written before the paymentStatus field existed.
 */
export function derivePaymentStatus(o: PaymentLike): PaymentStatus {
  if (o.paymentStatus && PAYMENT_STATUSES.includes(o.paymentStatus)) {
    // Legacy rows may carry a stale stored status — never let a stored
    // PAID survive contradicting money fields.
    if (o.paymentStatus === "PAID" && !(o.amountPaid >= o.total && o.total > 0)) return deriveFromAmounts(o);
    return o.paymentStatus;
  }
  return deriveFromAmounts(o);
}

function deriveFromAmounts(o: PaymentLike): PaymentStatus {
  if (o.amountPaid > 0 && o.total > 0 && o.amountPaid >= o.total) return "PAID";
  if (o.amountPaid > 0) return "PARTIALLY_PAID";
  return "UNPAID";
}

/** Status after recording a new (verified) payment of `amount` against an order. */
export function paymentStatusAfterPayment(o: PaymentLike, amount: number): PaymentStatus {
  const paid = Math.max(0, o.amountPaid) + Math.max(0, amount);
  if (o.total > 0 && paid >= o.total) return "PAID";
  if (paid > 0) return "PARTIALLY_PAID";
  return "UNPAID";
}

/* ---------------- pricing status (fixed vs quote-required) ---------------- */

export type PricingStatus = "CONFIRMED" | "QUOTE_REQUIRED";

type QuoteLine = {
  serviceSlug?: string;
  addons?: { id?: string; name: string; price: number }[];
  templateSlug?: string;
  /** design-package lines are always fixed-price (computed by the builder) */
  tierLabel?: string;
};

function serviceQuoteRequired(svc: ServiceProduct | undefined): boolean {
  if (!svc) return false;
  return svc.priceType === "quote" || svc.priceType === "consultation";
}

/**
 * A cart line is quote-required when the underlying service (or a selected
 * add-on) is priced by quotation rather than a fixed catalog rate.
 */
export function lineIsQuoteRequired(line: QuoteLine, catalog: ServiceProduct[]): boolean {
  if (line.templateSlug) return false; // template marketplace = fixed license prices
  const svc = line.serviceSlug ? catalog.find((s) => s.slug === line.serviceSlug) : undefined;
  if (serviceQuoteRequired(svc)) return true;
  if (svc && line.addons) {
    for (const a of line.addons) {
      const cat = svc.addons.find((x) => x.id === a.id || x.name === a.name);
      if (cat && (cat.priceType === "quote" || cat.priceType === "consultation")) return true;
    }
  }
  return false;
}

/** Order-level pricing: a single quote-required line makes the whole total an estimate. */
export function cartPricingStatus(lines: QuoteLine[], catalog: ServiceProduct[]): PricingStatus {
  return lines.some((l) => lineIsQuoteRequired(l, catalog)) ? "QUOTE_REQUIRED" : "CONFIRMED";
}

/* ---------------- integer-cent money math ---------------- */

export const toCents = (usd: number): number => Math.round(usd * 100);
export const fromCents = (cents: number): number => cents / 100;

export function cartLineCents(i: Pick<CartItem, "unitPrice" | "addons" | "rush">): number {
  const base = toCents(i.unitPrice) + i.addons.reduce((s, a) => s + toCents(a.price), 0);
  // Rush = +25% — computed on integer cents, rounded half-up
  return i.rush ? Math.round(base * 1.25) : base;
}

/* ---------------- catalog re-pricing (server-authoritative equivalent) ---------------- */

export interface RepricedLine {
  key: string;
  name: string;
  unitPrice: number;
  addons: { id: string; name: string; price: number }[];
  rush: boolean;
  changed: boolean;
}

/**
 * Recomputes cart line prices from the trusted catalog (service overrides
 * included) instead of trusting values stored in browser storage.
 * Returns the corrected lines; `changed` flags any line whose price moved
 * since it was added to the cart (e.g. an admin rate-sheet update).
 *
 * Lines with negotiated tiers/variants or template licenses keep their
 * stored price (the catalog cannot recompute them) and are never
 * silently altered.
 */
export function repriceCartLines(items: CartItem[], catalog: ServiceProduct[]): { lines: RepricedLine[]; changedCount: number } {
  let changedCount = 0;
  const lines = items.map((i) => {
    const svc = catalog.find((s) => s.slug === i.serviceSlug);
    if (!svc || i.templateSlug || i.tierLabel || i.variantLabel) {
      return { key: i.key, name: i.name, unitPrice: i.unitPrice, addons: i.addons, rush: i.rush, changed: false };
    }
    const unitPrice = svc.price;
    const addons = i.addons.map((a) => {
      const cat = svc.addons.find((x) => x.id === a.id);
      return cat ? { id: a.id, name: a.name, price: cat.price } : a;
    });
    const changed =
      toCents(unitPrice) !== toCents(i.unitPrice) ||
      addons.some((a, idx) => toCents(a.price) !== toCents(i.addons[idx]?.price ?? a.price));
    if (changed) changedCount++;
    return { key: i.key, name: i.name, unitPrice, addons, rush: i.rush, changed };
  });
  return { lines, changedCount };
}

/* ---------------- public order reference ---------------- */

const REF_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no I/L/O/0/1 — unambiguous when read aloud
const REF_PATTERN = /^SK10-\d{6}-[A-Z0-9]{5}$/;

/** e.g. SK10-260218-7K3PQ — date-stamped, random suffix, collision-checked at reservation. */
export function generateOrderReference(now: Date = new Date(), rand?: () => number): string {
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  let suffix = "";
  if (rand) {
    for (let k = 0; k < 5; k++) suffix += REF_ALPHABET[Math.floor(rand() * REF_ALPHABET.length) % REF_ALPHABET.length];
  } else {
    const buf = new Uint8Array(5);
    crypto.getRandomValues(buf);
    for (let k = 0; k < 5; k++) suffix += REF_ALPHABET[buf[k] % REF_ALPHABET.length];
  }
  return `SK10-${yy}${mm}${dd}-${suffix}`;
}

export const isValidOrderReference = (ref: string): boolean => REF_PATTERN.test(ref);

/* ---------------- extended order lifecycle statuses ---------------- */

/**
 * Business-facing order statuses beyond the 8-stage production pipeline
 * (ORDER_STATUSES in backend.ts stays untouched so existing orders and the
 * progress UI keep working). These cover the pre-production lifecycle the
 * dual-mode checkout introduces.
 */
export const PRE_PRODUCTION_STATUSES = [
  "UNDER REVIEW",
  "AWAITING CUSTOMER",
  "QUOTE SENT",
  "AWAITING PAYMENT",
  "CANCELLED",
] as const;
export type PreProductionStatus = (typeof PRE_PRODUCTION_STATUSES)[number];

/** Statuses that close an order without completing production. */
export const TERMINAL_STATUSES: readonly string[] = ["COMPLETED", "CANCELLED"];

/* ---------------- validation ---------------- */

export interface OrderRequestInput {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  extra?: string;
  itemCount: number;
  agreeTerms: boolean;
}

/** Checkout field validation shared by both checkout modes. */
export function validateOrderRequest(input: OrderRequestInput): Record<string, string> {
  const e: Record<string, string> = {};
  if (!input.name.trim()) e.name = "Your name is required.";
  else if (input.name.trim().length > 120) e.name = "Name is too long.";
  if (!/.+@.+\..+/.test(input.email)) e.email = "A valid email is required.";
  else if (input.email.length > 200) e.email = "Email is too long.";
  if (input.phone && input.phone.replace(/[^\d+]/g, "").length > 20) e.phone = "That phone number looks too long.";
  if (input.itemCount <= 0) e.items = "Your cart is empty.";
  if (!input.agreeTerms) e.agreeTerms = "Please agree to the terms and privacy notice to submit.";
  return e;
}
