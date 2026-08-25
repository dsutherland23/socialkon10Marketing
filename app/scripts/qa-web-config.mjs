/**
 * KON10 — POWER UP YOUR WEBSITE configurator audit (PRD v1.0.0).
 * Drives the Web + Digital pricing page end-to-end:
 *   pricing cards (base prices preserved) → configurator opens →
 *   category browsing + progressive disclosure → add-on selection →
 *   PRD example total ($2,100) → dependencies → conflicts →
 *   quantities → eligibility gates → monthly separation →
 *   selection persistence → Start Your Project → checkout payload.
 *
 * Usage:  npm run qa:webconfig
 * Exits non-zero if any check fails. Spawns and kills its own dev server.
 */
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const PORT = 5195;
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
const nap = (ms) => new Promise(r => setTimeout(r, ms));
const DLG = '[role="dialog"][aria-modal="true"]';
/** click a category pill inside the configurator */
const clickCat = (page, id) => page.evaluate((cid) => {
  const b = document.querySelector('[role="dialog"][aria-modal="true"] [data-cat="' + cid + '"]');
  if (b) { b.click(); return true; } return false;
}, id);
/** toggle an add-on via its test hook */
const clickAddon = (page, id) => page.evaluate((aid) => {
  const b = document.querySelector('[role="dialog"][aria-modal="true"] [data-addon-toggle="' + aid + '"]');
  if (b) { b.click(); return true; } return false;
}, id);
const clickQty = (page, id, times = 1) => page.evaluate((aid, n) => {
  const b = document.querySelector('[role="dialog"][aria-modal="true"] [data-qty-inc="' + aid + '"]');
  if (!b) return false;
  for (let i = 0; i < n; i++) b.click();
  return true;
}, id, times);
const clickDlg = (page, re) => page.evaluate((src) => {
  const rx = new RegExp(src, 'i');
  const dlg = document.querySelector('[role="dialog"][aria-modal="true"]');
  if (!dlg) return false;
  const b = [...dlg.querySelectorAll('button')].find(x => rx.test(x.textContent.trim()) && !x.disabled);
  if (b) { b.click(); return true; }
  return false;
}, re.source);
const dlgText = (page) => page.evaluate(() =>
  (document.querySelector('[role="dialog"][aria-modal="true"]')?.innerText ?? '').replace(/\s+/g, ' '));
const projectTotal = (page) => page.evaluate(() => document.querySelector('[data-project-total]')?.textContent ?? '');
const monthlyTotal = (page) => page.evaluate(() => document.querySelector('[data-monthly-total]')?.textContent ?? '');

