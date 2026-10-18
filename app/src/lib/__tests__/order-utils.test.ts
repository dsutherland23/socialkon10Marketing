import { describe, it, expect } from "vitest";
import {
  CHECKOUT_MODES,
  DEFAULT_CHECKOUT_SETTINGS,
  normalizeCheckoutSettings,
  effectiveCheckoutMode,
  onlinePaymentEnabled,
  orderRequestEnabled,
  derivePaymentStatus,
  paymentStatusAfterPayment,
  lineIsQuoteRequired,
  cartPricingStatus,
  toCents,
  fromCents,
  cartLineCents,
  repriceCartLines,
  generateOrderReference,
  isValidOrderReference,
  validateOrderRequest,
  TERMINAL_STATUSES,
  type CheckoutSettings,
} from "../order-utils";
import type { ServiceProduct } from "../data";
import type { CartItem } from "../shop";

/* ---------------- fixtures ---------------- */

const svc = (over: Partial<ServiceProduct>): ServiceProduct => ({
  id: "SK-T-01",
  dept: "brand",
  slug: "logo-design",
  name: "Logo Design",
  tagline: "",
  description: "",
  price: 450,
  priceType: "fixed",
  currency: "USD",
  billing: "one_time",
  depositPct: 50,
  timeline: "1 week",
  revisions: 2,
  deliverables: [],
  addons: [],
  seoTitle: "",
  seoDescription: "",
  ...over,
});

const cartItem = (over: Partial<CartItem>): CartItem => ({
  key: "k1",
  serviceSlug: "logo-design",
  name: "Logo Design",
  unitPrice: 450,
  addons: [],
  rush: false,
  billing: "one_time",
  depositPct: 50,
  ...over,
});

const settings = (over: Partial<CheckoutSettings> = {}): CheckoutSettings => ({
  mode: "ORDER_REQUEST",
  gateway: { providerId: null, environment: "sandbox", verified: false },
  ...over,
});

/* ---------------- checkout modes & safe switching ---------------- */

describe("checkout mode resolution", () => {
  it("defaults to ORDER_REQUEST", () => {
    expect(DEFAULT_CHECKOUT_SETTINGS.mode).toBe("ORDER_REQUEST");
    expect(effectiveCheckoutMode(settings())).toBe("ORDER_REQUEST");
  });

  it("never enables online payment while the gateway is unverified (safe degradation)", () => {
    const s = settings({ mode: "ONLINE_PAYMENT", gateway: { providerId: "paypal", environment: "live", verified: false } });
    expect(effectiveCheckoutMode(s)).toBe("ORDER_REQUEST");
    expect(onlinePaymentEnabled(s)).toBe(false);
    expect(orderRequestEnabled(s)).toBe(true);
  });

  it("degrades HYBRID to ORDER_REQUEST when unverified", () => {
    const s = settings({ mode: "HYBRID", gateway: { providerId: "paypal", environment: "live", verified: false } });
    expect(effectiveCheckoutMode(s)).toBe("ORDER_REQUEST");
  });

  it("enables HYBRID only when verified with a provider", () => {
    const s = settings({ mode: "HYBRID", gateway: { providerId: "paypal", environment: "live", verified: true } });
    expect(effectiveCheckoutMode(s)).toBe("HYBRID");
    expect(onlinePaymentEnabled(s)).toBe(true);
    expect(orderRequestEnabled(s)).toBe(true);
  });

  it("rejects unknown stored modes and normalizes partial settings", () => {
    const n = normalizeCheckoutSettings({ mode: "WILD_WEST", gateway: { verified: "yes" } });
    expect(n.mode).toBe("ORDER_REQUEST");
    expect(n.gateway.verified).toBe(false);
    expect(CHECKOUT_MODES).toContain(n.mode);
  });
});

/* ---------------- payment status ---------------- */

