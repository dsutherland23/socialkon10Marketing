/* ------------------------------------------------------------------
   PAYMENT PROVIDER ABSTRACTION (PRD §28 / Dual-Mode Checkout Phase 10)
   Provider-agnostic interface. PayPal is the primary candidate for a
   Jamaican merchant; Stripe is not directly available in Jamaica and
   must not be assumed. A Caribbean provider can be added by
   implementing PaymentProvider — checkout code never changes.

   HARD SAFETY RULES
   • The demo gateway only exists in development builds — it can never
     simulate a "successful" payment on the production site.
   • No provider is offered to customers until an administrator has
     verified the gateway in Settings → Checkout (verified flag stored
     server-side in settings/site).
   • Card data never touches SocialKon10 infrastructure — a real
     integration must use provider-hosted checkout / components.
------------------------------------------------------------------- */

import type { CheckoutSettings } from "./order-utils";
import { onlinePaymentEnabled } from "./order-utils";

export interface PaymentRequest {
  orderId: string;
  amountUsd: number;
  description: string;
  kind: "deposit" | "full" | "balance" | "subscription";
}

export interface PaymentResult {
  ok: boolean;
  transactionId?: string;
  provider: string;
  error?: string;
}

export interface PaymentProvider {
  id: string;
  name: string;
  available: boolean;
  note?: string;
  pay(req: PaymentRequest): Promise<PaymentResult>;
}

/** Demo provider — simulates the payment lifecycle for LOCAL DEVELOPMENT ONLY. */
const demoProvider: PaymentProvider = {
  id: "demo",
  name: "Demo gateway",
  // import.meta.env.DEV is false in every production build — the demo
  // gateway is physically incapable of running on the live site.
  available: import.meta.env.DEV,
  note: "Development provider — no real charge is made. Never enabled in production builds.",
  async pay(req) {
    if (!import.meta.env.DEV) return { ok: false, provider: "demo", error: "Demo gateway is not available in production" };
    await new Promise((r) => setTimeout(r, 1400));
    if (req.amountUsd <= 0) return { ok: false, provider: "demo", error: "Invalid amount" };
    return { ok: true, provider: "demo", transactionId: `DEMO-${Date.now()}` };
  },
};

const paypalProvider: PaymentProvider = {
  id: "paypal",
  name: "PayPal",
  available: false,
  note: "PayPal advertises Jamaica business checkout (PayPal + major cards). Wire PayPal JS SDK credentials server-side to enable. Never store raw card data.",
  async pay() {
    return { ok: false, provider: "paypal", error: "PayPal credentials not configured" };
  },
};

const stripeProvider: PaymentProvider = {
  id: "stripe",
  name: "Stripe",
  available: false,
  note: "Stripe does not currently list Jamaica as a directly supported country — do not use as the primary processor for a Jamaican merchant.",
  async pay() {
    return { ok: false, provider: "stripe", error: "Stripe is not available for this merchant region" };
  },
};

export const PAYMENT_PROVIDERS: PaymentProvider[] = [paypalProvider, demoProvider, stripeProvider];

export function getProvider(id: string | null | undefined): PaymentProvider | undefined {
  return PAYMENT_PROVIDERS.find((p) => p.id === id);
}

/**
 * Providers customers may actually pay through right now.
 * Empty unless the checkout settings explicitly enable online payment AND
 * the selected gateway has passed admin verification.
 */
export function activeProviders(settings?: CheckoutSettings): PaymentProvider[] {
  if (!settings) {
    // Legacy call sites without settings: only dev-mode demo gateway.
    return PAYMENT_PROVIDERS.filter((p) => p.available && p.id === "demo");
  }
  if (!onlinePaymentEnabled(settings)) return [];
  const p = getProvider(settings.gateway.providerId);
  return p && p.available ? [p] : [];
}
