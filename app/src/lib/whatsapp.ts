/**
 * WHATSAPP ORDER FOLLOW-UP (Phase 2, Feature 1)
 *
 * Pure, side-effect-free helpers: phone normalization/validation, message
 * templates with placeholder substitution, and wa.me Click-to-Chat URL
 * construction. No Firebase imports — fully unit-testable.
 *
 * HONESTY CONTRACT: opening a wa.me link only *prepares* a message in the
 * admin's WhatsApp client. It is never "sent" until a human presses send,
 * and delivery can never be claimed from this integration. Callers must
 * log events with status "prepared" / "opened" — never "delivered".
 */

/* ── Phone numbers ──────────────────────────────────────────────────────── */

export interface NormalizedPhone {
  /** Digits only, including country code — the wa.me format. */
  e164Digits: string;
  /** Human-friendly display form. */
  display: string;
}

const DEFAULT_COUNTRY_CODE = "1876"; // Jamaica — SocialKon10's home market.

/**
 * Normalize a free-form phone string to international digits.
 * Returns null when the input cannot plausibly be a phone number.
 *
 * Accepts: "+1 (876) 255-4848", "876-255-4848", "1 876 255 4848",
 * "0018762554848". A bare 7-digit local number gets the default country code.
 */
export function normalizePhone(raw: string | null | undefined, defaultCc: string = DEFAULT_COUNTRY_CODE): NormalizedPhone | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2); // international prefix
  if (!digits) return null;

  // Local 7-digit number → prepend default country code.
  if (digits.length === 7) digits = defaultCc + digits;
  // 10-digit NANP number without leading 1 (e.g. 8762554848).
  else if (digits.length === 10 && defaultCc.startsWith("1")) digits = "1" + digits;

  if (!isValidPhoneDigits(digits)) return null;
  return { e164Digits: digits, display: `+${digits}` };
}

/** E.164-ish sanity: 8–15 digits, not starting with 0. */
export function isValidPhoneDigits(digits: string): boolean {
  return /^[1-9]\d{7,14}$/.test(digits);
}

/* ── Templates ──────────────────────────────────────────────────────────── */

export interface WhatsAppTemplate {
  id: string;
  label: string;
  body: string;
}

export const WHATSAPP_PLACEHOLDERS = [
  "customer_name",
  "order_reference",
  "order_items",
  "order_total",
  "currency",
  "order_status",
  "quote_reference",
  "payment_link",
  "business_name",
] as const;

export type WhatsAppPlaceholder = (typeof WHATSAPP_PLACEHOLDERS)[number];

export const DEFAULT_WHATSAPP_TEMPLATES: WhatsAppTemplate[] = [
  {
    id: "new_order_ack",
    label: "New order acknowledgment",
    body: "Hello {customer_name}, thank you for choosing {business_name}!\n\nWe're following up on your order request.\n\nOrder Reference: {order_reference}\n\nOrder Summary:\n{order_items}\n\nOrder Total / Estimate: {order_total}\n\nCurrent Status: {order_status}\n\nPlease let us know if you have any questions about your project.\n\nThank you for choosing {business_name}!",
  },
  {
    id: "quote_ready",
    label: "Quotation ready",
    body: "Hello {customer_name}, your quotation for order {order_reference} is ready.\n\nQuotation: {quote_reference}\nTotal: {order_total}\n\nWe'll share the review link shortly — you can accept or request changes directly.",
  },
  {
    id: "awaiting_approval",
    label: "Awaiting customer approval",
    body: "Hello {customer_name}, a friendly reminder that quotation {quote_reference} for order {order_reference} is waiting on your approval.\n\nTotal: {order_total}\n\nReply here if anything needs adjusting.",
  },
  {
    id: "payment_instructions",
    label: "Payment instructions",
    body: "Hello {customer_name}, here's how to complete payment for order {order_reference}.\n\nAmount due: {order_total}\n\n{payment_link}\n\nOnce paid, we'll confirm and move your project into production.",
  },
  {
    id: "payment_confirmation",
    label: "Payment confirmation",
    body: "Hello {customer_name}, we've confirmed your payment toward order {order_reference}.\n\nThank you! Your project is now moving forward. Current status: {order_status}",
  },
  {
    id: "project_started",
    label: "Project started",
    body: "Hello {customer_name}, great news — work has officially started on your project ({order_reference}).\n\nWe'll share progress updates right here.",
  },
  {
    id: "artwork_received",
    label: "Artwork received",
    body: "Hello {customer_name}, we've received the artwork/files you sent for order {order_reference}.\n\nOur team is reviewing them now and will confirm everything is production-ready.",
  },
  {
    id: "proof_ready",
    label: "Proof ready for review",
    body: "Hello {customer_name}, the proof for your project ({order_reference}) is ready for your review.\n\nPlease take a look and let us know: approved, or needs a revision?",
  },
  {
    id: "project_completed",
    label: "Project completed",
    body: "Hello {customer_name}, your project ({order_reference}) is complete!\n\nThank you for trusting {business_name} with your brand.",
  },
  {
    id: "ready_for_delivery",
    label: "Order ready for collection/delivery",
    body: "Hello {customer_name}, your order {order_reference} is ready for collection/delivery.\n\nReply to arrange the handoff.",
  },
  {
    id: "follow_up",
    label: "Customer follow-up",
    body: "Hello {customer_name}, just checking in on your order {order_reference} (status: {order_status}).\n\nAnything we can help with?",
  },
];