describe("payment status derivation", () => {
  it("legacy orders without the field derive from money fields", () => {
    expect(derivePaymentStatus({ total: 100, amountPaid: 0 })).toBe("UNPAID");
    expect(derivePaymentStatus({ total: 100, amountPaid: 40 })).toBe("PARTIALLY_PAID");
    expect(derivePaymentStatus({ total: 100, amountPaid: 100 })).toBe("PAID");
    expect(derivePaymentStatus({ total: 100, amountPaid: 150 })).toBe("PAID");
  });

  it("a stored PAID that contradicts the money fields is not trusted", () => {
    expect(derivePaymentStatus({ total: 100, amountPaid: 0, paymentStatus: "PAID" })).toBe("UNPAID");
    expect(derivePaymentStatus({ total: 100, amountPaid: 30, paymentStatus: "PAID" })).toBe("PARTIALLY_PAID");
  });

  it("keeps valid stored statuses", () => {
    expect(derivePaymentStatus({ total: 100, amountPaid: 100, paymentStatus: "REFUNDED" })).toBe("REFUNDED");
    expect(derivePaymentStatus({ total: 0, amountPaid: 0, paymentStatus: "PENDING" })).toBe("PENDING");
  });

  it("computes status after a recorded payment", () => {
    expect(paymentStatusAfterPayment({ total: 100, amountPaid: 0 }, 50)).toBe("PARTIALLY_PAID");
    expect(paymentStatusAfterPayment({ total: 100, amountPaid: 50 }, 50)).toBe("PAID");
    expect(paymentStatusAfterPayment({ total: 100, amountPaid: 100 }, 20)).toBe("PAID");
    expect(paymentStatusAfterPayment({ total: 100, amountPaid: 0 }, 0)).toBe("UNPAID");
  });
});

/* ---------------- quote-required detection ---------------- */

describe("pricing status", () => {
  const catalog = [
    svc({ slug: "logo-design", priceType: "fixed", price: 450 }),
    svc({ slug: "paid-social", priceType: "quote", price: 0 }),
    svc({
      slug: "brand-identity",
      priceType: "fixed",
      price: 1800,
      addons: [
        { id: "strategy", name: "Strategy workshop", price: 0, priceType: "quote" },
        { id: "kit", name: "Social kit", price: 400, priceType: "fixed" },
      ],
    }),
  ];

  it("fixed services are confirmed", () => {
    expect(lineIsQuoteRequired({ serviceSlug: "logo-design" }, catalog)).toBe(false);
  });

  it("quote-priced services are quote-required", () => {
    expect(lineIsQuoteRequired({ serviceSlug: "paid-social" }, catalog)).toBe(true);
  });

  it("a quote-priced add-on makes the line quote-required", () => {
    expect(lineIsQuoteRequired({ serviceSlug: "brand-identity", addons: [{ id: "strategy", name: "Strategy workshop", price: 0 }] }, catalog)).toBe(true);
    expect(lineIsQuoteRequired({ serviceSlug: "brand-identity", addons: [{ id: "kit", name: "Social kit", price: 400 }] }, catalog)).toBe(false);
  });

  it("template licenses are always fixed-price", () => {
    expect(lineIsQuoteRequired({ serviceSlug: "template:flyer", templateSlug: "flyer" }, catalog)).toBe(false);
  });

  it("one quote-required line makes the whole cart an estimate", () => {
    expect(cartPricingStatus([{ serviceSlug: "logo-design" }, { serviceSlug: "paid-social" }], catalog)).toBe("QUOTE_REQUIRED");
    expect(cartPricingStatus([{ serviceSlug: "logo-design" }], catalog)).toBe("CONFIRMED");
  });
});

/* ---------------- integer-cent money math ---------------- */

describe("money math", () => {
  it("converts to/from cents without float drift", () => {
    expect(toCents(19.99)).toBe(1999);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(fromCents(1999)).toBe(19.99);
  });

  it("computes rush (+25%) on integer cents", () => {
    expect(cartLineCents({ unitPrice: 450, addons: [], rush: false })).toBe(45000);
    expect(cartLineCents({ unitPrice: 450, addons: [], rush: true })).toBe(56250);
    expect(cartLineCents({ unitPrice: 33.33, addons: [{ id: "a", name: "A", price: 3.33 }], rush: true })).toBe(Math.round((3333 + 333) * 1.25));
  });
});

/* ---------------- catalog re-pricing ---------------- */

