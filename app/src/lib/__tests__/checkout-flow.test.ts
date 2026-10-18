import { describe, it, expect, beforeEach } from "vitest";
import { activeProviders, PAYMENT_PROVIDERS, getProvider } from "../payments";
import type { CheckoutSettings } from "../order-utils";

const verified = (mode: CheckoutSettings["mode"]): CheckoutSettings => ({
  mode,
  gateway: { providerId: "demo", environment: "sandbox", verified: true },
});

describe("payment provider gating", () => {
  it("exposes the registered providers", () => {
    expect(PAYMENT_PROVIDERS.map((p) => p.id)).toContain("paypal");
    expect(PAYMENT_PROVIDERS.map((p) => p.id)).toContain("demo");
    expect(getProvider("stripe")?.available).toBe(false);
  });

  it("offers NO provider in ORDER_REQUEST mode — even when verified", () => {
    expect(activeProviders(verified("ORDER_REQUEST"))).toEqual([]);
  });

  it("offers NO provider when the gateway is unverified (safe degradation)", () => {
    const s: CheckoutSettings = { mode: "HYBRID", gateway: { providerId: "demo", environment: "sandbox", verified: false } };
    expect(activeProviders(s)).toEqual([]);
  });

  it("offers NO provider when the selected provider is unavailable", () => {
    const s: CheckoutSettings = { mode: "ONLINE_PAYMENT", gateway: { providerId: "paypal", environment: "live", verified: true } };
    expect(activeProviders(s)).toEqual([]);
  });

  it("offers the verified provider in HYBRID / ONLINE_PAYMENT mode", () => {
    // The demo gateway is only `available` in dev builds; vitest runs with DEV=true.
    const hybrid = activeProviders(verified("HYBRID"));
    const online = activeProviders(verified("ONLINE_PAYMENT"));
    if (import.meta.env.DEV) {
      expect(hybrid.map((p) => p.id)).toEqual(["demo"]);
      expect(online.map((p) => p.id)).toEqual(["demo"]);
    } else {
      expect(hybrid).toEqual([]);
      expect(online).toEqual([]);
    }
  });

  it("the demo gateway refuses to run outside development", async () => {
    const demo = getProvider("demo")!;
    if (!import.meta.env.DEV) {
      const res = await demo.pay({ orderId: "T", amountUsd: 10, description: "t", kind: "full" });
      expect(res.ok).toBe(false);
    }
  });

  it("rejects non-positive amounts", async () => {
    const demo = getProvider("demo")!;
    const res = await demo.pay({ orderId: "T", amountUsd: 0, description: "t", kind: "full" });
    expect(res.ok).toBe(false);
  });
});

describe("duplicate-order guard", () => {
  beforeEach(() => {
    // minimal localStorage/sessionStorage shim for node
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    (globalThis as Record<string, unknown>).localStorage = storage;
    (globalThis as Record<string, unknown>).sessionStorage = (() => {
      const m = new Map<string, string>();
      return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
    })();
  });

  it("detects an identical order inside the 10-minute window", async () => {
    const { computeOrderFingerprint, checkRecentDuplicateOrder, recordCompletedOrder } = await import("../orderConflict");
    const items = [{ name: "Logo Design", unitPrice: 450, serviceSlug: "logo-design" }];
    const fp = computeOrderFingerprint("ada@example.com", items, 450);
    expect(checkRecentDuplicateOrder(fp).isDuplicate).toBe(false);
    recordCompletedOrder("SK10-260208-AAAAA", fp, 450, "ada@example.com", ["Logo Design"]);
    const dup = checkRecentDuplicateOrder(fp);
    expect(dup.isDuplicate).toBe(true);
    expect(dup.recentOrder?.orderId).toBe("SK10-260208-AAAAA");
  });

  it("does not flag different carts or emails as duplicates", async () => {
    const { computeOrderFingerprint, checkRecentDuplicateOrder, recordCompletedOrder } = await import("../orderConflict");
    const fp1 = computeOrderFingerprint("a@x.com", [{ name: "A", unitPrice: 10 }], 10);
    const fp2 = computeOrderFingerprint("b@x.com", [{ name: "A", unitPrice: 10 }], 10);
    const fp3 = computeOrderFingerprint("a@x.com", [{ name: "B", unitPrice: 10 }], 10);
    expect(fp1).not.toBe(fp2);
    expect(fp1).not.toBe(fp3);
    recordCompletedOrder("REF1", fp1, 10, "a@x.com", ["A"]);
    expect(checkRecentDuplicateOrder(fp2).isDuplicate).toBe(false);
    expect(checkRecentDuplicateOrder(fp3).isDuplicate).toBe(false);
  });

  it("payment lock is atomic within its TTL", async () => {
    const { acquirePaymentLock, releasePaymentLock } = await import("../orderConflict");
    expect(acquirePaymentLock()).toBe(true);
    expect(acquirePaymentLock()).toBe(false); // second acquisition blocked
    releasePaymentLock();
    expect(acquirePaymentLock()).toBe(true);
    releasePaymentLock();
  });
});

describe("entitlement gating predicate", () => {
  it("derives gating status for order-request rows", async () => {
    const { derivePaymentStatus } = await import("../order-utils");
    // Unpaid order request → no template entitlement
    expect(derivePaymentStatus({ total: 29, amountPaid: 0, paymentStatus: "UNPAID" })).not.toBe("PAID");
    // Admin-recorded offline payment → entitlement unlocks
    expect(derivePaymentStatus({ total: 29, amountPaid: 29, paymentStatus: "PAID" })).toBe("PAID");
  });
});
