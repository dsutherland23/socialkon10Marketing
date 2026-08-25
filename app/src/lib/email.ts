import { addDoc, collection } from "firebase/firestore";
import { db, firebaseReady, ADMIN_EMAILS } from "./firebase";
import { idbGet, idbSet } from "./backend";
import { formatMoney } from "./data";

/* ------------------------------------------------------------------
   TRANSACTIONAL EMAIL (PRD §65)
   Delivery path: client writes to the `mail` collection → the
   Firebase "Trigger Email" extension sends via the studio's SMTP
   (SendGrid/Postmark/etc.). Rules make `mail` write-only.

   Every email is also mirrored to a local audit log (sk-email-log)
   so sends are verifiable in demo mode and debuggable in production.
   sendEmail never throws — a failed email must never break checkout.
------------------------------------------------------------------- */

export type EmailType =
  | "order_confirmation"
  | "admin_new_order"
  | "intake_received"
  | "admin_intake"
  | "proposal_sent";

export interface EmailPayload { to: string; subject: string; html: string; type: EmailType }

export interface EmailLogEntry { id: string; to: string; subject: string; type: EmailType; via: string; at: string }

const STUDIO_NAME = "Socialkon10 Marketing Agency";
const STUDIO_EMAIL = ADMIN_EMAILS[0] ?? "socialkon10@gmail.com";

/** All studio inboxes that should receive admin notifications. */
export const studioInboxes = (): string[] => (ADMIN_EMAILS.length ? ADMIN_EMAILS : [STUDIO_EMAIL]);

