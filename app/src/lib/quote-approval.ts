/**
 * SECURE QUOTE APPROVAL (Phase 2, Feature 2.4)
 *
 * Pure helpers for the customer-facing quotation review flow.
 *
 * SECURITY MODEL: an order reference or invoice number alone must never
 * authorize quotation access. Approval links carry an unguessable token
 * (docAccess/{token}) scoped to one quote with an expiry. Firestore rules
 * re-verify the token server-side on the decision write — the client page
 * alone is not the guard.
 */

export type QuoteDecision = "accepted" | "declined";

export interface DocAccessGrant {
  docId: string;          // financeDocuments id
  kind: "quote_approval";
  createdAt: string;      // ISO
  expiresAt: string;      // ISO
  expiresAtMs?: number;   // epoch ms — used by Firestore rules (numeric compare)
}

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

/** Unguessable approval token (not derived from the quote number). */
export function generateApprovalToken(rand: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < 28; i++) s += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  return `qt_${s}`;
}

/** Default approval link validity: 14 days. */
export function defaultApprovalExpiry(from: Date = new Date(), days = 14): string {
  return new Date(from.getTime() + days * 86_400_000).toISOString();
}

export function isGrantExpired(grant: Pick<DocAccessGrant, "expiresAt">, now: Date = new Date()): boolean {
  return new Date(grant.expiresAt).getTime() <= now.getTime();
}

/**
 * May this quote receive a customer decision right now?
 * Only a *sent* quote is decidable — drafts are internal, and a decided /
 * paid / void quote is closed. Returns null when allowed, else a reason.
 */
export function quoteDecisionBlocker(
  quote: { status: string; type: string },
  now: Date = new Date(),
  validUntil?: string,
): string | null {
  if (quote.type !== "quote") return "This document is not a quotation";
  if (quote.status === "draft") return "This quotation has not been sent yet";
  if (quote.status === "accepted" || quote.status === "declined" as string) return `This quotation was already ${quote.status}`;
  if (quote.status !== "sent") return `This quotation can no longer be decided (status: ${quote.status})`;
  if (validUntil && new Date(validUntil).getTime() <= now.getTime()) return "This quotation has expired";
  return null;
}

export function isValidDecision(d: unknown): d is QuoteDecision {
  return d === "accepted" || d === "declined";
}

/** What gets written when a customer decides — and nothing else. */
export function buildDecisionPayload(decision: QuoteDecision, byName: string, token: string) {
  return {
    status: decision,
    decisionAt: new Date().toISOString(),
    decisionBy: byName.trim().slice(0, 120) || "Customer",
    decisionToken: token,
  };
}

/** Quote version label helpers for the revision history. */
export function nextQuoteVersion(existing: number | undefined): number {
  return (existing ?? 0) + 1;
}
