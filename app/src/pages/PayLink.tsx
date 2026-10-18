/**
 * PAYMENT LINK STATUS — /pay/:id
 *
 * The link ID is the bearer credential. This page is deliberately honest:
 * until a verified provider session exists behind the link, there is no
 * payment UI here at all — no fake card form, no "pay" button (brief §4.1).
 * When a real gateway is wired and the provider session is active, this
 * page redirects to the provider-hosted checkout.
 */

import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getPaymentLink } from "../lib/phase2";
import { effectiveStatus, type PaymentLink } from "../lib/payment-links";

export default function PayLink() {
  const { id } = useParams<{ id: string }>();
  const [link, setLink] = useState<PaymentLink | null | "loading">("loading");

  useEffect(() => {
    let active = true;
    void (async () => {
      const l = id ? await getPaymentLink(id) : null;
      if (active) setLink(l ?? null);
    })();
    return () => { active = false; };
  }, [id]);

  if (link === "loading") {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-8 h-8 border-2 border-[var(--dept)] border-t-transparent rounded-full animate-spin mb-4" />
        <p className="font-meta text-xs text-[var(--muted)]">Checking payment link…</p>
      </div>
    );
  }

  const shell = (icon: string, title: string, body: React.ReactNode) => (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
      <span className="text-4xl mb-4">{icon}</span>
      <h1 className="font-display font-bold text-xl uppercase tracking-tight text-[var(--ink)]">{title}</h1>
      <div className="text-xs text-[var(--muted)] mt-2 leading-relaxed">{body}</div>
      <Link to="/" className="btn btn-dept text-xs px-5 py-2.5 mt-6">Back to SocialKon10</Link>
    </div>
  );

  if (!link) return shell("🔒", "Link unavailable", "This payment link is invalid. Please ask the studio for a fresh link.");

  const status = effectiveStatus(link);
  const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: link.currency }).format(link.amountCents / 100);
  const ref = link.orderReference ?? link.invoiceNumber ?? "";

  switch (status) {
    case "paid":
      return shell("✅", "Already paid", <>This payment link for {ref} ({amount}) was settled on {link.paidAt ? new Date(link.paidAt).toLocaleDateString() : "record"}. Nothing further is due on it.</>);
    case "revoked":
      return shell("🚫", "Link revoked", <>This payment link for {ref} was revoked by the studio. Please contact them for an updated link.</>);
    case "expired":
      return shell("⌛", "Link expired", <>This payment link for {ref} expired on {new Date(link.expiresAt).toLocaleDateString()}. Please ask the studio for a fresh link.</>);
    case "failed":
      return shell("⚠️", "Payment unsuccessful", <>The payment attempt for {ref} ({amount}) did not complete. No charge was made by us — please ask the studio for a new link.</>);
    case "draft":
      // Internal placeholder — never expose a usable payment surface.
      return shell("🕓", "Payment not yet available", <>Online payment for {ref} ({amount}) is not active yet. The studio will notify you when it is — no action is needed right now.</>);
    case "active":
      // Future: redirect to the provider-hosted checkout session.
      return shell("💳", "Continue to secure payment", <>
        Amount due: <strong>{amount}</strong>{ref && <> for {ref}</>}.<br /><br />
        You will be redirected to the payment provider's hosted checkout. SocialKon10 never sees or stores card details.
        {link.providerSessionRef && (
          <>
            <br /><br />
            <a href={link.providerSessionRef} className="btn btn-dept text-xs px-5 py-2.5 inline-block">Continue to payment →</a>
          </>
        )}
      </>);
  }
}
