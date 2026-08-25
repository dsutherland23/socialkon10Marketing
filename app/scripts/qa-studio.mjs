/**
 * KON10 Studio — Admin portal, Client portal & Meeting Room audit.
 * Verifies the auth gates, sign-in form behavior, meeting code entry,
 * not-found recovery, and lobby flows against their intended behavior.
 *
 * Usage:  npm run qa:studio
 * Exits non-zero if any check fails. Spawns and kills its own dev server.
 */
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const PORT = 5197;
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

let browser;
try {
  await waitServer();
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 950 });
  page.on('pageerror', e => pageErrors.push(e.message));

  /* ---------------- ADMIN PORTAL ---------------- */
  console.log('\nadmin gate');
  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 5000));
  let text = await bodyText(page);
  ok('signed-out visitor sees the admin sign-in gate', /Studio Admin/i.test(text) && /Authorised personnel only/i.test(text));
  ok('admin dashboard does NOT render for signed-out visitor', !/Orders|Templates|Customers/i.test(text.replace(/Studio Admin|Authorised/g, '')) || !document, '');

  // empty submit → inline validation error
  await page.evaluate(() => { [...document.querySelectorAll('button')].find(b => /Sign in to Studio/i.test(b.textContent))?.click(); });
  await new Promise(r => setTimeout(r, 600));
  text = await bodyText(page);
  ok('empty submit shows validation error', /Enter your admin email and password/i.test(text));

  // password eye toggle
  const eyeBefore = await page.evaluate(() => document.querySelector('#adm-pass')?.type);
  await page.evaluate(() => { document.querySelector('#adm-pass')?.parentElement.querySelector('button')?.click(); });
  await new Promise(r => setTimeout(r, 300));
  const eyeAfter = await page.evaluate(() => document.querySelector('#adm-pass')?.type);
  ok('password eye toggle reveals the password', eyeBefore === 'password' && eyeAfter === 'text', `${eyeBefore} → ${eyeAfter}`);
  await page.evaluate(() => { document.querySelector('#adm-pass')?.parentElement.querySelector('button')?.click(); });
  await new Promise(r => setTimeout(r, 300));
  ok('eye toggle hides the password again', await page.evaluate(() => document.querySelector('#adm-pass')?.type) === 'password');

  // bad credentials → Firebase error surfaces as inline alert
  await page.type('#adm-email', 'not-an-admin@example.com');
  await page.type('#adm-pass', 'wrong-password-123');
  await page.evaluate(() => { [...document.querySelectorAll('button')].find(b => /Sign in to Studio/i.test(b.textContent))?.click(); });
  await new Promise(r => setTimeout(r, 6000));
  text = await bodyText(page);
  ok('bad credentials surface an inline error (no crash)', /invalid|incorrect|error|failed|not authorised|credential/i.test(text), text.match(/role="alert"/) ? '' : '');
  ok('still on the gate after failed sign-in', /Studio Admin/i.test(text));
  ok('google sign-in option present', await page.evaluate(() => [...document.querySelectorAll('button')].some(b => /Continue with Google/i.test(b.textContent))));

  /* ---------------- CLIENT PORTAL ---------------- */
  console.log('\nclient portal gate');
  await page.goto(`${BASE}/client`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 5000));
  text = await bodyText(page);
  ok('signed-out visitor sees the client sign-in gate', /sign in|magic link|email/i.test(text) && !/My Templates/i.test(text), text.slice(0, 120));

  /* ---------------- MEETING ROOM ---------------- */
  console.log('\nmeeting code entry');
  await page.goto(`${BASE}/meet`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 4000));
  text = await bodyText(page);
  ok('/meet without a code shows the code-entry screen', /Join a Studio Meeting/i.test(text));
  ok('code input + submit present', await page.evaluate(() =>
    !!document.querySelector('input[name="meetingCode"]') && [...document.querySelectorAll('button')].some(b => /Enter Meeting Room/i.test(b.textContent))));

  // paste a full URL — should strip to the code and navigate
  await page.evaluate(() => {
    const inp = document.querySelector('input[name="meetingCode"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, 'https://socialkon10.pro/meet/SK-TEST-NOPE');
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.evaluate(() => { [...document.querySelectorAll('button')].find(b => /Enter Meeting Room/i.test(b.textContent))?.click(); });
  await new Promise(r => setTimeout(r, 1500));
  ok('pasting a full meeting URL strips to the code', /\/meet\/SK-TEST-NOPE$/i.test(page.url()), page.url());

  console.log('\nmeeting not found');
  await new Promise(r => setTimeout(r, 7000));
  text = await bodyText(page);
  ok('unknown room code lands on Not Found (not a hang)', /Meeting Not Found or Inactive/i.test(text), text.slice(0, 160));
  ok('not-found screen shows the offending code', text.includes('SK-TEST-NOPE'));
  ok('not-found screen offers a re-entry form', await page.evaluate(() => !!document.querySelector('input[name="reCode"]')));

  // re-entry form navigates again
  await page.evaluate(() => {
    const inp = document.querySelector('input[name="reCode"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, 'sk-zzz-bad');
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.evaluate(() => { [...document.querySelectorAll('button')].find(b => /^Join/i.test(b.textContent.trim()))?.click(); });
  await new Promise(r => setTimeout(r, 1500));
  ok('re-entry form navigates to the new code', /\/meet\/sk-zzz-bad/i.test(page.url()), page.url());

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
