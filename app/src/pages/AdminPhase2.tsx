/**
 * ADMIN PHASE-2 PANELS
 *
 * Self-contained panels wired into the Orders cockpit / Settings:
 *   - WhatsAppPanel        — template-driven WhatsApp follow-up + timeline
 *   - PaymentLinkPanel     — future-ready payment links (gateway-gated)
 *   - WhatsAppTemplatesEditor — editable message templates (Settings tab)
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { OrderRecord } from "../lib/backend";
import { getSettings, saveSettings } from "../lib/backend";
import {
  normalizePhone, mergeTemplates, renderTemplate, buildWhatsAppUrl,
  validateTemplate, previewOf, type WhatsAppTemplate, type TemplateValues,
} from "../lib/whatsapp";
import { logCommEvent, listCommEvents, createPaymentLink, listPaymentLinksFor, transitionPaymentLink } from "../lib/phase2";
import { useCheckoutSettings } from "../lib/checkout";
import { effectiveStatus, customerFacingUrl, type PaymentLink } from "../lib/payment-links";
import type { CommEvent } from "../lib/whatsapp";
import { useAuth } from "../lib/auth";

/* ──────────────────────────── helpers ─────────────────────────────── */

function orderTemplateValues(order: OrderRecord, paymentLinkUrl?: string): TemplateValues {
  const items = order.items
    .map((i) => `• ${i.name}${i.tierLabel ? ` (${i.tierLabel})` : ""}`)
    .join("\n");
  const total = new Intl.NumberFormat("en-US", { style: "currency", currency: order.currency || "USD" }).format(order.total);
  return {
    customer_name: order.name || "there",
    order_reference: order.reference || order.id,
    order_items: items,
    order_total: total,
    currency: order.currency || "USD",
    order_status: order.status,
    quote_reference: order.reference || order.id,
    payment_link: paymentLinkUrl ?? "",
    business_name: "SocialKon10 Marketing",
  };
}

/* ─────────────────────────── WhatsApp panel ───────────────────────── */