describe("catalog re-pricing (never trust stored browser prices)", () => {
  const catalog = [
    svc({ slug: "logo-design", price: 500, addons: [{ id: "extra-rev", name: "Extra revision", price: 75, priceType: "fixed" }] }),
  ];

  it("corrects a stale unit price to the current catalog rate", () => {
    const { lines, changedCount } = repriceCartLines([cartItem({ unitPrice: 450 })], catalog);
    expect(lines[0].unitPrice).toBe(500);
    expect(changedCount).toBe(1);
  });

  it("corrects add-on prices from the catalog", () => {
    const { lines, changedCount } = repriceCartLines(
      [cartItem({ unitPrice: 500, addons: [{ id: "extra-rev", name: "Extra revision", price: 50 }] })],
      catalog
    );
    expect(lines[0].addons[0].price).toBe(75);
    expect(changedCount).toBe(1);
  });

  it("flags tampered (lowered) prices as changed", () => {
    const { lines } = repriceCartLines([cartItem({ unitPrice: 1 })], catalog);
    expect(lines[0].unitPrice).toBe(500);
    expect(lines[0].changed).toBe(true);
  });

  it("never alters tier / variant / template lines", () => {
    const tiered = cartItem({ unitPrice: 999, tierLabel: "Event Pro" });
    const templ = cartItem({ serviceSlug: "template:flyer", templateSlug: "flyer", unitPrice: 29 });
    const { lines, changedCount } = repriceCartLines([tiered, templ], catalog);
    expect(lines[0].unitPrice).toBe(999);
    expect(lines[1].unitPrice).toBe(29);
    expect(changedCount).toBe(0);
  });

  it("leaves unknown services untouched", () => {
    const { lines, changedCount } = repriceCartLines([cartItem({ serviceSlug: "ghost-service" })], catalog);
    expect(lines[0].unitPrice).toBe(450);
    expect(changedCount).toBe(0);
  });
});

/* ---------------- order references ---------------- */

describe("order references", () => {
  it("matches SK10-YYMMDD-XXXXX", () => {
    const ref = generateOrderReference(new Date("2026-02-08T12:00:00"), () => 0.5);
    expect(isValidOrderReference(ref)).toBe(true);
    expect(ref.startsWith("SK10-260208-")).toBe(true);
  });

  it("uses an unambiguous alphabet (no I, L, O, 0, 1)", () => {
    let i = 0;
    const ref = generateOrderReference(new Date(), () => [0, 0.09, 0.35, 0.5, 0.99][i++ % 5]);
    const suffix = ref.split("-")[2];
    expect(suffix).toMatch(/^[A-HJ-KM-NP-Z2-9]{5}$/);
  });

  it("draws unique references across many generations", () => {
    const seen = new Set<string>();
    for (let k = 0; k < 500; k++) {
      let j = k;
      const ref = generateOrderReference(new Date(), () => ((j = (j * 9301 + 49297) % 233280) / 233280));
      seen.add(ref);
    }
    expect(seen.size).toBeGreaterThan(400);
  });

  it("rejects malformed references", () => {
    expect(isValidOrderReference("SK-123")).toBe(false);
    expect(isValidOrderReference("SK10-260208-ABC")).toBe(false);
    expect(isValidOrderReference("")).toBe(false);
    expect(isValidOrderReference("SK10-260208-ABCDE")).toBe(true);
  });
});

/* ---------------- validation ---------------- */

describe("order request validation", () => {
  const okInput = { name: "Ada", email: "ada@example.com", itemCount: 2, agreeTerms: true };

  it("accepts a complete request", () => {
    expect(validateOrderRequest(okInput)).toEqual({});
  });

  it("requires name, email, items and terms", () => {
    const e = validateOrderRequest({ name: "", email: "nope", itemCount: 0, agreeTerms: false });
    expect(e.name).toBeTruthy();
    expect(e.email).toBeTruthy();
    expect(e.items).toBeTruthy();
    expect(e.agreeTerms).toBeTruthy();
  });

  it("rejects oversized fields", () => {
    const e = validateOrderRequest({ ...okInput, name: "x".repeat(200) });
    expect(e.name).toBeTruthy();
  });
});

/* ---------------- lifecycle ---------------- */

describe("terminal statuses", () => {
  it("archives completed and cancelled orders", () => {
    expect(TERMINAL_STATUSES).toContain("COMPLETED");
    expect(TERMINAL_STATUSES).toContain("CANCELLED");
  });
});
