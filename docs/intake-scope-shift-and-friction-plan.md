# Scope-Mismatch Handling & Zero-Repeat Intake — Comprehensive Plan
**Socialkon10 · Web + Digital intake engine · v1.0 · 2026-08-25**

---

## 0. Audit findings (verified in code, 2026-08-25)

### 0.1 The scenario: paid Landing Page ($1,500) → intake says "Corporate Website"
Today, the system does **nothing** with that conflict:

| What should happen | What happens today |
|---|---|
| Detect the scope gap | Nothing — `website_type` is free-form, no tier comparison |
| Reprice / estimate the difference | `computeEstimate()` always uses the *paid* package base price |
| Tell the client | Silent — client signs a scope doc that still says "Custom one-page design" |
| Tell the admin | Silent — only a slightly higher lead score (Corporate = 14 vs Landing = 4) |
| Bill the difference | Admin must notice and manually type an amount in the Proposal button; default = add-ons only (`isAddonOnly` logic, Admin.tsx:1179) |

Only safety net: contract boilerplate — *"estimate … subject to final project review. The final proposal issued by the Studio governs the final price."*

### 0.2 Information captured twice
Checkout (`Checkout.tsx` Details) already stores on the order: name, company, email, phone, website, industry, **audience, goals, deadline, colors, style**, extra, plus uploaded files. The intake wizard re-asks all of it because its prefill chain is only `{name, email}` (Client.tsx:2276).

| Checkout already has | Intake asks again as |
|---|---|
| company | business_name |
| name | contact_name |
| email / phone | email / phone |
| website | existing_website |
| industry | industry |
| audience | target_audience |
| goals | primary_goal |
| deadline | timeline |
| colors | brand_colors |
| style | style_direction |
| uploaded files | asset upload step |

### 0.3 Two add-on catalogs, conflicting prices
The order-time configurator (`website-addons.ts`) and the intake (`INTAKE_ADDONS`) are separate catalogs with different ids and prices for the same work:

| Add-on | Configurator price | Intake price |
|---|---|---|
| WhatsApp integration | $100 | $250 |
| Booking system | $250 | $1,200 |
| Copywriting | (per-page pricing) | $500 flat |
| Analytics pack | $300 | "Advanced Analytics Dashboard" $800 |

A client can pay $100 for WhatsApp at checkout and then see the same feature quoted at $250 in their brief. **This is a pricing-integrity bug**, not just friction.

---

## 1. Scope-mismatch handling — the "Scope Shift" engine

### 1.1 Canonical tier map (single source of truth)
Add to `website-addons.ts` (already the pricing source of truth), consumed by intake, admin, and emails:

```
website_type        → required tier          → base USD (from data.ts/CMS overrides)
Landing Page        → landing-page           → $1,500
Portfolio           → landing-page           → $1,500  (1-pager class; pages add-on if more)
Business Website    → business-website       → $2,500
Corporate Website   → business-website       → $2,500
Booking Website     → business-website       → $2,500  (+ booking add-on)
E-commerce          → ecommerce-website      → $3,500
Membership          → custom                 → quote
Web Application     → custom                 → quote
Something else      → custom                 → quote
```

Prices are **read from the live service catalog** (CMS overrides respected), never hard-coded — consistent with the configurator's rule.

### 1.2 Detection
`detectScopeShift(pkg, websiteType)` returns:

```ts
{
  shifted: boolean;
  direction: "upgrade" | "downgrade" | "lateral" | "custom-quote";
  paidPackage: string;      requiredPackage: string;
  paidBase: number;         requiredBase: number;
  difference: number;       // requiredBase - paidBase (0 when quote-only)
}
```

Runs live inside the wizard every time `website_type` changes.

### 1.3 Client UX (no surprises — the 2026 rule: surface cost implications at the moment of choice)
1. **Inline scope-shift card** appears directly under the website-type cards the moment a mismatch is selected:
   > **Heads-up — this changes your project scope.**
   > A Corporate Website is scoped as our **Standard Business Website ($2,500)**. You've already paid **$1,500** for the Landing Page package — the **$1,000 difference** will be itemised in your final proposal. **Nothing is charged now.** Prefer to stay with a one-page site? Reselect Landing Page.
2. **Estimate step restructured** from one number to a ledger:
   - Paid to date: $1,500 ✓
   - Selected add-ons (not yet billed): $X
   - Scope upgrade difference: $1,000
   - **Estimated balance: $Y** · monthly services listed separately (existing rule preserved)
3. **Contract text itemises it**: scope sections switch to the *required* package's includes/excludes (not the paid one's), and the ESTIMATE block shows paid / balance / "final proposal governs".
4. **Submitted confirmation + email** restates: "Your brief indicates a scope upgrade — the studio will send a proposal for the difference before work begins. Your $1,500 is secured and credited in full."

### 1.4 Downgrades (paid $3,500 e-commerce → picks Landing Page)
Never auto-refund or auto-discount. Flag `direction: "downgrade"`, client sees "This is covered by your current package — the studio will confirm any credit or added value (e.g. extra pages) in your proposal." Admin decides: credit, added scope, or refund. Rationale: refunds are a business decision, not a UI event.

### 1.5 Custom-quote types (Membership / Web Application / Something else)
`direction: "custom-quote"` — estimate is labelled **indicative**, contract text already supports this ("custom-scoped build defined by this brief + final proposal"). No numeric difference promised.

### 1.6 Admin UX (Studio)
- **Intakes tab**: amber `SCOPE SHIFT +$1,000` badge on the row; red `DOWNGRADE — REVIEW` badge for downgrades. Both included in the existing visual-alerts system.
- **Proposal button**: default amount becomes `difference + addOnsTotal` (today: add-ons only). The description auto-writes: *"Scope upgrade Landing Page → Standard Business Website ($1,000) + add-ons ($X)"*. Admin can still override.
- **Intake detail view**: shows the ledger (paid / difference / add-ons / proposed balance) so the admin never does mental math.
- On proposal sent → client gets the existing proposal email + a portal notification badge (pattern already built for orders).

