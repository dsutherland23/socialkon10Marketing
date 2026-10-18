import { describe, it, expect } from "vitest";
import {
  generatePaymentLinkId, validatePayableAmount, validateCurrency,
  isExpired, effectiveStatus, canTransition, validateLinkTarget,
  customerFacingUrl, defaultExpiry, type PaymentLink,
} from "../payment-links";
import {
  generateApprovalToken, isGrantExpired, defaultApprovalExpiry,
  quoteDecisionBlocker, isValidDecision, buildDecisionPayload, nextQuoteVersion,
} from "../quote-approval";

/* ── Payment links ─────────────────────────────────────────────────────── */

const baseLink = (over: Partial<PaymentLink> = {}): PaymentLink => ({
  id: "pl_test",
  amountCents: 45000,
  currency: "USD",
  customerEmail: "c@example.com",
  orderId: "o1",
  status: "draft",
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  attempts: [],
  createdBy: "admin@test.com",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...over,
});

describe("payment link ids & amounts", () => {
  it("ids are unguessable, prefixed, and unique", () => {
    const a = generatePaymentLinkId();
    const b = generatePaymentLinkId();
    expect(a).toMatch(/^pl_[A-Za-z0-9]{24}$/);
    expect(a).not.toBe(b);
    expect(a.slice(3)).not.toContain("l"); // ambiguous char excluded from the random part
  });
  it("rejects non-integer / non-positive / absurd amounts", () => {
    expect(validatePayableAmount(45000)).toBeNull();
    expect(validatePayableAmount(45.5)).not.toBeNull();
    expect(validatePayableAmount(0)).not.toBeNull();
    expect(validatePayableAmount(-100)).not.toBeNull();
    expect(validatePayableAmount(2_000_000_00)).not.toBeNull();
  });
  it("validates currency codes", () => {
    expect(validateCurrency("USD")).toBeNull();
    expect(validateCurrency("usd")).not.toBeNull();
    expect(validateCurrency("US")).not.toBeNull();
  });
});

describe("payment link targets & transitions", () => {
  it("requires exactly one of order/invoice", () => {
    expect(validateLinkTarget({ orderId: "o1" })).toBeNull();
    expect(validateLinkTarget({ invoiceId: "i1" })).toBeNull();
    expect(validateLinkTarget({})).not.toBeNull();
    expect(validateLinkTarget({ orderId: "o1", invoiceId: "i1" })).not.toBeNull();
  });
  it("'paid' is never an admin transition (webhook-only by design)", () => {
    for (const from of ["draft", "active", "expired", "revoked", "failed"] as const) {
      expect(canTransition(from, "paid")).toBe(false);
    }
  });
  it("allows draft/active → revoked/expired, and nothing from terminal states", () => {
    expect(canTransition("draft", "revoked")).toBe(true);
    expect(canTransition("active", "expired")).toBe(true);
    expect(canTransition("paid", "revoked")).toBe(false);
    expect(canTransition("revoked", "active")).toBe(false);
  });
});

describe("expiry & customer-facing URLs", () => {
  it("time-based expiry folds into effectiveStatus", () => {
    const past = baseLink({ status: "active", expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect(isExpired(past)).toBe(true);
    expect(effectiveStatus(past)).toBe("expired");
  });
  it("no customer URL for draft links — even though the record exists", () => {
    expect(customerFacingUrl(baseLink({ status: "draft" }), "https://x.com")).toBeNull();
  });
  it("no customer URL for an active link without a provider session", () => {
    expect(customerFacingUrl(baseLink({ status: "active" }), "https://x.com")).toBeNull();
  });
  it("customer URL only for active + provider session + unexpired", () => {
    const ok = baseLink({ status: "active", providerSessionRef: "cs_test_123" });
    expect(customerFacingUrl(ok, "https://x.com")).toBe("https://x.com/pay/pl_test");
  });
  it("defaultExpiry is ~7 days out", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    expect(new Date(defaultExpiry(from)).getTime() - from.getTime()).toBe(7 * 86_400_000);
  });
});

/* ── Quote approval ────────────────────────────────────────────────────── */

describe("approval tokens & grants", () => {
  it("tokens are unguessable and prefixed", () => {
    const t = generateApprovalToken();
    expect(t).toMatch(/^qt_[A-Za-z0-9]{28}$/);
    expect(t).not.toBe(generateApprovalToken());
  });
  it("grant expiry check", () => {
    expect(isGrantExpired({ expiresAt: new Date(Date.now() - 1).toISOString() })).toBe(true);
    expect(isGrantExpired({ expiresAt: defaultApprovalExpiry() })).toBe(false);
  });
});

describe("quoteDecisionBlocker", () => {
  it("only sent quotes are decidable", () => {
    expect(quoteDecisionBlocker({ type: "quote", status: "sent" })).toBeNull();
    expect(quoteDecisionBlocker({ type: "quote", status: "draft" })).toContain("not been sent");
    expect(quoteDecisionBlocker({ type: "quote", status: "accepted" })).toContain("already accepted");
    expect(quoteDecisionBlocker({ type: "quote", status: "paid" })).toContain("no longer");
    expect(quoteDecisionBlocker({ type: "invoice", status: "sent" })).toContain("not a quotation");
  });
  it("blocks expired quotes", () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    expect(quoteDecisionBlocker({ type: "quote", status: "sent" }, new Date(), yesterday)).toContain("expired");
  });
});

describe("decision payload & versions", () => {
  it("validates decisions", () => {
    expect(isValidDecision("accepted")).toBe(true);
    expect(isValidDecision("declined")).toBe(true);
    expect(isValidDecision("maybe")).toBe(false);
  });
  it("payload carries only decision fields", () => {
    const p = buildDecisionPayload("accepted", "  Ada  ", "qt_abc");
    expect(Object.keys(p).sort()).toEqual(["decisionAt", "decisionBy", "decisionToken", "status"]);
    expect(p.decisionBy).toBe("Ada");
    expect(p.status).toBe("accepted");
  });
  it("quote versions increment from zero", () => {
    expect(nextQuoteVersion(undefined)).toBe(1);
    expect(nextQuoteVersion(3)).toBe(4);
  });
});
