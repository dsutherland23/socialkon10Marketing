/**
 * Read-only inspection of the live Firestore `templates` collection.
 * Uses the Firestore REST API with the project's public API key
 * (rules allow public reads on templates). Prints no secrets.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function envVal(key) {
  for (const file of ['.env', '.env.local']) {
    try {
      const m = readFileSync(join(root, file), 'utf8').match(new RegExp(`^${key}=(.+)$`, 'm'));
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    } catch { /* file may not exist */ }
  }
  return '';
}

const API_KEY = envVal('VITE_FIREBASE_API_KEY');
const PROJECT = envVal('VITE_FIREBASE_PROJECT_ID');
if (!API_KEY || !PROJECT) { console.error('Firebase env keys not found'); process.exit(1); }

const url = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/templates?pageSize=100&key=${API_KEY}`;
const res = await fetch(url);
if (!res.ok) { console.error(`HTTP ${res.status}: ${await res.text()}`); process.exit(1); }
const data = await res.json();

const num = (f) => f?.integerValue !== undefined ? Number(f.integerValue) : (f?.doubleValue !== undefined ? Number(f.doubleValue) : undefined);
const str = (f) => f?.stringValue;

console.log(`\n${(data.documents ?? []).length} template doc(s) in Firestore:\n`);
for (const d of data.documents ?? []) {
  const id = d.name.split('/').pop();
  const f = d.fields ?? {};
  console.log(`- id=${id}`);
  console.log(`  slug=${str(f.slug) ?? '?'}  name=${str(f.name) ?? '?'}`);
  console.log(`  price=${num(f.price)}  salePrice=${num(f.salePrice)}  customizePrice=${num(f.customizePrice)}  status=${str(f.status) ?? '?'}`);
}
