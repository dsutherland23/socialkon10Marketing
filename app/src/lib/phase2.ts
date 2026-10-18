/**
 * PHASE 2 FIRESTORE LAYER
 *
 * Persistence for the four Phase-2 capabilities:
 *   - Communication events   (orders/{orderId}/events)       — WhatsApp log
 *   - Payment links          (paymentLinks/{id})             — future-ready
 *   - Quote approval grants  (docAccess/{token})             — secure links
 *
 * Every function degrades to IndexedDB-backed demo storage when Firebase
 * is not configured, so the full workflow remains testable offline.
 */

import {
  collection, doc, addDoc, setDoc, getDoc, getDocs, updateDoc,
  query, orderBy, serverTimestamp, limit as fbLimit,
} from "firebase/firestore";
import { db, firebaseReady } from "./firebase";
import { idbGet, idbSet, cleanFirestoreData, logAudit } from "./backend";
import type { CommEvent } from "./whatsapp";
import {
  type PaymentLink, type PaymentLinkStatus,
  generatePaymentLinkId, validatePayableAmount, validateCurrency,
  validateLinkTarget, defaultExpiry, effectiveStatus, canTransition,
} from "./payment-links";
import {
  type DocAccessGrant, type QuoteDecision,
  generateApprovalToken, defaultApprovalExpiry, isGrantExpired,
  isValidDecision, buildDecisionPayload,
} from "./quote-approval";

/* ════════════════════════════ COMM EVENTS ══════════════════════════════ */

const LOCAL_EVENTS_KEY = "sk-comm-events";

/** Append a communication event. Status may only be prepared|opened. */
export async function logCommEvent(evt: Omit<CommEvent, "at"> & { at?: string }): Promise<void> {
  const entry = cleanFirestoreData({ ...evt, at: evt.at ?? new Date().toISOString() });
  if (firebaseReady && db) {
    try {
      await addDoc(collection(db, "orders", evt.orderId, "events"), { ...entry, at: serverTimestamp(), atIso: entry.at });
      return;
    } catch (err) {
      console.warn("commEvents write failed, storing locally:", err);
    }
  }
  const all = (await idbGet<CommEvent[]>(LOCAL_EVENTS_KEY)) ?? [];
  await idbSet(LOCAL_EVENTS_KEY, [{ id: `ev-${Date.now()}`, ...entry }, ...all].slice(0, 1000));
}

/** Newest-first activity timeline for an order. */
export async function listCommEvents(orderId: string): Promise<CommEvent[]> {
  const local = ((await idbGet<CommEvent[]>(LOCAL_EVENTS_KEY)) ?? []).filter((e) => e.orderId === orderId);
  if (firebaseReady && db) {
    try {
      const snap = await getDocs(query(collection(db, "orders", orderId, "events"), orderBy("at", "desc"), fbLimit(100)));
      const remote = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return { id: d.id, ...(data as object), at: (data.atIso as string) ?? new Date().toISOString() } as CommEvent;
      });
      // Merge: remote wins on id; local-only demo entries still show.
      const seen = new Set(remote.map((r) => r.id));
      return [...remote, ...local.filter((l) => !seen.has(l.id))];
    } catch { /* fall through to local */ }
  }
  return local;
}

/* ═══════════════════════════ PAYMENT LINKS ═════════════════════════════ */

const LOCAL_LINKS_KEY = "sk-payment-links";

export interface CreatePaymentLinkInput {
  orderId?: string;
  orderReference?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  amountCents: number;
  currency: string;
  customerEmail: string;
  createdBy: string;
  /** True only when a real gateway passed checkout verification. */
  gatewayVerified: boolean;
}

/**
 * Create a payment link record. While no gateway is verified the link is
 * created as `draft` — an internal placeholder that can never be shown to
 * a customer (customerFacingUrl returns null for drafts).
 */
