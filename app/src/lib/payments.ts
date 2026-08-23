/* ------------------------------------------------------------------
   PAYMENT PROVIDER ABSTRACTION (PRD §28)
   Provider-agnostic interface. PayPal is the primary candidate for a
   Jamaican merchant; Stripe is not directly available in Jamaica and
   must not be assumed. A Caribbean provider can be added by
   implementing PaymentProvider — checkout code never changes.
------------------------------------------------------------------- */

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

/** Demo provider — simulates the full payment lifecycle for development. */
const demoProvider: PaymentProvider = {
  id: "demo",
  name: "Demo gateway",
  available: true,
  note: "Development provider — no real charge is made.",
  async pay(req) {
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

export function activeProviders(): PaymentProvider[] {
  return PAYMENT_PROVIDERS.filter((p) => p.available);
}
