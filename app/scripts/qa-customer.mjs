/**
 * KON10 Studio — CUSTOMER (non-author) editor regression suite.
 * Boots the customer editor on the free "instagram-carousel-coach" template
 * and verifies the permission model end-to-end: locked layers stay locked,
 * non-deletable layers refuse Delete, style/permission UI is hidden,
 * and every customer-facing control still does its job.
 *
 * Also verifies the paid-template paywall for anonymous visitors.
 *
 * Usage:  npm run qa:customer
 * Exits non-zero if any check fails. Spawns and kills its own dev server.
 */
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const PORT = 5198;
const FREE = `http://localhost:${PORT}/editor/instagram-carousel-coach`;
const PAID = `http://localhost:${PORT}/editor/neon-nights-concert-flyer`;
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let passed = 0, failed = 0;
const pageErrors = [];
function ok(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name} ${detail}`); }
}

async function waitServer(tries = 40) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`http://localhost:${PORT}/`); if (r.ok) return; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('dev server never came up');
}

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
process.on('exit', () => { try { server.kill('SIGKILL'); } catch { /* already dead */ } });

let browser;
try {
  await waitServer();
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 950 });
  page.on('pageerror', e => pageErrors.push(e.message));

  /* 0 — paywall: paid template refuses anonymous access */
  console.log('\npaywall');
  await page.goto(PAID, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 6000));
  const paywall = await page.evaluate(() => ({
    denied: /don't have permission/i.test(document.body.textContent),
    buyBtn: [...document.querySelectorAll('a')].some(a => /Buy Template/i.test(a.textContent)),
    canvasBooted: !!window.__fc,
  }));
  ok('paid template shows access-denied to anonymous visitor', paywall.denied, JSON.stringify(paywall));
  ok('paywall offers a Buy Template route', paywall.buyBtn);
  ok('paywall never boots the canvas', !paywall.canvasBooted);

  /* 1 — free template boots in customer mode */
  console.log('\ncustomer boot');
  await page.goto(FREE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__fc?.getObjects?.().length > 0, { timeout: 30000 });
  await new Promise(r => setTimeout(r, 2500));
  await page.evaluate(() => { [...document.querySelectorAll('button')].find(x => /skip/i.test(x.textContent))?.click(); });
  await new Promise(r => setTimeout(r, 500));
  await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"][aria-label="Unsaved version found"]');
    if (d) [...d.querySelectorAll('button')].find(x => x.textContent.trim() === 'Discard')?.click();
  });
  await new Promise(r => setTimeout(r, 500));

  const count = () => page.evaluate(() => window.__fc?.getObjects().length ?? -1);
  const key = async (...keys) => {
    for (const k of keys.slice(0, -1)) await page.keyboard.down(k);
    await page.keyboard.press(keys[keys.length - 1]);
    for (const k of keys.slice(0, -1).reverse()) await page.keyboard.up(k);
    await new Promise(r => setTimeout(r, 400));
  };
  const selectName = (name) => page.evaluate((nm) => {
    const c = window.__fc;
    const t = c.getObjects().find(o => o.kName === nm);
    if (!t) return false;
    c.setActiveObject(t); c.renderAll();
    c.fire('selection:created', { selected: [t] });
    return true;
  }, name);
  const clickBtn = (re) => page.evaluate((src) => {
    const b = [...document.querySelectorAll('button')].find(x => new RegExp(src, 'i').test(x.textContent) && !x.disabled);
    if (b) { b.click(); return true; }
    return false;
  }, re);

  const n0 = await count();
  ok('customer canvas boots with template objects', n0 >= 4, `got ${n0}`);
  ok('no AUTHOR badge in customer mode', await page.evaluate(() => !/AUTHOR/.test(document.body.textContent)));

  /* 2 — locked layers are untouchable */
  console.log('\nlocked layers');
  const lockState = await page.evaluate(() => {
    const bg = window.__fc.getObjects().find(o => o.kId === 'background');
    return { selectable: bg.selectable, evented: bg.evented, locked: bg.kLocked };
  });
  ok('locked background is not selectable/evented', lockState.selectable === false && lockState.evented === false, JSON.stringify(lockState));
  // click dead-center of canvas — background/accent are locked, nothing should select
  await page.evaluate(() => window.__fc.discardActiveObject());
  const stageBox = await page.evaluate(() => document.querySelector('.upper-canvas').getBoundingClientRect().toJSON());
  await page.mouse.click(stageBox.x + stageBox.width * 0.5, stageBox.y + stageBox.height * 0.06);
  await new Promise(r => setTimeout(r, 400));
  const hitTop = await page.evaluate(() => window.__fc.getActiveObject()?.kName ?? 'none');
  ok('clicking the locked accent bar area selects nothing', hitTop === 'none', `got ${hitTop}`);

  /* 3 — padlock stays shut for customers */
  console.log('\ncustomer padlock');
  await page.evaluate(() => { [...document.querySelectorAll('button')].find(x => x.textContent.trim().toUpperCase() === 'LAYERS')?.click(); });
  await new Promise(r => setTimeout(r, 600));
  const pad = await page.evaluate(() => {
    const row = [...document.querySelectorAll('.s-layer')].find(r => /Background/.test(r.textContent));
    const btn = row && [...row.querySelectorAll('button')].find(b => /lock/i.test(b.title ?? ''));
    return btn ? { title: btn.title } : null;
  });
  ok('locked row padlock reads "Locked by template"', !!pad && /locked by template/i.test(pad.title) && !/click to unlock/i.test(pad.title), JSON.stringify(pad));
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('.s-layer')].find(r => /Background/.test(r.textContent));
    [...row.querySelectorAll('button')].find(b => /lock/i.test(b.title ?? ''))?.click();
  });
  await new Promise(r => setTimeout(r, 500));
  ok('customer padlock click does NOT unlock', await page.evaluate(() => window.__fc.getObjects().find(o => o.kId === 'background')?.kLocked === true));

  /* 4 — non-deletable layer refuses Delete */
  console.log('\nnon-deletable layer');
  ok('select Page Number', await selectName('Page Number'));
  await new Promise(r => setTimeout(r, 400));
  const nDel = await count();
  await page.keyboard.press('Delete');
  await new Promise(r => setTimeout(r, 400));
  ok('Delete key refused for kDeletable=false layer', (await count()) === nDel);
  ok('sidebar hides "Delete element" for protected layer', await page.evaluate(() =>
    ![...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Delete element')));
  ok('no Template permissions section for customers', await page.evaluate(() => !/Template permissions/i.test(document.body.textContent)));

  /* 5 — customer chrome: rail + top bar */
  console.log('\ncustomer chrome');
  const railLabels = await page.evaluate(() => [...document.querySelectorAll('.s-rail-btn')].map(b => b.textContent.trim()));
  ok('Fields rail tab hidden from customers', !railLabels.some(l => /field/i.test(l)), JSON.stringify(railLabels));
  ok('Download present for customers', await page.evaluate(() => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Download')));
  ok('Publish hidden from customers', await page.evaluate(() => ![...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Publish')));

  /* 6 — editable text still fully editable */
  console.log('\neditable text');
  ok('select Slide Headline', await selectName('Slide Headline'));
  await new Promise(r => setTimeout(r, 500));
  const fs0 = await page.evaluate(() => window.__fc.getActiveObject()?.fontSize);
  await page.evaluate(() => {
    const panel = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === '+');
    panel[panel.length - 1]?.click();
  });
  await new Promise(r => setTimeout(r, 400));
  ok('font size + works for customer', await page.evaluate(() => window.__fc.getActiveObject()?.fontSize) === fs0 + 2, `${fs0}`);
  await page.evaluate(() => { [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'Lowercase')?.click(); });
  await new Promise(r => setTimeout(r, 400));
  const lowered = await page.evaluate(() => window.__fc.getActiveObject()?.text);
  ok('lowercase case button works for customer', lowered === lowered.toLowerCase(), JSON.stringify(lowered));
  await page.evaluate(() => { [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'Uppercase')?.click(); });
  await new Promise(r => setTimeout(r, 400));
  // sidebar textarea edits content
  const edited = await page.evaluate(() => {
    const ta = [...document.querySelectorAll('textarea')].find(t => /habits/i.test(t.value));
    if (!ta) return null;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, 'SIX HABITS THAT GROW YOUR BRAND');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  });
  await new Promise(r => setTimeout(r, 500));
  ok('sidebar text-content textarea rewrites the object', edited === true && await page.evaluate(() =>
    /SIX HABITS/.test(window.__fc.getObjects().find(o => o.kName === 'Slide Headline')?.text ?? '')), `edited=${edited}`);

  /* 7 — undo/redo still work in customer mode */
  console.log('\nundo/redo');
  const nU = await count();
  await key('Meta', 'd');
  ok('⌘D duplicates an editable layer', (await count()) === nU + 1, `got ${await count()}`);
  await key('Meta', 'z');
  ok('⌘Z undoes the duplicate', (await count()) === nU);
  await key('Meta', 'Shift', 'z');
  ok('⌘⇧Z redoes the duplicate', (await count()) === nU + 1);
  await key('Meta', 'z');
  await new Promise(r => setTimeout(r, 600));

  /* 8 — export dialog works for customers */
  console.log('\nexport');
  await clickBtn('^Download$');
  await new Promise(r => setTimeout(r, 900));
  ok('export dialog opens for customer', await page.evaluate(() => !!document.querySelector('[role="dialog"][aria-label="Download design"]')));
  const fmts = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"][aria-label="Download design"] button')]
    .map(b => b.textContent.trim()).filter(t => /^(png|jpg|svg|pdf|psd)/i.test(t)));
  ok('customer sees format options', fmts.length >= 2, JSON.stringify(fmts));
  await page.evaluate(() => {
    [...document.querySelectorAll('[role="dialog"][aria-label="Download design"] button')].find(b => b.textContent.trim() === 'Cancel')?.click();
  });
  await new Promise(r => setTimeout(r, 400));

  /* 9 — currency: visitor switches USD → JMD and prices follow site-wide */
  console.log('\ncurrency conversion');
  await page.goto(`http://localhost:${PORT}/packages`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 1500));
  const hasSelector = await page.evaluate(() => !!document.querySelector('select[aria-label="Display currency"]'));
  ok('currency selector present in header', hasSelector);
  await page.select('select[aria-label="Display currency"]', 'JMD');
  await new Promise(r => setTimeout(r, 700));
  let txt = await page.evaluate(() => document.body.innerText);
  ok('JMD prices render after switch (J$ shown)', /J\$[\d,]+/.test(txt));
  const jmdPersisted = await page.evaluate(() => localStorage.getItem('sk-currency'));
  ok('currency choice persists (localStorage)', jmdPersisted === 'JMD', String(jmdPersisted));
  await page.select('select[aria-label="Display currency"]', 'USD');
  await new Promise(r => setTimeout(r, 700));
  txt = await page.evaluate(() => document.body.innerText);
  ok('switching back restores USD prices', !/J\$[\d,]+/.test(txt) && /\$[\d,]+/.test(txt));

  /* summary */
  console.log('\n' + '—'.repeat(20));
  ok('zero page errors during the whole run', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  console.log(`\n${passed} passed · ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
} catch (err) {
  console.error('QA run crashed:', err.message);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  try { server.kill('SIGKILL'); } catch { /* already dead */ }
}