/** Placeholder tokens found in a template body, e.g. ["customer_name"]. */
export function extractPlaceholders(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(/\{([a-z_]+)\}/g)) out.add(m[1]);
  return [...out];
}

/**
 * Validate a template body: every placeholder must be a known token.
 * Returns a list of problems (empty = valid).
 */
export function validateTemplate(body: string): string[] {
  const problems: string[] = [];
  for (const p of extractPlaceholders(body)) {
    if (!(WHATSAPP_PLACEHOLDERS as readonly string[]).includes(p)) {
      problems.push(`Unknown placeholder {${p}}`);
    }
  }
  if (!body.trim()) problems.push("Template body is empty");
  return problems;
}

export type TemplateValues = Partial<Record<WhatsAppPlaceholder, string>>;

/**
 * Render a template with values. Unknown placeholders are left as-is and
 * reported in `missing` so the admin can see what wasn't substituted —
 * a message with unresolved placeholders must be reviewed before sending.
 */
export function renderTemplate(body: string, values: TemplateValues): { text: string; missing: string[] } {
  const missing: string[] = [];
  const text = body.replace(/\{([a-z_]+)\}/g, (raw, key: string) => {
    const v = values[key as WhatsAppPlaceholder];
    if (v == null || v === "") { missing.push(key); return raw; }
    return v;
  });
  return { text, missing };
}

/* ── Click-to-Chat URL ──────────────────────────────────────────────────── */

/**
 * Build a wa.me Click-to-Chat URL. Returns null when the phone number is
 * unusable — the caller must surface that as an error, never open a
 * numberless link.
 */
export function buildWhatsAppUrl(phone: NormalizedPhone | null, message: string): string | null {
  if (!phone) return null;
  return `https://wa.me/${phone.e164Digits}?text=${encodeURIComponent(message)}`;
}

/** Merge admin overrides over the default template set (by id). */
export function mergeTemplates(overrides: WhatsAppTemplate[] | undefined | null): WhatsAppTemplate[] {
  const map = new Map(DEFAULT_WHATSAPP_TEMPLATES.map((t) => [t.id, t]));
  for (const o of overrides ?? []) {
    if (o && typeof o.id === "string" && typeof o.body === "string") {
      map.set(o.id, { id: o.id, label: o.label || map.get(o.id)?.label || o.id, body: o.body });
    }
  }
  return [...map.values()];
}

/* ── Communication events ───────────────────────────────────────────────── */

/**
 * A prepared/opened message event. `status` can only ever be "prepared"
 * (previewed/copied) or "opened" (wa.me launched) — delivery is unknowable
 * from Click-to-Chat and must never be recorded.
 */
export interface CommEvent {
  id?: string;
  orderId: string;
  channel: "whatsapp";
  templateId: string;
  toPhone: string;
  messagePreview: string; // first 200 chars — audit without hoarding PII
  status: "prepared" | "opened";
  by: string;
  at: string; // ISO timestamp
}

export function previewOf(message: string, max = 200): string {
  return message.length <= max ? message : message.slice(0, max - 1) + "…";
}
