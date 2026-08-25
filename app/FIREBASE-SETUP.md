# Firebase setup — Social Kon10 Marketing

The site runs in **demo mode** until these keys are added (checkout simulates, nothing persists). To go live:

## 1. Create the Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project** (name e.g. `socialkon10`)
2. **Authentication** → Get started → enable **Email/Password** and **Google**
3. **Firestore Database** → Create database → Production mode → pick a region
4. **Storage** → Get started → Production mode

## 2. Register the web app

Project settings → **Your apps** → Web (`</>`) → copy the config values.

## 3. Configure the site

```bash
cp .env.example .env.local
```

Fill in every `VITE_FIREBASE_*` value. Set `VITE_ADMIN_EMAILS` to the email(s)
that should see the admin dashboard (comma-separated) — the same email(s) must
also be listed in `firestore.rules` and `storage.rules` (`isAdmin()`).

## 4. Deploy rules + hosting

```bash
npm install -g firebase-tools
firebase login
firebase use --add          # select your project
npm run build
firebase deploy             # hosting + firestore rules + storage rules
```

## What's wired

| Area | Where | Notes |
|---|---|---|
| Auth (email + Google) | `/client` | Admin = email in allowlist |
| Orders | Firestore `orders` | Created at checkout; status pipeline admin-editable |
| File uploads | Storage `orders/{id}/` | 25MB cap, type-constrained |
| Leads | Firestore `leads` | Start form (quote/consultation/question) |
| Quote → proposal | Admin → Leads → Convert | Creates a payable order; client accepts by paying deposit in `/client` |
| Project messaging | `orders/{id}/messages` | Client portal + admin Orders tab |
| Package CMS | Firestore `serviceOverrides` | Admin → Products tab; price/deposit/revisions/enabled |
| Portfolio CMS | Firestore `portfolio` | Admin → Portfolio tab; merges into `/work` |
| Promo codes | Firestore `promos` | Admin → Promos tab; active at checkout |
| Site settings | Firestore `settings/site` | Admin → Settings tab; contact + social links |
| Testimonials & FAQs | Firestore collections | Admin adds; merges with shipped defaults |
| Analytics | `VITE_GA_ID` / `VITE_META_PIXEL_ID` | Loaded only when set; all PRD §60 events fired |

## Data model

- `orders/{id}` — client info, items, totals, payMode, amountPaid, balanceDue, status, files, details
- `orders/{id}/messages/{mid}` — from (studio|client), text, author, createdAt
- `leads/{id}` — intent, dept, service, contact, message, status
- `serviceOverrides/{slug}` — price, depositPct, revisions, enabled
- `portfolio/{id}` — admin-added archive projects
- `promos/{id}` — code, type (pct|fixed), value, label
- `settings/site` — phone, email, location, socials[]
- `testimonials/{id}`, `faqs/{id}` — admin-added content

## 5. Email automation (PRD §65)

**Status: client-side wired — one manual step left to go live.**

The site now queues five transactional emails into a Firestore `mail`
collection (Trigger Email extension format) at these moments:

| Email | Trigger | Recipient |
| --- | --- | --- |
| Order confirmation | Checkout payment succeeds | Client |
| New-order alert | Checkout payment succeeds | Studio inbox |
| Brief received | Intake form signed & submitted | Client |
| New-intake alert (with lead score) | Intake form signed & submitted | Studio inbox |
| Proposal ready | Admin sends proposal from Intakes tab | Client |

Every queued email is also mirrored to a local audit log (`sk-email-log`,
last 100 entries) so sends can be inspected in the browser.

**To activate real delivery** (one-time, ~5 min):

```bash
firebase ext:install firebase/firestore-send-email --project=gen-lang-client-0882288265
```

When prompted, point it at the `mail` collection and supply SMTP credentials
(SendGrid / Postmark / Gmail workspace relay). The `mail` security rules
(write-only, never readable) are already deployed. Until the extension is
installed, emails are safely logged locally and nothing is lost silently.

## 6. Roles (PRD §64)

The rules implement ADMIN and CLIENT. Project-manager / designer / social /
web roles are an extension point: add their emails to a `roles/{uid}` doc,
check it in `isAdmin()`-style helpers, and scope the Orders tab by
`items[].dept`. The admin UI needs no changes to start using them.

## 7. Production checklist

- [ ] Replace the demo payment provider in `src/lib/payments.ts` with PayPal
      (server-side order creation; never put secrets in the frontend)
- [ ] **Payment recording** (`recordPayment`) must move to a PayPal webhook →
      Cloud Function. Firestore rules intentionally deny client writes to
      `amountPaid`/`balanceDue` so nobody can mark their own order paid.
- [ ] Deploy `firestore.rules` + `storage.rules`
- [ ] Add GA4 / Meta Pixel IDs to `.env.local` (they load automatically)
- [ ] Verify the domain in Google Search Console once deployed
- [ ] Point `socialkon10.com` at Firebase Hosting (or your host of choice)