export async function createPaymentLink(input: CreatePaymentLinkInput): Promise<{ id?: string; error?: string }> {
  const amtErr = validatePayableAmount(input.amountCents);
  if (amtErr) return { error: amtErr };
  const curErr = validateCurrency(input.currency);
  if (curErr) return { error: curErr };
  const tgtErr = validateLinkTarget(input);
  if (tgtErr) return { error: tgtErr };
  if (!/.+@.+\..+/.test(input.customerEmail)) return { error: "A valid customer email is required" };

  const now = new Date().toISOString();
  const link: Omit<PaymentLink, "id"> = {
    orderId: input.orderId,
    orderReference: input.orderReference,
    invoiceId: input.invoiceId,
    invoiceNumber: input.invoiceNumber,
    amountCents: input.amountCents,
    currency: input.currency,
    customerEmail: input.customerEmail.trim().toLowerCase(),
    status: "draft", // becomes "active" only via a verified provider session
    expiresAt: defaultExpiry(),
    attempts: [],
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };
  const id = generatePaymentLinkId();
  if (firebaseReady && db) {
    try {
      await setDoc(doc(db, "paymentLinks", id), cleanFirestoreData(link));
      void logAudit({ user: input.createdBy, action: "payment_link.create", entity: `paymentLink:${id}`, after: { amountCents: link.amountCents, currency: link.currency, target: input.orderReference ?? input.invoiceNumber ?? "?" } });
      return { id };
    } catch (err) {
      console.warn("paymentLinks create failed, storing locally:", err);
    }
  }
  const all = (await idbGet<PaymentLink[]>(LOCAL_LINKS_KEY)) ?? [];
  await idbSet(LOCAL_LINKS_KEY, [{ id, ...link }, ...all]);
  return { id };
}

/** Public, by-ID fetch — the ID is the bearer credential. */
export async function getPaymentLink(id: string): Promise<PaymentLink | null> {
  if (firebaseReady && db) {
    try {
      const snap = await getDoc(doc(db, "paymentLinks", id));
      if (snap.exists()) return { id: snap.id, ...snap.data() } as PaymentLink;
    } catch { /* fall through */ }
  }
  const all = (await idbGet<PaymentLink[]>(LOCAL_LINKS_KEY)) ?? [];
  return all.find((l) => l.id === id) ?? null;
}

export async function listPaymentLinksFor(target: { orderId?: string; invoiceId?: string }): Promise<PaymentLink[]> {
  const match = (l: PaymentLink) =>
    (target.orderId && l.orderId === target.orderId) || (target.invoiceId && l.invoiceId === target.invoiceId);
  const local = ((await idbGet<PaymentLink[]>(LOCAL_LINKS_KEY)) ?? []).filter(match);
  if (firebaseReady && db) {
    try {
      const snap = await getDocs(query(collection(db, "paymentLinks"), orderBy("createdAt", "desc"), fbLimit(200)));
      const remote = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PaymentLink).filter(match);
      const seen = new Set(remote.map((r) => r.id));
      return [...remote, ...local.filter((l) => !seen.has(l.id))];
    } catch { /* fall through */ }
  }
  return local;
}

/** Admin manual transitions (revoke / expire) — never "paid". */
export async function transitionPaymentLink(id: string, to: PaymentLinkStatus, by: string, reason?: string): Promise<{ ok: boolean; error?: string }> {
  const link = await getPaymentLink(id);
  if (!link) return { ok: false, error: "Payment link not found" };
  const from = effectiveStatus(link);
  if (!canTransition(from, to)) return { ok: false, error: `Cannot move a ${from} link to ${to}` };
  const patch = cleanFirestoreData({
    status: to,
    updatedAt: new Date().toISOString(),
    ...(to === "revoked" ? { revokedAt: new Date().toISOString(), revokeReason: reason ?? "" } : {}),
  });
  if (firebaseReady && db) {
    try {
      await updateDoc(doc(db, "paymentLinks", id), patch);
      void logAudit({ user: by, action: `payment_link.${to}`, entity: `paymentLink:${id}`, after: reason ? { reason } : undefined });
      return { ok: true };
    } catch (err) {
      console.warn("paymentLinks update failed, applying locally:", err);
    }
  }
  const all = (await idbGet<PaymentLink[]>(LOCAL_LINKS_KEY)) ?? [];
  await idbSet(LOCAL_LINKS_KEY, all.map((l) => (l.id === id ? { ...l, ...patch } as PaymentLink : l)));
  return { ok: true };
}

/* ═══════════════════════ QUOTE APPROVAL GRANTS ═════════════════════════ */

const LOCAL_GRANTS_KEY = "sk-doc-access";

/** Issue a scoped, expiring approval link for a sent quote. */
export async function issueQuoteApprovalLink(quoteId: string, by: string): Promise<{ token?: string; error?: string }> {
  const token = generateApprovalToken();
  const expiresAt = defaultApprovalExpiry();
  const grant: DocAccessGrant = {
    docId: quoteId,
    kind: "quote_approval",
    createdAt: new Date().toISOString(),
    expiresAt,
    expiresAtMs: new Date(expiresAt).getTime(), // rules compare numerically
  };
  if (firebaseReady && db) {
    try {
      await setDoc(doc(db, "docAccess", token), cleanFirestoreData(grant));
      void logAudit({ user: by, action: "quote.approval_link", entity: `financeDocument:${quoteId}` });
      return { token };
    } catch (err) {
      console.warn("docAccess create failed, storing locally:", err);
    }
  }
  const all = (await idbGet<Record<string, DocAccessGrant>>(LOCAL_GRANTS_KEY)) ?? {};
  await idbSet(LOCAL_GRANTS_KEY, { ...all, [token]: grant });
  return { token };
}

