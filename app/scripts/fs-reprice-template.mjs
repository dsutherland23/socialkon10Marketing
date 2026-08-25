/**
 * Reprice the "$0 test" Summer Vibes template back to launch pricing
 * (seed values: $35 / sale $25 / customize $75) and restore its public name.
 *
 * Auth: the local firebase-tools OAuth access token (same identity as
 * `firebase` CLI on this machine). The token is read silently and never
 * printed. Run any `firebase` CLI command first to guarantee freshness.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOC_ID = 'x99NvNwqvMTaCebAM1MK';
const PATCH = {
  name: 'Summer Vibes Party Flyer',
  price: 35,
  salePrice: 25,
  customizePrice: 75,
};

function envVal(key) {
  try {
    const m = readFileSync(join(root, '.env'), 'utf8').match(new RegExp(`^${key}=(.+)$`, 'm'));
    return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
  } catch { return ''; }
}

function accessToken() {
  const p = join(homedir(), '.config', 'configstore', 'firebase-tools.json');
  const j = JSON.parse(readFileSync(p, 'utf8'));
  return j?.tokens?.access_token
    ?? j?.additionalAccounts?.[0]?.tokens?.access_token
    ?? null;
}

const PROJECT = envVal('VITE_FIREBASE_PROJECT_ID');
const token = accessToken();
if (!PROJECT || !token) { console.error('Missing project id or firebase-tools access token'); process.exit(1); }

const mask = Object.keys(PATCH).map((k) => `updateMask.fieldPaths=${k}`).join('&');
const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/templates/${DOC_ID}?${mask}`;

const body = {
  fields: {
    name: { stringValue: PATCH.name },
    price: { integerValue: String(PATCH.price) },
    salePrice: { integerValue: String(PATCH.salePrice) },
    customizePrice: { integerValue: String(PATCH.customizePrice) },
  },
};

const res = await fetch(url, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

if (!res.ok) { console.error(`HTTP ${res.status}: ${await res.text()}`); process.exit(1); }
const d = await res.json();
const f = d.fields ?? {};
console.log('Template repriced successfully:');
console.log(`  name=${f.name?.stringValue}`);
console.log(`  price=${f.price?.integerValue}  salePrice=${f.salePrice?.integerValue}  customizePrice=${f.customizePrice?.integerValue}`);
