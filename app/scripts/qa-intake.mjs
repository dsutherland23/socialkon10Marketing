/**
 * KON10 — WEBSITE INTAKE & ACCOUNT-DETAILS audit.
 * Drives the full guest journey end-to-end:
 *   cart (business website) → checkout → payment → intake brief pops →
 *   conditional questions → design (colours) → add-ons (live estimate) →
 *   review & e-sign → submitted brief.
 *
 * Usage:  npm run qa:intake
 * Exits non-zero if any check fails. Spawns and kills its own dev server.
 */
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const PORT = 5196;
const BASE = `http://localhost:${PORT}`;
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let passed = 0, failed = 0;
const pageErrors = [];
function ok(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} ${detail}`); }
}

async function waitServer(tries = 40) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) return; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('dev server never came up');
}

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
process.on('exit', () => { try { server.kill('SIGKILL'); } catch { /* already dead */ } });

const bodyText = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
const clickBtn = (page, re) => page.evaluate((src) => {
  const rx = new RegExp(src, 'i');
  const b = [...document.querySelectorAll('button')].find(x => rx.test(x.textContent.trim()) && !x.disabled);
  if (b) { b.click(); return true; }
  return false;
}, re.source);
/** click inside the intake dialog only (avoids buttons behind the modal) */
const clickDlg = (page, re) => page.evaluate((src) => {
  const rx = new RegExp(src, 'i');
  const dlg = document.querySelector('[role="dialog"]');
  if (!dlg) return false;
  const b = [...dlg.querySelectorAll('button')].find(x => rx.test(x.textContent.trim()) && !x.disabled);
  if (b) { b.click(); return true; }
  return false;
}, re.source);
/** click a selection card by its exact label span */
const clickCard = (page, label) => page.evaluate((lbl) => {
  const dlg = document.querySelector('[role="dialog"]') ?? document;
  const b = [...dlg.querySelectorAll('button')].find(x =>
    [...x.querySelectorAll('span')].some(s => s.textContent.trim() === lbl) && !x.disabled);
  if (b) { b.click(); return true; }
  return false;
}, label);
const nap = (ms) => new Promise(r => setTimeout(r, ms));

let browser;
try {
  await waitServer();
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 950 });
  page.on('pageerror', e => pageErrors.push(e.message));

  // seed the cart: LANDING PAGE ($1,500) + one configurator add-on (to prove
  // the brief never double-bills purchased add-ons) before any app code runs.
  // The brief then chooses E-commerce ($3,500 live) → scope shift, $2,000 difference.
  await page.evaluateOnNewDocument(() => {
    const item = {
      key: 'landing-page--qa', serviceSlug: 'landing-page',
      name: 'Landing Page / One-Page Website', unitPrice: 1500,
      addons: [{ name: 'SEO Growth', price: 350 }], rush: false, billing: 'one_time', depositPct: 50,
    };
    localStorage.setItem('sk-cart', JSON.stringify([item]));
    localStorage.setItem('sk-currency', 'USD');
  });

  /* ---------------- CHECKOUT ---------------- */
  console.log('\ncheckout → payment');
  await page.goto(`${BASE}/checkout`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await nap(5000);
  let text = await bodyText(page);
  ok('cart summary shows the website package', /Landing Page/i.test(text));

  await clickBtn(page, /Your details/i);
  await nap(800);
  await page.type('#f-name', 'QA Client');
  await page.type('#f-email', 'qa.client@example.com');
  // slim checkout (2026): deep-brief questions live in the intake, not the payment page
  const slim = await page.evaluate(() => !document.querySelector('#f-goals') && !document.querySelector('#f-audience') && !document.querySelector('#f-colors'));
  ok('checkout is slim — goals/audience/colours moved to the post-payment brief', slim);
  let stepText = await bodyText(page);
  ok('brief-after-payment note sets expectations', /brief opens right after payment/i.test(stepText));
  await clickBtn(page, /Files/i);
  await nap(800);
  text = await bodyText(page);
  ok('files step reached after valid details', /Drop files or browse/i.test(text));

  // upload a file at checkout — the brief must show it as already received
  const fileInput = await page.$('input[type="file"]');
  if (fileInput) await fileInput.uploadFile(new URL('./qa-fixture.svg', import.meta.url).pathname);
  await nap(700);
  text = await bodyText(page);
  ok('checkout accepts the uploaded file', /qa-fixture\.svg/i.test(text));

  await clickBtn(page, /Payment/i);
  await nap(800);
  text = await bodyText(page);
  ok('payment step reached', /Pay with Demo gateway/i.test(text));

  await clickBtn(page, /Pay with Demo gateway/i);
  await page.waitForFunction(() => /Order confirmed/i.test(document.body.innerText), { timeout: 45000 });
  ok('order confirmed after demo payment', true);

  // transactional emails — order confirmation (client) + new-order alert (studio)
  await nap(1200);
  let emailLog = await page.evaluate(() => JSON.parse(localStorage.getItem('sk-email-log') || '[]'));
  ok('order confirmation email queued to client', emailLog.some(e => e.type === 'order_confirmation' && e.to === 'qa.client@example.com'), JSON.stringify(emailLog.map(e => e.type)));
  ok('new-order alert email queued to studio', emailLog.some(e => e.type === 'admin_new_order'));

  /* ---------------- INTAKE: auto-popup ---------------- */
  console.log('\nintake brief — popup + business step');
  await nap(1500);
  text = await bodyText(page);
  ok('intake brief pops automatically after website purchase', /project-brief/i.test(text) && /Tell us about your business/i.test(text));

  // prefilled from checkout details (2026: never retype)
  const prefill = await page.evaluate(() => ({
    name: document.querySelector('#in-contact_name')?.value ?? '',
    email: document.querySelector('#in-email')?.value ?? '',
  }));
  ok('contact name prefilled from checkout', prefill.name === 'QA Client', JSON.stringify(prefill));
  ok('email prefilled from checkout', prefill.email === 'qa.client@example.com');
  ok('zero-repeat banner shown (confirm, don\'t retype)', await page.evaluate(() => !!document.querySelector('[data-prefill-banner]')));

  // required-field guard: empty business fields block Continue
  await clickDlg(page, /^Continue/i);
  await nap(600);
  text = await bodyText(page);
  ok('validation blocks Continue with missing required answers', /Tell us about your business/i.test(text) && /Required/i.test(text));

  await page.type('#in-business_name', 'QA Test Bistro');
  await page.select('#in-industry', 'Food & Hospitality');
  await page.type('#in-business_description', 'A test restaurant business for the intake audit.');
  await clickDlg(page, /^Continue/i);
  await nap(1000);

  /* ---------------- PROJECT STEP + CONDITIONALS ---------------- */
  console.log('\nproject step — conditional questions');
  text = await bodyText(page);
  ok('project step reached', /#1 thing visitors should do/i.test(text));

  // pick E-commerce → conditional questions must appear
  await clickCard(page, 'E-commerce');
  await nap(500);
  const condVisible = await page.evaluate(() => !!document.querySelector('#in-product_count'));
  ok('e-commerce conditional questions appear (product count)', condVisible);

  // scope-shift: paid Landing Page ($1,500) → chose E-commerce ($3,500 live)
  const shiftDir = await page.evaluate(() => document.querySelector('[data-scope-shift]')?.getAttribute('data-scope-shift') ?? null);
  ok('scope-shift card appears the moment a higher tier is chosen', shiftDir === 'upgrade', String(shiftDir));
  text = await bodyText(page);
  ok('shift card states the $2,000 difference, credited payment, nothing charged now',
    /2,000/.test(text) && /Nothing is charged now/i.test(text) && /credited in full/i.test(text));

  await clickCard(page, 'Sell online');
  await page.type('#in-visitor_action', 'Buy a meal combo.');
  await page.type('#in-target_audience', 'Hungry locals, 18-45.');
  await page.select('#in-product_count', 'Under 20');
  await page.select('#in-timeline', '2–4 weeks');
  await page.select('#in-budget', '$5,000 – $10,000');
  await clickDlg(page, /^Continue/i);
  await nap(1000);

  /* ---------------- DESIGN STEP ---------------- */
  console.log('\ndesign step — style, colours');
  text = await bodyText(page);
  ok('design step reached', /Which direction feels right/i.test(text));
  ok('colour scheme picker present', /Colour scheme/i.test(text));
  ok('file upload zones present', /Logo & brand assets/i.test(text) && /Photos & content/i.test(text));
  ok('checkout file shown as already received (no re-upload)', await page.evaluate(() =>
    /qa-fixture\.svg/i.test(document.querySelector('[data-order-files]')?.textContent ?? '')));

  await clickCard(page, 'Clean & minimal');
  await page.select('#in-logo_status', 'Yes — ready to upload');
  await page.select('#in-content_ready', 'Partially ready');
  // add a colour via the + ADD swatch
  await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    const b = [...dlg.querySelectorAll('button')].find(x => x.textContent.trim() === '+ ADD');
    b?.click();
  });
  await nap(400);
  const colorWell = await page.evaluate(() => !!document.querySelector('[role="dialog"] input[type="color"]'));
  ok('colour well added to scheme', colorWell);
  await clickDlg(page, /^Continue/i);
  await nap(1000);

  /* ---------------- ADD-ONS (revenue step) ---------------- */
  console.log('\nadd-ons — live estimate');
  text = await bodyText(page);
  ok('add-ons step reached', /Power it up/i.test(text));
  ok('recommended picks flagged', /Recommended/i.test(text));
  ok('ledger shows what was paid with the order ($1,850)', /1,850/.test(text));
  ok('ledger shows the scope-upgrade difference (+$2,000)', await page.evaluate(() =>
    /2,000/.test(document.querySelector('[data-ledger-difference]')?.textContent ?? '')));

  // purchased at checkout → covered in the brief, never double-billed
  const coveredSeo = await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    const b = [...dlg.querySelectorAll('button')].find(x => /Advanced SEO Setup/i.test(x.textContent));
    return b ? { disabled: b.disabled, badge: /In your order/i.test(b.textContent) } : null;
  });
  ok('purchased SEO add-on shows "In your order ✓" and cannot be re-selected', coveredSeo?.disabled === true && coveredSeo?.badge === true, JSON.stringify(coveredSeo));

  await clickCard(page, 'WhatsApp Chat Integration');
  await nap(500);
  const bal = await page.evaluate(() => document.querySelector('[data-ledger-balance]')?.textContent ?? '');
  ok('ledger balance = difference + new add-on ($2,000 + $100 = $2,100)', /2,100/.test(bal), bal);

  // monthly recurring toggle
  await clickCard(page, 'Website Care Plan');
  await nap(500);
  text = await bodyText(page);
  ok('recurring service adds monthly estimate ($250/mo)', /250\/mo/i.test(text));

  await clickDlg(page, /Review & sign/i);
  await nap(1000);

  /* ---------------- REVIEW & SIGN ---------------- */
  console.log('\nreview & sign — the agreement');
  text = await bodyText(page);
  ok('review step scope describes the REQUIRED package (e-commerce)', /Included — E-Commerce Website/i.test(text) && /Not included/i.test(text));
  ok('agreement text present with version', /PROJECT AGREEMENT/i.test(text) && /SK-WEB-AGREEMENT-2026\.1/i.test(text));
  ok('selected add-on appears in scope', /WhatsApp Chat Integration/i.test(text));
  ok('contract itemises the payment position (paid / difference / balance)', /PAID TO DATE/i.test(text) && /Scope upgrade/i.test(text) && /balance due/i.test(text));
  ok('review ledger shows the estimated balance ($2,100)', await page.evaluate(() =>
    /2,100/.test(document.querySelector('[data-review-balance]')?.textContent ?? '')));

  // submit gated until checkbox + signature
  let submitDisabled = await page.evaluate(() => {
    const b = [...document.querySelectorAll('[role="dialog"] button')].find(x => /Sign & submit brief/i.test(x.textContent));
    return b ? b.disabled : null;
  });
  ok('submit blocked until agreement ticked + signed', submitDisabled === true, String(submitDisabled));

  // agreement + signature alone are NOT enough when a scope shift needs acknowledging
  await page.evaluate(() => {
    const cb = [...document.querySelectorAll('[role="dialog"] input[type="checkbox"]')].pop();
    cb?.click();
  });
  await page.type('#in-signature', 'QA Client');
  await nap(400);
  submitDisabled = await page.evaluate(() => {
    const b = [...document.querySelectorAll('[role="dialog"] button')].find(x => /Sign & submit brief/i.test(x.textContent));
    return b ? b.disabled : null;
  });
  ok('submit STILL blocked until the scope shift is acknowledged', submitDisabled === true, String(submitDisabled));

  await page.evaluate(() => { document.querySelector('[data-shift-ack] input[type="checkbox"]')?.click(); });
  await nap(400);
  submitDisabled = await page.evaluate(() => {
    const b = [...document.querySelectorAll('[role="dialog"] button')].find(x => /Sign & submit brief/i.test(x.textContent));
    return b ? b.disabled : null;
  });
  ok('submit enabled after shift ack + agreement + signature', submitDisabled === false, String(submitDisabled));

  await clickDlg(page, /Sign & submit brief/i);
  await page.waitForFunction(() => /Brief received/i.test(document.body.innerText), { timeout: 30000 });
  ok('brief submitted — agreement signed confirmation shown', true);
  text = await bodyText(page);
  ok('next steps explained to the client', /final proposal/i.test(text) || /next steps/i.test(text));

  // transactional emails — brief received (client) + new-intake alert (studio)
  await nap(1200);
  emailLog = await page.evaluate(() => JSON.parse(localStorage.getItem('sk-email-log') || '[]'));
  ok('brief-received email queued to client', emailLog.some(e => e.type === 'intake_received' && e.to === 'qa.client@example.com'), JSON.stringify(emailLog.map(e => e.type)));
  ok('new-intake alert email queued to studio', emailLog.some(e => e.type === 'admin_intake'));

  // one-brief-per-order: a single stable record, submitted, linked to the order
  const intakes = await page.evaluate(() => JSON.parse(localStorage.getItem('sk-demo-intakes') || '[]'));
  ok('exactly one brief record exists (no duplicates)', intakes.length === 1, `${intakes.length} records`);
  ok('brief uses stable dedupe id + submitted status', intakes[0]?.id?.startsWith('web-') && intakes[0]?.status === 'submitted', JSON.stringify({ id: intakes[0]?.id, status: intakes[0]?.status }));

  // the scope shift is on the signed record — direction, difference, client acknowledgment
  const ss = intakes[0]?.scopeShift;
  ok('scope shift recorded on the signed brief (upgrade · $3,000 · acknowledged)',
    ss?.direction === 'upgrade' && ss?.difference === 3000 && !!ss?.acknowledgedAt, JSON.stringify(ss));
  ok('studio alert email flags the scope shift', emailLog.some(e => e.type === 'admin_intake' && /SCOPE SHIFT/i.test(e.subject ?? '')), JSON.stringify(emailLog.filter(e => e.type === 'admin_intake').map(e => e.subject)));

  /* ---------------- WRAP ---------------- */
  console.log('\npage errors');
  const fatal = pageErrors.filter(e => !/favicon|net::|Firebase|firestore|permissions|auth\//i.test(e));
  ok('no uncaught page errors', fatal.length === 0, fatal.slice(0, 3).join(' | '));

} catch (err) {
  failed++;
  console.error('\nFATAL:', err?.message ?? err);
} finally {
  try { await browser?.close(); } catch { /* already closed */ }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