### 1.7 Data model
`IntakeRecord` gains:

```ts
scopeShift?: {
  direction: "upgrade" | "downgrade" | "lateral" | "custom-quote";
  paidPackage: string; requiredPackage: string;
  paidBase: number; requiredBase: number; difference: number;
  acknowledgedAt: string;   // client saw the notice (required to submit)
}
```

Submission is blocked until the client ticks *"I understand the scope change and that the difference will be proposed before work begins"* — this is the contractual cover replacing today's silent gap.

---

## 2. Zero-repeat intake — progressive profiling (2026 best practice)

**Principle: every fact has exactly one home; the system confirms instead of re-asking.**

### 2.1 Prefill priority chain (per field)
```
existing draft answer  →  order details (checkout)  →  saved client profile  →  auth user
```
Implement as `resolveIntakePrefill(order, profile, user)` in `intake.ts`, mapping:

`company→business_name · name→contact_name · email→email · phone→phone · website→existing_website · industry→industry · audience→target_audience · goals→primary_goal · deadline→timeline · colors→brand_colors · style→style_direction`

`Client.tsx` passes the full order record + profile into the wizard (today: only name/email).

### 2.2 "Confirmed, not re-asked" UI
Prefilled fields render as a compact **confirmed row** — label, value, "Edit" link — instead of an empty required input. The wizard opens with a line:
> We already have your business details, goals and style preferences from your order — confirm or adjust, then tell us the rest.
Required-and-prefilled fields don't block progression; edited values flow back to the saved profile (one home, kept fresh).

### 2.3 Slim the checkout
Checkout's job is payment, not interrogation. Reduce the checkout details form to **name, email, phone, company + file upload**; retire audience / goals / deadline / colors / style from checkout — the intake (post-purchase, when motivation is highest) owns the deep brief, now with per-package conditional logic. Net effect: checkout gets faster (higher conversion), intake gets shorter (prefilled), and nothing is asked twice.

### 2.4 One add-on catalog
Migrate `INTAKE_ADDONS` into `website-addons.ts` (single ids, single prices, single eligibility rules). The intake add-on step:
- shows add-ons **already purchased in the order** as "In your order ✓" (no re-sale, no double-billing);
- offers only remaining eligible add-ons, at the same prices the configurator showed;
- writes selections back as the same add-on ids the proposal/order system understands.
**Pricing reconciliation decision needed from owner** (see §5) — e.g. WhatsApp $100 vs $250, Booking $250 vs $1,200.

### 2.5 Asset continuity
Files uploaded at checkout are listed in the intake's upload step as "Already received ✓" (from the order record). Intake uploads append to the same order-linked asset list. One project, one file drawer.

### 2.6 Keep what already works
Deterministic one-brief-per-(package, order, person) ids, debounced autosave, resume-where-you-left-off, guest→account claiming, read-only signed briefs — all preserved.

---

## 3. Files touched (estimated)

| File | Change |
|---|---|
| `src/lib/website-addons.ts` | Tier map; absorb intake add-on catalog; `detectScopeShift()` |
| `src/lib/intake.ts` | Prefill resolver; scopeShift on record; estimate ledger; contract text itemisation; remove duplicate catalog |
| `src/components/IntakeWizard.tsx` | Scope-shift card + acknowledgement gate; confirmed-row fields; ledger estimate step; order-aware add-on step |
| `src/pages/Client.tsx` | Pass order + profile into wizard |
| `src/pages/Checkout.tsx` | Slim details form |
| `src/pages/Admin.tsx` | Scope-shift badges; proposal default = difference + add-ons; ledger in detail view |
| `src/lib/email.ts` | Scope-shift line in intake-received + proposal emails |
| `scripts/qa-intake.mjs` | New checks (see §4) |

---

## 4. Phases & QA

**Phase 1 — Scope-shift engine** (detection, wizard card + acknowledgement, ledger estimate, contract itemisation, admin badge + proposal default, email line)
**Phase 2 — Prefill chain + confirmed rows** (order/profile → wizard, write-back to profile)
**Phase 3 — Catalog unification + order-aware add-on step + asset continuity**
**Phase 4 — Slim checkout** (retire duplicated fields; conversion-safe)

New `qa:intake` checks (added to the existing 33):
- paid landing-page + choose Corporate Website → scope-shift card appears, difference = $1,000, submission blocked until acknowledged
- estimate ledger shows paid / difference / balance correctly
- admin proposal default = difference + add-ons
- wizard prefills company/industry/goals/colors from order details — fields render confirmed, not empty
- add-on purchased at checkout shows "In your order ✓" and cannot be double-added
- downgrade path flags review, never reprices client-side
- full regression: qa:customer (30), qa:studio (17), qa:webconfig (47), tsc, build

---

## 5. Decisions needed from the owner
1. **Tier map** — agree Corporate Website bills at the Standard Business Website tier ($2,500)? Or should Corporate be its own priced tier?
2. **Add-on price reconciliation** — one price per feature; which catalog wins (e.g. WhatsApp $100 or $250)? Recommend: keep configurator prices (they're the public, published ones) and re-scope the intake's premium items as larger packages (e.g. "Booking with deposits & automations" $1,200 stays a distinct premium item).
3. **Slim checkout** — confirm retiring audience/goals/deadline/colors/style from checkout now that intake owns the brief.
4. **Downgrade policy** — credit toward add-ons (recommended), refund, or case-by-case?