/** Resolve an approval token → grant (null when missing/expired). */
export async function loadApprovalGrant(token: string): Promise<DocAccessGrant | null> {
  let grant: DocAccessGrant | null = null;
  if (firebaseReady && db) {
    try {
      const snap = await getDoc(doc(db, "docAccess", token));
      if (snap.exists()) grant = snap.data() as DocAccessGrant;
    } catch { /* fall through */ }
  }
  if (!grant) {
    const all = (await idbGet<Record<string, DocAccessGrant>>(LOCAL_GRANTS_KEY)) ?? {};
    grant = all[token] ?? null;
  }
  if (!grant || grant.kind !== "quote_approval") return null;
  if (isGrantExpired(grant)) return null;
  return grant;
}

/**
 * Record a customer's accept/decline. The Firestore rules re-verify the
 * token server-side; here we enforce the same preconditions client-side so
 * honest users get a clean error instead of a rules rejection.
 */
export async function submitQuoteDecision(
  token: string,
  quoteId: string,
  quoteStatus: string,
  quoteType: string,
  decision: unknown,
  byName: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!isValidDecision(decision)) return { ok: false, error: "Invalid decision" };
  if (quoteType !== "quote") return { ok: false, error: "This document is not a quotation" };
  if (quoteStatus !== "sent") return { ok: false, error: `This quotation can no longer be decided (status: ${quoteStatus})` };
  const grant = await loadApprovalGrant(token);
  if (!grant || grant.docId !== quoteId) return { ok: false, error: "This approval link is invalid or has expired" };

  const payload = buildDecisionPayload(decision as QuoteDecision, byName, token);
  if (firebaseReady && db) {
    try {
      await updateDoc(doc(db, "financeDocuments", quoteId), cleanFirestoreData({ ...payload, updatedAt: new Date().toISOString() }));
      return { ok: true };
    } catch (err) {
      console.warn("quote decision write failed:", err);
      return { ok: false, error: "Could not record your decision — please try again or contact the studio." };
    }
  }
  // Demo mode: mark the decision on the local mirror of the document list.
  const docs = (await idbGet<Array<{ id: string; status?: string }>>("sk-fin-docs")) ?? [];
  await idbSet("sk-fin-docs", docs.map((d) => (d.id === quoteId ? { ...d, ...payload } : d)));
  return { ok: true };
}

/* ═════════════════════ QUOTE-FROM-ORDER HANDOFF ═══════════════════════ */

import type { OrderRecord } from "./backend";

/**
 * Build a DocEditor prefill payload from an order and hand it to the
 * Finance tab (sessionStorage + tab-switch event). The quotation is
 * populated from the order's immutable item snapshot and stays fully
 * editable before being issued.
 */
export function createQuoteFromOrder(order: OrderRecord): void {
  const items = order.items.map((i, idx) => {
    const unit = (i.unitPrice + i.addons.reduce((s, a) => s + a.price, 0)) * (i.rush ? 1.25 : 1);
    const cents = Math.round(unit * 100);
    return {
      id: `qli-${idx}-${Date.now()}`,
      description: i.name + (i.tierLabel ? ` (${i.tierLabel})` : "") + (i.rush ? " — rush" : ""),
      qty: 1,
      unitPriceCents: cents,
      discountPct: 0,
      lineTotalCents: cents,
    };
  });
  const today = new Date().toISOString().slice(0, 10);
  const prefill = {
    id: "",
    type: "quote",
    status: "draft",
    clientName: order.name ?? "",
    clientEmail: order.email ?? "",
    clientPhone: order.details?.phone ?? "",
    clientAddress: order.details?.address ?? "",
    clientCity: order.details?.city ?? "",
    issueDate: today,
    items,
    relatedOrderId: order.id,
    internalNotes: `Created from order ${order.reference ?? order.id}.${order.promo ? ` Promo applied at checkout: ${order.promo} (-${order.discount}).` : ""}`,
  };
  sessionStorage.setItem("sk-fin-prefill", JSON.stringify(prefill));
  window.dispatchEvent(new CustomEvent("sk-admin-tab", { detail: "Finance" }));
}
