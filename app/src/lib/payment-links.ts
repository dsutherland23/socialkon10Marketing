/**
 * FUTURE-READY PAYMENT LINKS (Phase 2, Feature 4)
 *
 * Pure data model + state machine. No provider SDK, no Firebase imports.
 *
 * DESIGN CONTRACT (per brief §4.1): until a real gateway passes checkout
 * verification, payment links exist only as records — they are NEVER
 * presented to customers as functional checkout, and no card data is ever
 * collected. `customerFacingUrl()` returns null for non-active links so the
 * UI literally cannot render a fake payment page link.
 */

export type PaymentLinkStatus =
  | "draft"       // created, provider not verified — internal only
  | "active"      // provider session created; payable by the customer
  | "paid"        // verified server-side webhook confirmed payment
  | "expired"
  | "revoked"
  | "failed";     // provider reported failure (terminal for the link)

export interface PaymentAttempt {
  at: string;                 // ISO
  result: "started" | "succeeded" | "failed" | "expired";
  providerRef?: string;
  detail?: string;
}

export interface PaymentLink {
  id: string;                 // unguessable — functions as the bearer token
  orderId?: string;
  orderReference?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  amountCents: number;        // exact payable amount — integer cents only
  currency: string;           // ISO 4217
  customerEmail: string;
  status: PaymentLinkStatus;
  provider?: string;          // "stripe" | "paypal" | … once wired
  providerSessionRef?: string;
  providerPaymentRef?: string;
  expiresAt: string;          // ISO
  attempts: PaymentAttempt[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
  revokedAt?: string;
  revokeReason?: string;
}

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

/** Unguessable link ID — the ID itself is the access credential. */
export function generatePaymentLinkId(rand: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < 24; i++) s += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  return `pl_${s}`;
}

/** Integer-cents validation for a payable amount. */
export function validatePayableAmount(amountCents: number): string | null {
  if (!Number.isInteger(amountCents)) return "Amount must be an integer number of cents";
  if (amountCents <= 0) return "Amount must be greater than zero";
  if (amountCents > 100_000_000) return "Amount exceeds the supported maximum"; // $1M sanity cap
  return null;
}

/** Currency must be ISO-4217 alpha-3. */
export function validateCurrency(currency: string): string | null {
  return /^[A-Z]{3}$/.test(currency) ? null : "Currency must be a 3-letter ISO code (e.g. USD)";
}

export function isExpired(link: Pick<PaymentLink, "expiresAt" | "status">, now: Date = new Date()): boolean {
  if (link.status === "expired") return true;
  return new Date(link.expiresAt).getTime() <= now.getTime();
}

/** Effective status, folding time-based expiry in. */
export function effectiveStatus(link: PaymentLink, now: Date = new Date()): PaymentLinkStatus {
  if ((link.status === "active" || link.status === "draft") && isExpired(link, now)) return "expired";
  return link.status;
}

/**
 * Allowed manual status transitions for the admin UI.
 * "paid" is NOT here by design: a link becomes paid only through a
 * verified provider webhook — never by admin click, never by a customer
 * landing on a success page.
 */
export const ADMIN_TRANSITIONS: Record<PaymentLinkStatus, PaymentLinkStatus[]> = {
  draft:   ["revoked", "expired"],
  active:  ["revoked", "expired"],
  expired: [],
  revoked: [],
  paid:    [],
  failed:  ["revoked"],
};

export function canTransition(from: PaymentLinkStatus, to: PaymentLinkStatus): boolean {
  return (ADMIN_TRANSITIONS[from] ?? []).includes(to);
}

/** What may a link be created against? A valid, payable order or invoice. */
export function validateLinkTarget(t: { orderId?: string; invoiceId?: string }): string | null {
  if (!t.orderId && !t.invoiceId) return "A payment link needs an order or an invoice";
  if (t.orderId && t.invoiceId) return "Link to an order OR an invoice, not both";
  return null;
}

/**
 * Customer-facing URL — returns null unless the link is genuinely active
 * (provider session exists, not expired). This is the guard that stops a
 * "fake functional payment link" from ever being shown (brief §4.1).
 */
export function customerFacingUrl(link: PaymentLink, origin: string, now: Date = new Date()): string | null {
  if (effectiveStatus(link, now) !== "active") return null;
  if (!link.providerSessionRef) return null; // no real session → nothing to pay
  return `${origin}/pay/${link.id}`;
}

/** Default expiry: 7 days from creation. */
export function defaultExpiry(from: Date = new Date(), days = 7): string {
  return new Date(from.getTime() + days * 86_400_000).toISOString();
}
