/**
 * SocialKon10 — DUAL-MODE CHECKOUT regression suite (Order Request mode).
 * Boots a dev server with Firebase DISABLED (demo mode), walks the full
 * guest checkout, and verifies:
 *   1. Review step shows "Submit Order Request" (never "Pay Now")
 *   2. Terms agreement is enforced
 *   3. Submission saves an UNPAID order_request order with a SK10- reference
 *   4. Confirmation shows the required headline + reference + no-payment note
 *   5. No payment provider button is rendered in ORDER_REQUEST mode
 *   6. Mobile (390px) checkout renders without horizontal overflow
 *
 * Usage:  npm run qa:checkout
 * Exits non-zero if any check fails. Spawns and kills its own dev server.
 */
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const PORT = 5199;
const BASE = `http://localhost:${PORT}`;
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let passed = 0, failed = 0;
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

// Firebase explicitly disabled → demo mode, nothing touches production data.
const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
  detached: true, // own process group so the whole tree can be killed
  env: {
    ...process.env,
    VITE_FIREBASE_API_KEY: '', VITE_FIREBASE_AUTH_DOMAIN: '', VITE_FIREBASE_PROJECT_ID: '',
    VITE_FIREBASE_STORAGE_BUCKET: '', VITE_FIREBASE_MESSAGING_SENDER_ID: '', VITE_FIREBASE_APP_ID: '',
  },
});
const killServer = () => { try { process.kill(-server.pid, 'SIGKILL'); } catch { try { server.kill('SIGKILL'); } catch { /* already dead */ } } };
process.on('exit', killServer);

let browser;
try {
  await waitServer();
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--window-size=1440,900'],
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  // Seed a cart with one fixed-price service before the app boots.
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('sk-cart', JSON.stringify([{
      key: 'logo-design--1',
      serviceSlug: 'logo-design',
      name: 'Logo Design',
      unitPrice: 450,
      addons: [],
      rush: false,
      billing: 'one_time',
      depositPct: 50,
    }]));
    localStorage.setItem('sk-currency', 'USD');
  });

  console.log('\n[1] Checkout — order review step');
  await page.goto(`${BASE}/checkout`, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForSelector('h1', { timeout: 15000 });
  const h1 = await page.$eval('h1', (el) => el.textContent);
  ok('checkout page renders', /checkout/i.test(h1 ?? ''));
  const hasItem = await page.evaluate(() => document.body.innerText.includes('Logo Design'));
  ok('seeded cart item is listed', hasItem);

  // Step → Details
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    btns.find((b) => /your details/i.test(b.textContent ?? ''))?.click();
  });
  await new Promise(r => setTimeout(r, 400));
  await page.type('#f-name', 'QA Tester');
  await page.type('#f-email', 'qa@example.com');
  await page.type('#f-phone', '+1 876 555 0100');
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => /files/i.test(b.textContent ?? ''))?.click();
  });
  await new Promise(r => setTimeout(r, 400));

  // Step → Review
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => /review|payment/i.test(b.textContent ?? ''))?.click();
  });
  await new Promise(r => setTimeout(r, 600));

  console.log('\n[2] Review step — order-request mode');
  const reviewText = await page.evaluate(() => document.body.innerText);
  ok('shows "Submit Order Request"', /submit order request/i.test(reviewText));
  ok('never shows "Pay Now"', !/pay now/i.test(reviewText));
  ok('states no payment is collected', /no payment (is )?collected/i.test(reviewText) || /no payment is taken/i.test(reviewText));
  const providerButtons = await page.evaluate(() =>
    [...document.querySelectorAll('button')].filter((b) => /pay with/i.test(b.textContent ?? '')).length
  );
  ok('no payment-provider button rendered in ORDER_REQUEST mode', providerButtons === 0, `found ${providerButtons}`);

  // Submit is disabled until terms are accepted
  const disabledBefore = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /submit order request/i.test(x.textContent ?? ''));
    return b?.disabled ?? null;
  });
  ok('submit disabled until terms accepted', disabledBefore === true);

  await page.evaluate(() => {
    const cb = document.querySelector('input[type="checkbox"]:not([disabled])');
    // find the terms checkbox (last checkbox on the review panel)
    const boxes = [...document.querySelectorAll('input[type="checkbox"]')];
    (boxes[boxes.length - 1] ?? cb)?.click();
  });
  await new Promise(r => setTimeout(r, 300));

  console.log('\n[3] Submit order request');
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => /submit order request/i.test(b.textContent ?? ''))?.click();
  });
  await new Promise(r => setTimeout(r, 2500));

  const confText = await page.evaluate(() => document.body.innerText);
  ok('confirmation headline shown', /your order request has been received!/i.test(confText));
  const refMatch = confText.match(/SK10-\d{6}-[A-Z0-9]{5}/);
  ok('unique SK10- reference displayed', !!refMatch, refMatch?.[0] ?? 'none found');
  ok('confirms no payment collected', /no payment has been collected/i.test(confText));
  ok('next-step instructions present', /reviews your request/i.test(confText));

  console.log('\n[4] Order persisted (demo IndexedDB/localStorage)');
  const saved = await page.evaluate(async () => {
    const raw = localStorage.getItem('sk-demo-orders');
    if (raw) return JSON.parse(raw);
    // IndexedDB mirror
    return await new Promise((resolve) => {
      const req = indexedDB.open('sk_local_files_db', 2);
      req.onsuccess = () => {
        try {
          const tx = req.result.transaction('data', 'readonly');
          const g = tx.objectStore('data').get('sk-demo-orders');
          g.onsuccess = () => resolve(g.result ?? []);
          g.onerror = () => resolve([]);
        } catch { resolve([]); }
      };
      req.onerror = () => resolve([]);
    });
  });
  const order = Array.isArray(saved) ? saved[0] : null;
  ok('order saved', !!order);
  ok('order is UNPAID', order?.paymentStatus === 'UNPAID', `got ${order?.paymentStatus}`);
  ok('checkoutMethod = order_request', order?.checkoutMethod === 'order_request');
  ok('amountPaid is zero', (order?.amountPaid ?? -1) === 0);
  ok('balanceDue equals total', order?.balanceDue === order?.total);
  ok('reference stored on order', /^SK10-\d{6}-[A-Z0-9]{5}$/.test(order?.reference ?? ''), order?.reference);
  ok('status history recorded', Array.isArray(order?.statusHistory) && order.statusHistory.length >= 1);
  ok('immutable item snapshot stored', Array.isArray(order?.items) && order.items.length === 1 && order.items[0].name === 'Logo Design');

  console.log('\n[5] Mobile viewport (390×844)');
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(`${BASE}/checkout`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 800));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  ok('no horizontal overflow at 390px', !overflow);
  await page.screenshot({ path: 'qa/checkout-mobile-390.png' });
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${BASE}/checkout`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: 'qa/checkout-desktop-1440.png' });
  ok('screenshots captured', true);

  ok('no uncaught page errors', pageErrors.length === 0, pageErrors[0] ?? '');
} catch (err) {
  failed++;
  console.error('\nSUITE ERROR:', err);
} finally {
  if (browser) await browser.close();
  killServer()
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