export function WhatsAppPanel({ order }: { order: OrderRecord }) {
  const { user } = useAuth();
  const actor = user?.email ?? "admin";
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>(() => mergeTemplates(null));
  const [templateId, setTemplateId] = useState("new_order_ack");
  const [events, setEvents] = useState<CommEvent[]>([]);
  const [copied, setCopied] = useState(false);

  const phoneRaw = order.details?.phone || order.details?.whatsapp || "";
  const phone = useMemo(() => normalizePhone(phoneRaw), [phoneRaw]);

  useEffect(() => {
    void getSettings().then((s) => {
      const overrides = (s as { whatsappTemplates?: WhatsAppTemplate[] }).whatsappTemplates;
      setTemplates(mergeTemplates(overrides));
    });
  }, []);

  useEffect(() => {
    void listCommEvents(order.id).then(setEvents);
  }, [order.id]);

  const template = templates.find((t) => t.id === templateId) ?? templates[0];
  const { text, missing } = renderTemplate(template?.body ?? "", orderTemplateValues(order));

  const log = (status: "prepared" | "opened") => {
    void logCommEvent({
      orderId: order.id,
      channel: "whatsapp",
      templateId: template.id,
      toPhone: phone?.display ?? "(missing)",
      messagePreview: previewOf(text),
      status,
      by: actor,
    }).then(() => listCommEvents(order.id).then(setEvents));
  };

  const openWhatsApp = () => {
    const url = buildWhatsAppUrl(phone, text);
    if (!url) {
      toast.error("This order has no valid customer phone number — add one before using WhatsApp follow-up.");
      return;
    }
    log("opened");
    window.open(url, "_blank", "noopener,noreferrer");
    toast.success("WhatsApp opened with a prepared message — review it there and press send yourself.");
  };

  const copyMessage = () => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      log("prepared");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div>
      <h4 className="font-meta text-[10px] text-[var(--muted)] uppercase tracking-wider mb-2">WhatsApp follow-up</h4>
      <div className="border border-[var(--line)] p-4 rounded-xl bg-[var(--bg)] space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="bg-[var(--panel)] border border-[var(--line)] px-2.5 py-1.5 text-xs rounded"
            aria-label="Message template"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
          <span className="font-meta text-[9.5px] text-[var(--muted)]">
            To: {phone ? phone.display : <span className="text-red-600 font-bold">no phone on file</span>}
          </span>
        </div>

        <pre className="whitespace-pre-wrap font-sans text-[12px] leading-relaxed border border-[var(--line)] rounded-lg p-3 bg-[var(--panel)] max-h-56 overflow-y-auto">
          {text}
        </pre>
        {missing.length > 0 && (
          <p className="font-meta text-[9.5px] text-amber-600">
            ⚠ Unfilled placeholders — review before sending: {missing.map((m) => `{${m}}`).join(" ")}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button onClick={openWhatsApp} disabled={!phone} className="btn btn-dept !py-1.5 !px-3 font-meta text-[10px] disabled:opacity-50">
            💬 Open in WhatsApp
          </button>
          <button onClick={copyMessage} className="btn btn-ghost !py-1.5 !px-3 font-meta text-[10px]">
            {copied ? "✓ Copied" : "Copy message"}
          </button>
        </div>
        <p className="font-meta text-[8.5px] text-[var(--muted)] leading-relaxed">
          Opens WhatsApp with the message prepared — a human reviews and sends it. Opening the link is logged as
          “opened”, never as “delivered”.
        </p>

        {events.length > 0 && (
          <div className="pt-2 border-t border-[var(--line)]">
            <p className="font-meta text-[9px] text-[var(--muted)] uppercase tracking-wider mb-1.5">Communication activity</p>
            <ul className="space-y-1 max-h-32 overflow-y-auto">
              {events.map((ev, i) => (
                <li key={ev.id ?? i} className="font-meta text-[9.5px] text-[var(--muted)] flex justify-between gap-2">
                  <span className="truncate">
                    {ev.channel} · {ev.templateId.replace(/_/g, " ")} → {ev.toPhone} · {ev.status}
                  </span>
                  <span className="shrink-0">{new Date(ev.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} · {ev.by}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── Payment link panel ─────────────────────── */

export function PaymentLinkPanel({ order, onChanged }: { order: OrderRecord; onChanged?: () => void }) {
  const { user } = useAuth();
  const actor = user?.email ?? "admin";
  const { settings } = useCheckoutSettings();
  const [links, setLinks] = useState<PaymentLink[]>([]);
  const [busy, setBusy] = useState(false);

  const gatewayVerified = settings.gateway.verified === true;
  const amountCents = Math.round(order.balanceDue * 100);

  const reload = () => void listPaymentLinksFor({ orderId: order.id }).then(setLinks);
  useEffect(reload, [order.id]);

  const create = async () => {
    setBusy(true);
    const res = await createPaymentLink({
      orderId: order.id,
      orderReference: order.reference,
      amountCents,
      currency: (order.currency || "USD").toUpperCase(),
      customerEmail: order.email,
      createdBy: actor,
      gatewayVerified,
    });
    setBusy(false);
    if (res.error) { toast.error(res.error); return; }
    toast.success("Payment link record created (draft — not customer-facing until a gateway is verified).");
    reload();
    onChanged?.();
  };

  return (
    <div>
      <h4 className="font-meta text-[10px] text-[var(--muted)] uppercase tracking-wider mb-2">Payment link</h4>
      <div className="border border-[var(--line)] p-4 rounded-xl bg-[var(--bg)] space-y-3">
        {!gatewayVerified && (
          <p className="font-meta text-[9.5px] text-amber-700 bg-amber-500/10 border border-amber-500/40 rounded px-3 py-2 leading-relaxed">
            Online payments are not yet active — no payment gateway has been verified in Settings → Checkout.
            Links created now are <strong>internal drafts only</strong> and are never shown to customers.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={create} disabled={busy || amountCents <= 0} className="btn btn-ghost !py-1.5 !px-3 font-meta text-[10px] disabled:opacity-50">
            {busy ? "Creating…" : `Create payment link (balance ${order.balanceDue.toFixed(2)} ${order.currency || "USD"})`}
          </button>
        </div>

        {links.length > 0 && (
          <ul className="space-y-1.5">
            {links.map((l) => {
              const st = effectiveStatus(l);
              const url = customerFacingUrl(l, window.location.origin);
              return (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 border border-[var(--line)] rounded-lg px-3 py-2">
                  <div className="font-meta text-[9.5px] text-[var(--muted)]">
                    <span className="font-bold text-[var(--ink)] uppercase">{st}</span> · {(l.amountCents / 100).toFixed(2)} {l.currency}
                    {" · expires "}{new Date(l.expiresAt).toLocaleDateString()}
                    {url && <> · <a className="dept-accent u-line" href={url} target="_blank" rel="noreferrer">open</a></>}
                  </div>
                  {(st === "draft" || st === "active") && (
                    <button
                      onClick={() => void transitionPaymentLink(l.id, "revoked", actor, "revoked by admin").then(reload)}
                      className="font-meta text-[9px] text-red-600 u-line"
                    >
                      Revoke
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ───────────────────── WhatsApp templates editor ──────────────────── */

export function WhatsAppTemplatesEditor() {
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>(() => mergeTemplates(null));
  const [overrides, setOverrides] = useState<WhatsAppTemplate[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getSettings().then((s) => {
      const ov = (s as { whatsappTemplates?: WhatsAppTemplate[] }).whatsappTemplates ?? [];
      setOverrides(ov);
      setTemplates(mergeTemplates(ov));
    });
  }, []);

  const update = (id: string, body: string) => {
    setTemplates((ts) => ts.map((t) => (t.id === id ? { ...t, body } : t)));
  };

  const save = async () => {
    const problems = templates.flatMap((t) => validateTemplate(t.body).map((p) => `${t.label}: ${p}`));
    if (problems.length > 0) {
      toast.error(`Fix template errors first:\n${problems.join("\n")}`);
      return;
    }
    setSaving(true);
    try {
      const current = await getSettings();
      // Store only templates that differ from defaults, as overrides.
      const nextOverrides = templates.filter((t) => {
        const d = mergeTemplates(null).find((x) => x.id === t.id);
        return d?.body !== t.body;
      });
      await saveSettings({ ...current, whatsappTemplates: nextOverrides });
      setOverrides(nextOverrides);
      toast.success("WhatsApp templates saved.");
    } catch (err) {
      console.error(err);
      toast.error("Could not save templates.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-[var(--line)] rounded-xl p-5 bg-[var(--panel)] space-y-4">
      <div>
        <h3 className="font-display text-sm font-bold uppercase">WhatsApp message templates</h3>
        <p className="font-meta text-[9.5px] text-[var(--muted)] mt-1">
          Placeholders: {"{customer_name} {order_reference} {order_items} {order_total} {currency} {order_status} {quote_reference} {payment_link} {business_name}"}
          {" · "}{overrides.length} customized
        </p>
      </div>
      <div className="space-y-4 max-h-[28rem] overflow-y-auto pr-1">
        {templates.map((t) => {
          const errs = validateTemplate(t.body);
          return (
            <div key={t.id}>
              <label className="font-meta text-[10px] font-bold uppercase text-[var(--muted)] block mb-1">{t.label}</label>
              <textarea
                value={t.body}
                onChange={(e) => update(t.id, e.target.value)}
                rows={4}
                className={`w-full bg-[var(--bg)] border px-3 py-2 text-xs rounded leading-relaxed ${errs.length ? "border-red-500" : "border-[var(--line)]"}`}
              />
              {errs.map((e) => (
                <p key={e} className="font-meta text-[9px] text-red-600 mt-0.5">{e}</p>
              ))}
            </div>
          );
        })}
      </div>
      <button onClick={save} disabled={saving} className="btn btn-dept !py-1.5 !px-4 font-meta text-[10px]">
        {saving ? "Saving…" : "Save templates"}
      </button>
    </div>
  );
}