async function logEmail(entry: Omit<EmailLogEntry, "id" | "at">): Promise<void> {
  const log = (await idbGet<EmailLogEntry[]>("sk-email-log")) || [];
  log.unshift({ ...entry, id: `EML-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, at: new Date().toISOString() });
  await idbSet("sk-email-log", log.slice(0, 100));
}

/** Debug/QA helper — the local audit trail of every email the app tried to send. */
export const getEmailLog = (): Promise<EmailLogEntry[]> =>
  idbGet<EmailLogEntry[]>("sk-email-log").then((x) => x ?? []);

export async function sendEmail(p: EmailPayload): Promise<void> {
  let via = "local-log-only";
  if (firebaseReady && db) {
    try {
      await addDoc(collection(db, "mail"), { to: p.to, message: { subject: p.subject, html: p.html } });
      via = "firestore-mail-extension";
    } catch (err) {
      console.warn("Email queue write failed (logged locally):", err);
      via = "local-log-after-error";
    }
  }
  await logEmail({ to: p.to, subject: p.subject, type: p.type, via });
}

/* ---------------- templates (table-based, inline CSS — email-client safe) ---------------- */

function shell(title: string, bodyHtml: string, cta?: { label: string; href: string }): string {
  const btn = cta
    ? `<tr><td style="padding:28px 0 8px">
         <a href="${cta.href}" style="background:#111111;color:#ffffff;text-decoration:none;font-family:Arial,sans-serif;font-size:12px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;padding:14px 28px;display:inline-block">${cta.label}</a>
       </td></tr>`
    : "";
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f2ee">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ee;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e3ded6">
        <tr><td style="background:#111111;padding:18px 28px">
          <span style="font-family:Arial,sans-serif;font-size:13px;font-weight:bold;letter-spacing:3px;color:#ffffff">SOCIAL KON10</span>
        </td></tr>
        <tr><td style="padding:32px 28px;font-family:Arial,sans-serif;color:#222222">
          <h1 style="font-size:20px;margin:0 0 16px;letter-spacing:0.5px">${title}</h1>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="font-size:14px;line-height:1.65;color:#333333">${bodyHtml}</td></tr>
          ${btn}
          </table>
        </td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid #e3ded6;font-family:Arial,sans-serif;font-size:11px;color:#8a857c;line-height:1.6">
          ${STUDIO_NAME} · Questions? Just reply to this email.<br/>
          This is a transactional message about your project — no marketing, ever.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

const itemRows = (items: { name: string; price?: number }[]): string =>
  items.map((i) => `<tr>
    <td style="padding:8px 0;border-bottom:1px solid #eee;font-size:13px">${i.name}</td>
    ${i.price !== undefined ? `<td align="right" style="padding:8px 0;border-bottom:1px solid #eee;font-size:13px">${formatMoney(i.price, "USD")}</td>` : ""}
  </tr>`).join("");

/* ---------------- order confirmation (client) ---------------- */

export function orderConfirmationEmail(args: {
  to: string; name: string; orderId: string;
  items: { name: string; price?: number }[]; total: number; portalUrl?: string;
}): EmailPayload {
  const body = `
    <p>Hi ${args.name || "there"},</p>
    <p>Payment received — thank you. Your order is confirmed and in the studio queue.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0">
      ${itemRows(args.items)}
      <tr><td style="padding:10px 0;font-size:14px;font-weight:bold">Total paid</td>
          <td align="right" style="padding:10px 0;font-size:14px;font-weight:bold">${formatMoney(args.total, "USD")}</td></tr>
    </table>
    <p style="font-size:13px;color:#555">Order reference: <strong>${args.orderId}</strong></p>
    <p>Track progress, files and next steps anytime in your client portal.</p>`;
  return {
    to: args.to,
    subject: `Order confirmed — ${args.orderId}`,
    html: shell("Order confirmed.", body, args.portalUrl ? { label: "Open your portal", href: args.portalUrl } : undefined),
    type: "order_confirmation",
  };
}

/* ---------------- new order alert (studio) ---------------- */

export function adminNewOrderEmail(args: {
  name: string; email: string; orderId: string;
  items: { name: string; price?: number }[]; total: number; adminUrl?: string;
}): EmailPayload {
  const body = `
    <p><strong>${args.name}</strong> (${args.email}) just placed an order.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0">
      ${itemRows(args.items)}
      <tr><td style="padding:10px 0;font-size:14px;font-weight:bold">Total</td>
          <td align="right" style="padding:10px 0;font-size:14px;font-weight:bold">${formatMoney(args.total, "USD")}</td></tr>
    </table>
    <p style="font-size:13px;color:#555">Order: ${args.orderId}</p>`;
  return {
    to: STUDIO_EMAIL,
    subject: `🛒 New order — ${formatMoney(args.total, "USD")} · ${args.name}`,
    html: shell("New order received.", body, args.adminUrl ? { label: "Open Studio Admin", href: args.adminUrl } : undefined),
    type: "admin_new_order",
  };
}

/* ---------------- intake received (client) ---------------- */

export function intakeReceivedEmail(args: {
  to: string; name: string; packageName: string; intakeId: string; portalUrl?: string;
  scopeShift?: { direction: string; summary: string; difference: number };
}): EmailPayload {
  const shiftBlock = args.scopeShift?.direction === "upgrade" ? `
    <p style="border-left:3px solid #d97706;padding:10px 14px;background:#fffbeb;font-size:13px">
      <strong>Scope upgrade noted:</strong> your brief scopes to ${args.scopeShift.summary}.
      Your payment is credited in full — the studio will send a proposal for the
      <strong>${formatMoney(args.scopeShift.difference, "USD")}</strong> difference before any work begins. Nothing is charged without your approval.
    </p>` : args.scopeShift?.direction === "downgrade" ? `
    <p style="border-left:3px solid #666;padding:10px 14px;background:#f5f5f5;font-size:13px">
      Your paid package already covers this scope — the studio will confirm added value or a credit in your proposal.
    </p>` : "";
  const body = `
    <p>Hi ${args.name || "there"},</p>
    <p>Your <strong>${args.packageName}</strong> project brief and signed agreement are with the studio — thank you.</p>
    ${shiftBlock}
    <p>What happens next:</p>
    <ol style="padding-left:18px;font-size:14px;line-height:1.8">
      <li>The studio reviews your brief &amp; signed scope</li>
      <li>You receive the final proposal / confirmation</li>
      <li>Kickoff call scheduled — the build begins</li>
    </ol>
    <p style="font-size:13px;color:#555">Brief reference: <strong>${args.intakeId}</strong></p>
    <p>Your signed agreement is stored in your portal — you can view it anytime.</p>`;
  return {
    to: args.to,
    subject: `Project brief received — ${args.packageName}`,
    html: shell("Brief received. Agreement signed.", body, args.portalUrl ? { label: "View your brief", href: args.portalUrl } : undefined),
    type: "intake_received",
  };
}

/* ---------------- new signed brief alert (studio) ---------------- */

export function adminIntakeEmail(args: {
  business: string; contact: string; email: string; packageName: string; websiteType: string;
  oneTime: number; monthly: number; leadScore: number; leadCategory: string; intakeId: string; adminUrl?: string;
  scopeShift?: { direction: string; summary: string; difference: number };
}): EmailPayload {
  const shiftRow = args.scopeShift
    ? `<tr><td style="padding:6px 0;border-bottom:1px solid #eee;color:#777">⚠ Scope shift</td><td align="right" style="padding:6px 0;border-bottom:1px solid #eee"><strong>${args.scopeShift.summary}${args.scopeShift.direction === "upgrade" ? ` (+${formatMoney(args.scopeShift.difference, "USD")})` : args.scopeShift.direction === "downgrade" ? " — REVIEW credit/value" : " — custom quote"}</strong></td></tr>`
    : "";
  const body = `
    <p><strong>${args.business || args.contact}</strong> (${args.contact} · ${args.email}) signed a website brief.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;font-size:13px">
      <tr><td style="padding:6px 0;border-bottom:1px solid #eee;color:#777">Package</td><td align="right" style="padding:6px 0;border-bottom:1px solid #eee">${args.packageName}</td></tr>
      <tr><td style="padding:6px 0;border-bottom:1px solid #eee;color:#777">Website type</td><td align="right" style="padding:6px 0;border-bottom:1px solid #eee">${args.websiteType}</td></tr>
      ${shiftRow}
      <tr><td style="padding:6px 0;border-bottom:1px solid #eee;color:#777">Estimate</td><td align="right" style="padding:6px 0;border-bottom:1px solid #eee">${formatMoney(args.oneTime, "USD")}${args.monthly > 0 ? ` + ${formatMoney(args.monthly, "USD")}/mo` : ""}</td></tr>
      <tr><td style="padding:6px 0;color:#777">Lead score</td><td align="right" style="padding:6px 0"><strong>${args.leadScore} · ${args.leadCategory}</strong></td></tr>
    </table>
    <p style="font-size:13px;color:#555">Brief: ${args.intakeId} — review the scope and send the proposal.</p>`;
  return {
    to: STUDIO_EMAIL,
    subject: `📝 Signed brief — ${args.business || args.contact} · ${formatMoney(args.oneTime, "USD")}${args.scopeShift?.direction === "upgrade" ? " · ⚠ SCOPE SHIFT" : ""}`,
    html: shell("New signed website brief.", body, args.adminUrl ? { label: "Review in Intakes", href: args.adminUrl } : undefined),
    type: "admin_intake",
  };
}

/* ---------------- proposal sent (client) ---------------- */

export function proposalEmail(args: {
  to: string; name: string; description: string; amount: number; orderId: string; portalUrl?: string;
}): EmailPayload {
  const body = `
    <p>Hi ${args.name || "there"},</p>
    <p>Great news — the studio reviewed your signed brief and your final proposal is ready:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0">
      <tr><td style="padding:8px 0;border-bottom:1px solid #eee;font-size:13px">${args.description}</td>
          <td align="right" style="padding:8px 0;border-bottom:1px solid #eee;font-size:13px;font-weight:bold">${formatMoney(args.amount, "USD")}</td></tr>
    </table>
    <p>It's payable right now in your client portal — once payment lands, your project moves straight into production.</p>
    <p style="font-size:13px;color:#555">Reference: <strong>${args.orderId}</strong></p>`;
  return {
    to: args.to,
    subject: `Your proposal is ready — ${formatMoney(args.amount, "USD")}`,
    html: shell("Your final proposal is ready.", body, args.portalUrl ? { label: "Pay in your portal", href: args.portalUrl } : undefined),
    type: "proposal_sent",
  };
}