let browser;
try {
  await waitServer();
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 950 });
  page.on('pageerror', e => pageErrors.push(e.message));
  // pin USD — the live site auto-detects currency from timezone (JMD in Jamaica)
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('sk-currency', 'USD');
    sessionStorage.clear();
  });

  /* ---------------- PRICING CARDS: existing prices preserved ---------------- */
  console.log('\npricing cards — base prices untouched');
  await page.goto(`${BASE}/website-design-development`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await nap(1800);
  let text = await bodyText(page);
  ok('Landing Page remains $1,500', /\$1,500/.test(text));
  ok('Standard Business Website remains $2,500 (CMS override)', /\$2,500/.test(text));
  ok('E-Commerce Website remains from $3,500 (CMS override)', /from \$3,500/i.test(text) || /\$3,500/.test(text));
  ok('Website Care Plan remains $250/mo', /\$250\/mo/.test(text));
  ok('package codes shown on cards', /SK-WEB-01/.test(text) && /SK-WEB-03/.test(text));
  ok('Customize This Package CTA present', /Customize This Package/i.test(text));
  ok('View details secondary action preserved', /View details/i.test(text));

  /* ---------------- CONFIGURATOR OPENS ---------------- */
  console.log('\nconfigurator — open + categories');
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /Customize This Package/i.test(x.textContent));
    b?.click();
  });
  await nap(900);
  text = await dlgText(page);
  ok('configurator opens as accessible dialog', /Power Up Your Website/i.test(text));
  ok('base package + price in header', /Landing Page \/ One-Page Website — \$1,500 base/i.test(text));
  ok('default categories visible', /Website Expansion/i.test(text) && /Lead Generation/i.test(text) && /Performance/i.test(text));
  ok('progressive disclosure: advanced hidden first', !/AI & Intelligent Features/i.test(text));
  ok('empty-state guidance in summary', /Make your website work harder/i.test(text));

  /* ---------------- PRD EXAMPLE: $2,100 total ---------------- */
  console.log('\npricing engine — PRD example (booking + whatsapp + speed = $2,100)');
  ok('switch to lead generation', await clickCat(page, 'lead_generation')); await nap(400);
  ok('booking system selected', await clickAddon(page, 'booking_system')); await nap(300);
  ok('switch to communication', await clickCat(page, 'communication')); await nap(400);
  ok('whatsapp integration selected', await clickAddon(page, 'whatsapp_integration')); await nap(300);
  ok('switch to performance', await clickCat(page, 'performance')); await nap(400);
  ok('speed boost selected', await clickAddon(page, 'speed_boost')); await nap(400);
  ok('project total = $2,100 (PRD example)', (await projectTotal(page)) === '$2,100', await projectTotal(page));
  text = await dlgText(page);
  ok('popular badge visible', /MOST POPULAR/.test(text));

  /* ---------------- CONFLICTS ---------------- */
  console.log('\nconflicts — analytics pack replaces individuals');
  ok('switch to analytics', await clickCat(page, 'analytics_tracking')); await nap(400);
  await clickAddon(page, 'analytics_setup'); await nap(250);
  await clickAddon(page, 'search_console'); await nap(250);
  await clickAddon(page, 'marketing_analytics_pack'); await nap(400);
  text = await dlgText(page);
  const summary = text.slice(text.toUpperCase().indexOf('/YOUR-WEBSITE'));
  ok('pack replaces GA4 + GSC in summary', !/Google Analytics 4 \$/i.test(summary) && !/Google Search Console \$/i.test(summary));
  ok('pack line present in summary', /Marketing Analytics Pack \$300/i.test(summary));
  ok('total after conflict resolution = $2,400', (await projectTotal(page)) === '$2,400', await projectTotal(page));

  /* ---------------- QUANTITIES ---------------- */
  console.log('\nquantities — standard page ×3');
  ok('switch to expansion', await clickCat(page, 'website_expansion')); await nap(400);
  await clickAddon(page, 'additional_standard_page'); await nap(300);
  ok('quantity stepper works', await clickQty(page, 'additional_standard_page', 1)); await nap(400);
  await clickQty(page, 'additional_standard_page', 1); await nap(400); // separate renders, like real clicks
  text = await dlgText(page);
  ok('quantity shows ×3', /×3/i.test(text));
  ok('line total reflects qty ($450)', /Additional Standard Page ×3 \$450/i.test(text));

  /* ---------------- ELIGIBILITY ---------------- */
  console.log('\neligibility — landing page gates standard-up features');
  text = await dlgText(page);
  ok('blog system shows upgrade message (not Add)', /This feature is available with a Standard Business Website or higher/i.test(text));

  /* ---------------- MONTHLY SEPARATION ---------------- */
  console.log('\nmonthly separation — recurring never mixed');
  ok('switch to seo', await clickCat(page, 'seo_visibility')); await nap(400);
  await clickAddon(page, 'seo_growth_management'); await nap(400);
  const pTotal = await projectTotal(page);
  const mTotal = await monthlyTotal(page);
  ok('monthly services shown separately ($300/mo)', mTotal === '$300/mo', mTotal);
  ok('monthly NOT added to project total ($2,850)', pTotal === '$2,850', pTotal);

  /* ---------------- PERSISTENCE ---------------- */
  console.log('\npersistence — selections survive close/reopen');
  await page.keyboard.press('Escape'); await nap(500);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /Customize This Package/i.test(x.textContent));
    b?.click();
  });
  await nap(700);
  text = await dlgText(page);
  ok('selections persisted after close/reopen', /Additional Standard Page ×3/i.test(text));

  /* ---------------- PROGRESSIVE DISCLOSURE ---------------- */
  console.log('\nprogressive disclosure — advanced categories');
  await clickDlg(page, /More ways to power up/); await nap(400);
  text = await dlgText(page);
  ok('advanced categories revealed', /AI & Intelligent Features/i.test(text) && /Security/i.test(text));

  /* ---------------- START YOUR PROJECT → CHECKOUT ---------------- */
  console.log('\ncheckout integration — existing flow unchanged');
  await clickDlg(page, /Start Your Project/); await nap(1500);
  ok('navigated to checkout', page.url().includes('/checkout'), page.url());
  const cart = await page.evaluate(() => JSON.parse(localStorage.getItem('sk-cart') || '[]'));
  const baseLine = cart.find(i => i.serviceSlug === 'landing-page');
  ok('base package in cart at $1,500', baseLine?.unitPrice === 1500, JSON.stringify(baseLine?.unitPrice));
  ok('one-time add-ons flattened onto the package line', Array.isArray(baseLine?.addons) && baseLine.addons.length >= 3, `${baseLine?.addons?.length} addons`);
  ok('quantity preserved in add-on name', baseLine?.addons.some(a => /×3/.test(a.name) && a.price === 450));
  ok('monthly service is a separate recurring cart line', cart.some(i => i.billing === 'monthly' && i.unitPrice === 300));
  ok('conflict winner is the only analytics line', baseLine?.addons.some(a => a.name === 'Marketing Analytics Pack') && !baseLine?.addons.some(a => a.name === 'Google Analytics 4'));
  text = await bodyText(page);
  ok('checkout renders the configured order', /Landing Page/i.test(text));

  /* ---------------- DEPENDENCY AUTO-ADD / CASCADE REMOVE ---------------- */
  console.log('\ndependencies — SK-WEB-02 whatsapp automation requires integration');
  await page.goto(`${BASE}/website-design-development`, { waitUntil: 'domcontentloaded' }); await nap(1800);
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].filter(x => /Customize This Package/i.test(x.textContent));
    btns[1]?.click();
  });
  await nap(800);
  ok('switch to communication', await clickCat(page, 'communication')); await nap(300);
  ok('select whatsapp automation', await clickAddon(page, 'whatsapp_automation')); await nap(400);
  let depTotal = await projectTotal(page);
  ok('dependency auto-added ($2,500 + $100 + $350 = $2,950)', depTotal === '$2,950', depTotal);
  ok('deselect required integration', await clickAddon(page, 'whatsapp_integration')); await nap(400);
  depTotal = await projectTotal(page);
  ok('cascade removed dependent ($2,500)', depTotal === '$2,500', depTotal);

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
