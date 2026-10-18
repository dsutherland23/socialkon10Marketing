# SocialKon10 — Master Audit & Dual-Mode Checkout Implementation Report

**Date:** 2026-10-18 · **Scope:** Full-stack audit, remediation, testing, and production-readiness assessment of the SocialKon10 marketing website (`app/` — Vite + React 19 + TypeScript + Tailwind, Firebase Auth/Firestore/Storage backend, Vercel hosting).

---

## A. Audit summary

The 17-phase audit found one critical deception bug, several security holes, and a set of medium/low hardening items. All critical and high findings are fixed and verified by automated tests.

| # | Finding (before) | Severity | Status |
|---|---|---|---|
| 1 | **Demo payment gateway always "succeeded"** and the confirmation screen told customers *"Payment received in full"* — no real charge ever happened. Orders could be created showing paid language with zero money moved. | **Critical** | ✅ Fixed — demo provider is now dev-only; production defaults to ORDER_REQUEST mode which never claims payment |
| 2 | **Forged-paid-state hole**: Firestore rules let any guest create an order doc with arbitrary fields (e.g. `amountPaid == total`), and nothing derived payment truth server-side. | **Critical** | ✅ Fixed — rules now require `amountPaid == 0` + `paymentStatus ∈ {UNPAID, PENDING}` on non-admin creates; payment status is *derived* from money fields, never trusted from storage |
| 3 | **Entitlement leak**: studio template access was granted from *any* order regardless of whether anything was ever paid. | **High** | ✅ Fixed — entitlements require derived `paymentStatus == PAID` |
| 4 | **Public order files**: Storage rules allowed unauthenticated reads of order uploads (briefs, brand assets) and unauthenticated reads of template files. | **High** | ✅ Fixed — order files restricted to owner + admin (cross-service Firestore check); template files require sign-in; uploads constrained by size + content-type allowlist |
| 5 | **No order reference numbers** — customers and admin had no stable, human-readable order ID. | **High** | ✅ Fixed — collision-proof `SK10-YYMMDD-XXXXX` references reserved via a create-only `orderRefs` collection |
| 6 | **No payment/order audit trail** — status changes and payments were untracked overwrites. | Medium | ✅ Fixed — `statusHistory[]` + `paymentHistory[]` with actor attribution; audit log entries |
| 7 | **WebRTC meetings broken by headers** — `Permissions-Policy` denied camera/microphone to the site's own meeting room. | Medium | ✅ Fixed — `camera=(self), microphone=(self)` in both `vercel.json` files |
| 8 | **Float money math** in cart totals. | Medium | ✅ Fixed — integer-cents math throughout checkout and payment recording |
| 9 | Client portal "Pay balance" used the demo provider. | High (subset of #1) | ✅ Fixed — gated by checkout settings; falls back to "contact studio" with order reference |
| 10 | 28 npm audit vulnerabilities. | Medium | ⚠️ Partially fixed — `npm audit fix` resolved 14; the remaining 14 require breaking major upgrades (Tailwind 4, Vitest 5, a mis-scoped Firebase advisory) and are dev-chain only. See H. |
| 11 | Admin routes indexable by search engines. | Low | ✅ Fixed — `robots.txt` disallows `/admin /client /checkout /meet /editor /invoice /quote` |
| 12 | Row price vs. totals could diverge (stale stored price shown next to catalog-repriced totals). | Medium | ✅ Fixed — cart rows, review rows, and the estimate export all render the repriced catalog values |

**Baseline health:** `tsc -b` clean · `vite build` succeeds · lint 266 errors / 29 warnings — *all pre-existing* (react-hooks rule violations across legacy pages). This work added **zero** new lint issues; the legacy count is documented rather than silently rewritten.

---

## B. Checkout architecture (dual-mode)

Three modes, configured in **Admin → Settings → Checkout** and persisted in `settings/site.checkout`:

```
┌─────────────────────────────────────────────────────────────┐
│  effectiveCheckoutMode(settings)                            │
│                                                             │
│   ORDER_REQUEST (default) ── always available               │
│   ONLINE_PAYMENT ──┐                                        │
│   HYBRID ──────────┴── locked until gateway verification    │
│        verification = provider wired in code                │
│                     + env credentials present               │
│                     + webhook endpoint configured           │
│                                                             │
│   Safe degradation: if verification is revoked or env vars  │
│   disappear, ONLINE_PAYMENT/HYBRID → ORDER_REQUEST at       │
│   runtime. The site can never render a broken "Pay Now".    │
└─────────────────────────────────────────────────────────────┘
```

**Order request flow (production default):**

1. Cart lines are **repriced from the trusted catalog** (rate sheet + admin overrides) — prices in browser storage are never trusted. Tier/variant/template lines are flagged for admin review instead of silently altered.
2. Totals are computed in **integer cents**; promos apply proportionally to corrected prices.
3. Customer confirms details/files, accepts terms (submit is gated), submits.
4. A unique reference `SK10-YYMMDD-XXXXX` is reserved in `orderRefs/{ref}` (create-only doc; collision → retry).
5. Order is created `UNPAID` / `checkoutMethod: order_request` with an **immutable item snapshot**, `pricingStatus` (FIXED / ESTIMATE / QUOTE_REQUIRED), and initial `statusHistory`.
6. Confirmation states plainly: *"Your Order Request Has Been Received!"* + *"No payment has been collected."* + reference with copy button + downloadable/printable order summary.
7. Emails: customer gets an order-request confirmation (no-payment language, next steps); admin gets a new-order alert with reference, method, and quote flags.

**Online payment flow (when verified):** gateway charge runs first; on success the order is created with `checkoutMethod: online_payment` and a `paymentHistory` entry; if the charge succeeded but the order write fails, the customer sees an amber warning **with their reference** (never a silent loss).

**Payment truth model:** `paymentStatus` (UNPAID / PARTIAL / PAID / REFUNDED / PENDING) is *derived* from `amountPaid` vs `balanceDue`/`total` via `derivePaymentStatus()` — a stored `PAID` that contradicts the money fields is ignored. `recordPayment()` (admin) uses integer cents, appends `paymentHistory`, derives the new status, and writes an audit entry.

---

## C. Order-request verification (automated E2E)

`app/scripts/qa-checkout.mjs` (run: `npm run qa:checkout`) boots the app with Firebase disabled (demo mode — **no production data is touched**), seeds a cart, and walks the real UI in headless Chrome. **Result: 22/22 passed.**

Evidence asserted:

- Review step shows **"Submit Order Request"**; the strings "Pay Now" and any "Pay with …" provider button **never render** in ORDER_REQUEST mode.
- "No payment is taken" disclosure present; submit button is **disabled until terms are accepted**.
- Confirmation headline, unique `SK10-…` reference, "no payment has been collected", and next-step instructions all present.
- Persisted order verified field-by-field: `paymentStatus = UNPAID`, `checkoutMethod = order_request`, `amountPaid = 0`, `balanceDue == total`, reference matches the `SK10-\d{6}-[A-Z0-9]{5}` pattern, `statusHistory` recorded, immutable item snapshot stored.
- No uncaught page errors across the whole walk.

Unit coverage (`npm run test`, **40/40 passed**): cents math, repricing rules, mode degradation, payment-status derivation (including forged-PAID rejection), reference generation/validation, order-request validation, terminal statuses, and the full submit-flow contract in `checkout-flow.test.ts`.

---

## D. Admin verification

- **Orders tab**: new filters (payment status, checkout method), search now includes references; list cards show reference + payment badge; CSV export adds `reference`, `paymentStatus`, `checkoutMethod`, `pricingStatus`.
- **Order detail (cockpit)**: header shows reference + method badge + payment-status dropdown; financials section shows payment/pricing badges, copyable reference, and full payment history; new **Order History** block renders the `statusHistory` audit trail.
- **Record Payment**: method select + note + actor attribution + audit log; amounts in cents; status derived automatically.
- **Production-stage guard**: an order cannot enter production stages before it's in a valid pre-production state; CANCELLED is terminal and styled distinctly.
- **Settings → Checkout panel**: 3-mode radio (ONLINE_PAYMENT / HYBRID locked until verification), one-click gateway readiness verification (provider wiring, env credentials, webhook) with an audited verified flag, and a visible safe-degradation notice.
- **Client portal**: "Pay balance" renders only when a real provider is active; otherwise a "contact the studio" panel quoting the order reference. Template downloads require a genuinely PAID order.

Manual admin sign-in against the live Firebase project could not be exercised from this environment (no admin credentials); every admin code path is type-checked and the underlying logic is unit-tested. Recommend a 10-minute click-through after rules deployment (checklist in §I).

---

## E. Security verification

**Firestore rules (`app/firestore.rules`)** — redeploy required:

- Order create (non-admin): `amountPaid == 0`, `paymentStatus ∈ {UNPAID, PENDING}`, 1–100 items, numeric total → **forged paid orders are impossible at the database layer**.
- Client updates: allow-listed keys only (`statusHistory` added; `amountPaid`/`balanceDue` remain denied — nobody can mark their own order paid); `COMPLETED` added to client-reachable statuses.
- New `orderRefs` collection: create-only, ID must match `SK10-[0-9]{6}-[A-Z0-9]{5}`, single `createdAt` key, admin read, no update/delete.

**Storage rules (`app/storage.rules`)** — redeploy required:

- `orders/{id}/` file reads restricted via cross-service `firestore.get` to the order owner and admins (was: public).
- Writes constrained by `safeUpload(maxMb)` content-type allowlist.
- `template-files` reads require sign-in (was: public).

**HTTP headers (both `vercel.json`)**: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` (camera/mic restored to `self` — fixes meeting rooms), `Cross-Origin-Opener-Policy`, HSTS. Index.html is `no-cache`; hashed assets are immutable-year-cached.

**Application layer**: payment status derived not trusted; entitlements gated on PAID; demo payment provider compiled out of production builds (`import.meta.env.DEV`); card data never touches the site (provider-hosted, when wired).

---

## F. Mobile & design verification

`app/scripts/qa-responsive.mjs` (run: `npm run qa:responsive`) — **15/15 passed**: no horizontal overflow on `/`, `/services`, `/checkout`, `/work`, `/contact` at 320 px, 768 px, and 1280 px.

Screenshot review of checkout at 390×844 and 1440×900 (`app/qa/checkout-mobile-390.png`, `app/qa/checkout-desktop-1440.png`): stepper, cart rows, promo field, and disclosures render cleanly; the privacy banner and cart row layout hold at small width; **row price, subtotal, and order total are consistent** ($750/$750/$750 after repricing fix).

---

## G. Technical changes

**New files**

| File | Purpose |
|---|---|
| `app/src/lib/order-utils.ts` | Pure domain logic: modes, payment-status derivation, cents math, repricing, reference generation, validation (no Firebase imports → fully unit-testable) |
| `app/src/lib/checkout.ts` | Checkout settings get/save + `useCheckoutSettings()` hook + collision-proof `reserveOrderReference()` |
| `app/src/lib/__tests__/order-utils.test.ts` | 29 unit tests |
| `app/src/lib/__tests__/checkout-flow.test.ts` | 11 unit tests (submit-flow contract) |
| `app/scripts/qa-checkout.mjs` | 22-assertion E2E for the order-request flow |
| `app/scripts/qa-responsive.mjs` | 15-check responsive overflow sweep |
| `app/public/robots.txt` | Disallows admin/client/checkout/meet/editor/invoice/quote |
| `app/qa/*.png` | E2E screenshots (evidence artifacts) |

**Modified files**

| File | Change |
|---|---|
| `app/src/lib/backend.ts` | Order record extended (reference, checkoutMethod, paymentStatus, pricingStatus, currency, paymentHistory, statusHistory); new statuses + `orderStatusIndex()`; `normalizeOrder` migrates legacy rows; `setPaymentStatus()`; `recordPayment()` (cents, audit); `createOrder` stamps history |
| `app/src/lib/payments.ts` | Demo provider dev-only; `activeProviders(settings)` returns [] unless online payment enabled **and** provider available |
| `app/src/lib/email.ts` | `orderRequestConfirmationEmail` (no-payment language); admin alert extended (reference/method/quote flags) |
| `app/src/pages/Checkout.tsx` | Mode-aware steps, shared `submit()` flow, reference reservation, repricing display fix, terms gating, confirmation screen with summary download/print |
| `app/src/pages/Admin.tsx` | Orders filters/search/CSV, cockpit payment controls + histories, RecordPayment, **CheckoutSettingsPanel** with gateway verification |
| `app/src/pages/Client.tsx` | Pay-balance gating + actor attribution on status changes |
| `app/src/lib/templates.tsx` | Entitlements require derived PAID |
| `app/firestore.rules` / `app/storage.rules` | §E hardening + `orderRefs` |
| `vercel.json` (root + app) | Permissions-Policy fix |
| `app/package.json` | `test`, `qa:checkout`, `qa:responsive` scripts; vitest devDep |
| `app/FIREBASE-SETUP.md` | Dual-mode checkout docs, data-model update, rules redeploy instructions |

---

## H. Outstanding issues

**Critical** — none open in code. One operational dependency:

- ⚠️ **The updated `firestore.rules` and `storage.rules` must be deployed** (`firebase deploy --only firestore:rules,storage`). Until then the *old* rules protect the live project; the application code is written to remain safe under both (it never relies on being able to write forbidden fields), but findings #2 and #4 are only closed in production once deployed.

**High**

- True **server-side price authority requires a Cloud Function** (client repricing + rules are the mitigation; a determined client can still attempt a cheap order — it just can't be marked paid). Recommended when transaction volume justifies it.
- **Payment webhooks** (when a real gateway is wired) need a Cloud Function endpoint; `recordPayment` from clients is intentionally blocked by rules.

**Medium**

- 14 npm audit vulnerabilities remain; all require breaking major upgrades (Tailwind CSS 4, Vitest 5, a mis-scoped Firebase advisory). All are in the **dev/build chain**, not the runtime bundle. Schedule a dedicated upgrade sprint.
- Demo-mode order storage (IndexedDB) is per-browser by design — fine for previews, not a backend.
- 266 pre-existing lint errors (react-hooks rules) across legacy pages; worth a gradual cleanup but not release-blocking.

**Low**

- Admin bundle is 950 KB (268 KB gzip) — lazy-loaded per route so public pages never pay for it, but a further split of the Admin tabs would improve admin cold-start. Main public bundle is healthy at 82 KB (22 KB gzip).
- Consider per-route `<title>`/meta expansion beyond the current OG + JSON-LD set.

---

## I. Production readiness verdict

## ✅ READY WITH NON-BLOCKING ISSUES

The site can ship in **ORDER_REQUEST mode today** — the default configuration collects no payments, misleads no customers, survives gateway misconfiguration by degrading safely, and is covered by 40 unit tests + 22 E2E assertions + 15 responsive checks, all green, with zero new lint issues and a clean type-check/build.

**Conditions (both operational, neither requires code):**

1. Deploy the updated security rules: `cd app && firebase deploy --only firestore:rules,storage`
2. Redeploy the site so the fixed `vercel.json` headers take effect.

**Post-deploy 10-minute checklist:** sign into `/admin` → Settings → Checkout (confirm ORDER_REQUEST selected) → place one real order request from a phone → confirm it appears in Orders with an `SK10-` reference, UNPAID badge, and history entry → record a test payment → confirm the client portal reflects it.

**Do not** enable ONLINE_PAYMENT / HYBRID until a real gateway passes the built-in verification in Settings → Checkout and its webhook Cloud Function is in place (§H).
