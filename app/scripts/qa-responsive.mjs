/**
 * Quick responsive sweep — horizontal-overflow check on key pages
 * at 320 / 768 / 1280 px. Demo mode (Firebase disabled). Exit non-zero on failure.
 */
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const PORT = 5198;
const BASE = `http://localhost:${PORT}`;
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PAGES = ['/', '/services', '/checkout', '/work', '/contact'];
const WIDTHS = [320, 768, 1280];

let failed = 0;
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

for (let i = 0; i < 40; i++) {
  try { const r = await fetch(`${BASE}/`); if (r.ok) break; } catch { /* wait */ }
  await new Promise((r) => setTimeout(r, 500));
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  // Seed a cart line so /checkout renders its full layout.
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('sk-cart', JSON.stringify([{
      key: 'logo-design--1', serviceSlug: 'logo-design', name: 'Logo Design',
      unitPrice: 450, addons: [], rush: false, billing: 'one_time', depositPct: 50,
    }]));
    localStorage.setItem('sk-currency', 'USD');
  });
  for (const w of WIDTHS) {
    await page.setViewport({ width: w, height: 900 });
    for (const p of PAGES) {
      await page.goto(`${BASE}${p}`, { waitUntil: 'networkidle0', timeout: 30000 });
      await new Promise((r) => setTimeout(r, 700));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      if (overflow) { failed++; console.log(`  ✗ overflow @ ${w}px  ${p}`); }
      else console.log(`  ✓ ${w}px  ${p}`);
    }
  }
} finally {
  await browser.close();
  killServer();
}
console.log(failed ? `\n${failed} overflow failures` : '\nAll clear — no horizontal overflow.');
process.exit(failed ? 1 : 0);
