/**
 * KON10 Studio — editor regression suite.
 * Boots the real editor in Chrome and exercises every fragile flow:
 * selection, reorder (single + multi), grouping, duplicate, warp, crop,
 * retouch, context menu, undo, layers panel integrity.
 *
 * Usage:  npm run qa:editor
 * Exits non-zero if any check fails. Spawns and kills its own dev server.
 */
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const PORT = 5199;
const URL = `http://localhost:${PORT}/editor/author/summer-vibes-party-flyer`;
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

  await page.goto(URL, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2500));
  await page.evaluate(() => { [...document.querySelectorAll('button')].find(x => /skip/i.test(x.textContent))?.click(); });
  await new Promise(r => setTimeout(r, 500));

  const count = () => page.evaluate(() => window.__fc?.getObjects().length ?? -1);
  const types = () => page.evaluate(() => window.__fc.getObjects().map(o => o.type));
  const active = () => page.evaluate(() => window.__fc.getActiveObject()?.type ?? 'none');
  const selectText = (re) => page.evaluate((src) => {
    const c = window.__fc;
    const t = c.getObjects().find(o => /textbox|itext/i.test(o.type) && new RegExp(src, 'i').test(o.text ?? ''));
    if (!t) return false;
    c.setActiveObject(t); c.renderAll();
    c.fire('selection:created', { selected: [t] });
    return true;
  }, re);
  const key = async (...keys) => {
    for (const k of keys.slice(0, -1)) await page.keyboard.down(k);
    await page.keyboard.press(keys[keys.length - 1]);
    for (const k of keys.slice(0, -1).reverse()) await page.keyboard.up(k);
    await new Promise(r => setTimeout(r, 350));
  };

  /* 1 — boot */
  console.log('\nboot');
  const n0 = await count();
  ok('canvas boots with template objects', n0 >= 5, `got ${n0}`);
  ok('no phantom activeselection at load', !(await types()).includes('activeselection'));

  /* 2 — single-object reorder */
  console.log('\nsingle-object reorder');
  await selectText('SUMMER');
  const beforeFwd = await count();
  await key('Meta', ']');
  ok('⌘] keeps object count', (await count()) === beforeFwd);
  await key('Meta', '[');
  ok('⌘[ keeps object count', (await count()) === beforeFwd);

  /* 3 — multi-select reorder (the phantom-layer bug) */
  console.log('\nmulti-select reorder');
  await key('Meta', 'a');
  ok('⌘A selects all', (await active()) === 'activeselection');
  for (const [label, keys] of [['front', ['Meta', 'Shift', ']']], ['back', ['Meta', 'Shift', '[']], ['forward', ['Meta', ']']], ['backward', ['Meta', '[']]]) {
    await key(...keys);
    const t = await types();
    ok(`⌘${keys.includes('Shift') ? '⇧' : ''}${keys.at(-1)} (${label}) adds no phantom layer`, t.length === n0 && !t.includes('activeselection'), `got ${t.length}`);
  }
  await key('Escape');
  ok('Escape deselects without phantoms', (await types()).length === n0);

  /* 4 — group / ungroup */
  console.log('\ngroup / ungroup');
  await key('Meta', 'a');
  await key('Meta', 'g');
  ok('⌘G groups', (await active()) === 'group');
  const grouped = await count();
  ok('grouping collapses the stack', grouped < n0, `got ${grouped}`);
  await key('Meta', 'Shift', 'g');
  ok('⌘⇧G ungroups back', (await count()) === n0);
  await key('Escape');

  /* 5 — duplicate gets a fresh layer id */
  console.log('\nduplicate');
  await selectText('Kingston');
  const nDup = await count();
  await key('Meta', 'd');
  ok('⌘D adds exactly one object', (await count()) === nDup + 1);
  const dupeIds = await page.evaluate(() => {
    const ids = window.__fc.getObjects().map(o => o.kId);
    return ids.filter((x, i) => ids.indexOf(x) !== i);
  });
  ok('duplicate has a unique kId', dupeIds.length === 0, JSON.stringify(dupeIds));
  await key('Meta', 'z'); // undo the duplicate
  ok('⌘Z undoes duplicate', (await count()) === nDup);

  /* 6 — warped text */
  console.log('\nwarped text');
  await selectText('SUMMER');
  await page.evaluate(() => { [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '⌒')?.click(); });
  await new Promise(r => setTimeout(r, 500));
  const warpState = await page.evaluate(() => { const t = window.__fc.getActiveObject(); return { k: !!t?.kWarp, p: !!t?.path }; });
  ok('arc warp applies path + kWarp', warpState.k && warpState.p, JSON.stringify(warpState));
  await page.evaluate(() => { [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'Remove warp')?.click(); });
  await new Promise(r => setTimeout(r, 500));
  ok('unwarp removes the path', await page.evaluate(() => !window.__fc.getActiveObject()?.path));
  await key('Meta', 'z'); await key('Meta', 'z'); // undo warp experiments
  await new Promise(r => setTimeout(r, 300));
  ok('count stable after warp undo', (await count()) === nDup);

  /* 7 — visual crop */
  console.log('\nvisual crop');
  await page.evaluate(async () => {
    const c = window.__fc, F = window.__fabric;
    const src = document.createElement('canvas'); src.width = 800; src.height = 600;
    const x = src.getContext('2d');
    const g = x.createLinearGradient(0, 0, 800, 600);
    g.addColorStop(0, '#0ea5e9'); g.addColorStop(1, '#8b5cf6');
    x.fillStyle = g; x.fillRect(0, 0, 800, 600);
    // speckle noise so blur-based healing measurably changes pixels
    for (let i = 0; i < 900; i++) {
      x.fillStyle = Math.random() > 0.5 ? '#0f172a' : '#f8fafc';
      x.fillRect(Math.random() * 800, Math.random() * 600, 4, 4);
    }
    const el = new Image();
    await new Promise(r => { el.onload = r; el.src = src.toDataURL(); });
    const img = new F.FabricImage(el, { left: 240, top: 240, scaleX: 0.5, scaleY: 0.5 });
    c.add(img); c.setActiveObject(img); c.renderAll();
    c.fire('selection:created', { selected: [img] });
  });
  await new Promise(r => setTimeout(r, 400));
  const nImg = await count();
  await page.evaluate(() => { [...document.querySelectorAll('button')].find(x => /Crop visually/i.test(x.textContent))?.click(); });
  await new Promise(r => setTimeout(r, 400));
  ok('crop overlay appears', await page.evaluate(() => [...document.querySelectorAll('div')].some(d => d.style.boxShadow.includes('9999px'))));
  const handle = await page.evaluate(() => {
    const overlay = [...document.querySelectorAll('div')].find(d => d.style.boxShadow.includes('9999px'));
    const se = overlay && [...overlay.querySelectorAll('div')].find(d => d.style.cursor === 'se-resize');
    if (!se) return null;
    const r = se.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (handle) {
    await page.mouse.move(handle.x, handle.y); await page.mouse.down();
    await page.mouse.move(handle.x - 80, handle.y - 60, { steps: 6 }); await page.mouse.up();
    await new Promise(r => setTimeout(r, 300));
    await page.keyboard.press('Enter');
    await new Promise(r => setTimeout(r, 500));
  }
  const cropRes = await page.evaluate(() => {
    const img = window.__fc.getObjects().find(o => /image/i.test(o.type));
    return img ? { w: Math.round(img.width), cropped: (img.cropX ?? 0) > 0 || (img.cropY ?? 0) > 0 || img.width < 800 } : null;
  });
  ok('crop commits a smaller frame', !!cropRes && cropRes.cropped, JSON.stringify(cropRes));
  ok('crop adds no objects', (await count()) === nImg);

  /* 8 — retouch spot heal */
  console.log('\nretouch');
  await page.evaluate(() => {
    const c = window.__fc;
    const img = c.getObjects().find(o => /image/i.test(o.type));
    c.setActiveObject(img); c.renderAll();
    c.fire('selection:created', { selected: [img] });
  });
  await new Promise(r => setTimeout(r, 300));
  await page.evaluate(() => { [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Spot heal')?.click(); });
  await new Promise(r => setTimeout(r, 400));
  const stroke = await page.evaluate(() => {
    const c = window.__fc;
    const img = c.getObjects().find(o => /image/i.test(o.type));
    const r = img.getBoundingRect();
    const el = document.querySelector('.upper-canvas').getBoundingClientRect();
    const vpt = c.viewportTransform;
    const toScreen = (sx, sy) => ({ x: el.x + sx * vpt[0] + vpt[4], y: el.y + sy * vpt[3] + vpt[5] });
    return { a: toScreen(r.left + r.width * 0.5, r.top + r.height * 0.3), b: toScreen(r.left + r.width * 0.7, r.top + r.height * 0.4) };
  });
  const pxSample = `
    const img = window.__fc.getObjects().find(o => /image/i.test(o.type));
    const el = img.getElement();
    const t = document.createElement('canvas'); t.width = el.width; t.height = el.height;
    const ctx = t.getContext('2d'); ctx.drawImage(el, 0, 0);
    // sample a small patch at the stroke midpoint (displayed 0.6w/0.35h → natural via crop offset)
    const nx = Math.round((img.cropX ?? 0) + 0.6 * img.width);
    const ny = Math.round((img.cropY ?? 0) + 0.35 * img.height);
    ctx.getImageData(nx, ny, 8, 8).data.join(',')`;
  const pxBefore = await page.evaluate(pxSample);
  await page.mouse.move(stroke.a.x, stroke.a.y); await page.mouse.down();
  await page.mouse.move(stroke.b.x, stroke.b.y, { steps: 12 }); await page.mouse.up();
  await new Promise(r => setTimeout(r, 900));
  const healRes = await page.evaluate(`(() => {
    const img = window.__fc.getObjects().find(o => /image/i.test(o.type));
    return { px: (() => { ${pxSample} })(), src: (img.getSrc?.() ?? '').slice(0, 15) };
  })()`);
  ok('spot heal repaints pixels', healRes.px !== pxBefore, `${pxBefore} → ${healRes.px}`);
  ok('retouched image serializes as data URL', healRes.src.startsWith('data:image'));
  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 300));
  ok('Esc exits retouch mode', await page.evaluate(() => !document.body.textContent.includes('SPOT HEAL — PAINT')));

  /* 9 — right-click context menu stays open + quick actions work */
  console.log('\ncontext menu');
  const textPos = await page.evaluate(() => {
    const c = window.__fc;
    const t = c.getObjects().find(o => /textbox|itext/i.test(o.type) && /SUMMER/i.test(o.text ?? ''));
    const r = t.getBoundingRect();
    const el = document.querySelector('.upper-canvas').getBoundingClientRect();
    const vpt = c.viewportTransform;
    return { x: el.x + (r.left + r.width / 2) * vpt[0] + vpt[4], y: el.y + (r.top + r.height / 2) * vpt[3] + vpt[5] };
  });
  await page.mouse.click(textPos.x, textPos.y, { button: 'right' });
  await new Promise(r => setTimeout(r, 600));
  ok('right-click menu opens and STAYS open', await page.evaluate(() => !!document.querySelector('.s-menu')));
  ok('text quick actions listed', await page.evaluate(() => /Warp — arc up/.test(document.querySelector('.s-menu')?.textContent ?? '')));
  await page.evaluate(() => { [...document.querySelectorAll('.s-menu-item')].find(x => /arc down/i.test(x.textContent))?.click(); });
  await new Promise(r => setTimeout(r, 500));
  ok('menu item action fires (arc down warp)', await page.evaluate(() => {
    const t = window.__fc.getObjects().find(o => /SUMMER/i.test(o.text ?? ''));
    return t?.kWarp?.mode === 'arcDown';
  }));
  ok('menu closed after action', await page.evaluate(() => !document.querySelector('.s-menu')));

  /* 10 — layers panel integrity */
  console.log('\nlayers panel');
  await page.evaluate(() => { [...document.querySelectorAll('button')].find(x => x.textContent.trim().toUpperCase() === 'LAYERS')?.click(); });
  await new Promise(r => setTimeout(r, 400));
  const rows = await page.evaluate(() => document.querySelectorAll('.s-layer').length);
  ok('panel rows match canvas objects', rows === (await count()), `rows=${rows} canvas=${await count()}`);

  /* 11 — Word-style shortcuts */
  console.log('\ntext shortcuts');
  await selectText('Kingston');
  const fmtBefore = await page.evaluate(() => { const t = window.__fc.getActiveObject(); return { w: t.fontWeight, u: t.underline }; });
  await key('Meta', 'b'); await key('Meta', 'u');
  const fmtAfter = await page.evaluate(() => { const t = window.__fc.getActiveObject(); return { w: t.fontWeight, u: t.underline }; });
  ok('⌘B bolds selected text', fmtAfter.w !== fmtBefore.w, JSON.stringify(fmtAfter));
  ok('⌘U underlines selected text', fmtAfter.u === true);

  /* 12 — locks: icon state, delete protection, unlock-any-layer */
  console.log('\nlocks');
  const lockInfo = await page.evaluate(() => {
    const row = [...document.querySelectorAll('.s-layer')].find(r => /🔒/.test(r.textContent));
    if (!row) return null;
    const pad = [...row.querySelectorAll('button')].find(b => /lock/i.test(b.title ?? ''));
    return { title: pad?.title ?? '' };
  });
  ok('template-locked row shows locked padlock + tooltip', !!lockInfo && /template/i.test(lockInfo.title), JSON.stringify(lockInfo));
  const lockedName = await page.evaluate(() => window.__fc.getObjects().find(o => o.kLocked === true)?.kName ?? null);
  if (lockedName) {
    const nLock = await count();
    await page.evaluate((nm) => {
      const c = window.__fc;
      const o = c.getObjects().find(x => x.kName === nm);
      c.setActiveObject(o); c.renderAll();
    }, lockedName);
    await page.keyboard.press('Delete');
    await new Promise(r => setTimeout(r, 300));
    ok('locked layer refuses Delete', (await count()) === nLock);
    await page.evaluate((nm) => {
      const row = [...document.querySelectorAll('.s-layer')].find(r => r.textContent.includes(nm));
      [...row.querySelectorAll('button')].find(b => /click to unlock/i.test(b.title ?? ''))?.click();
    }, lockedName);
    await new Promise(r => setTimeout(r, 400));
    ok('padlock lifts the full template restriction set', await page.evaluate((nm) => {
      const o = window.__fc.getObjects().find(x => x.kName === nm);
      return !!o && o.kLocked === false && o.kDeletable === true && o.kEditable === true && o.kMovable === true;
    }, lockedName));
    await page.evaluate((nm) => {
      const c = window.__fc;
      const o = c.getObjects().find(x => x.kName === nm);
      c.setActiveObject(o); c.renderAll();
    }, lockedName);
    await page.keyboard.press('Delete');
    await new Promise(r => setTimeout(r, 300));
    ok('unlocked layer deletes', (await count()) === nLock - 1);
    await key('Meta', 'z');
    await new Promise(r => setTimeout(r, 1200)); // loadFromJSON is async — give undo room
    ok('undo restores the deleted layer', (await count()) === nLock);
  } else ok('locked template layer exists for testing', false, 'none found');

  /* 13 — gradient editing: apply preset, live-edit direction, back to solid */
  console.log('\ngradient editing');
  await page.evaluate(() => {
    const c = window.__fc;
    const o = c.getObjects().find(x => /^(rect|circle)$/i.test(x.type) && x.kId !== 'background');
    c.setActiveObject(o); c.renderAll();
    c.fire('selection:created', { selected: [o] });
  });
  await new Promise(r => setTimeout(r, 400));
  await page.evaluate(() => { document.querySelector('button[aria-label^="Gradient #"]')?.click(); });
  await new Promise(r => setTimeout(r, 400));
  const grad1 = await page.evaluate(() => {
    const f = window.__fc.getActiveObject()?.fill;
    return f?.colorStops ? { n: f.colorStops.length } : null;
  });
  ok('preset applies a real gradient fill', !!grad1 && grad1.n === 2, JSON.stringify(grad1));
  ok('panel switches to live-edit mode', await page.evaluate(() => /changes apply live/i.test(document.body.textContent)));
  await page.evaluate(() => { [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Gradient direction v')?.click(); });
  await new Promise(r => setTimeout(r, 400));
  const grad2 = await page.evaluate(() => {
    const f = window.__fc.getActiveObject()?.fill;
    return f?.coords ? { x2: f.coords.x2, y2: f.coords.y2 } : null;
  });
  ok('direction change edits the existing gradient live', !!grad2 && grad2.x2 === 0 && grad2.y2 > 0, JSON.stringify(grad2));
  await page.evaluate(() => { [...document.querySelectorAll('button')].find(b => /Back to solid color/i.test(b.textContent))?.click(); });
  await new Promise(r => setTimeout(r, 400));
  ok('back to solid restores a plain fill', await page.evaluate(() => typeof window.__fc.getActiveObject()?.fill === 'string'));

  /* 14 — floating toolbar: auto-flip below + drag away */
  console.log('\nfloating toolbar');
  const flip = await page.evaluate(async () => {
    const c = window.__fc;
    const t = c.getObjects().find(o => /textbox|itext/i.test(o.type));
    t.set({ top: 4 }); t.setCoords(); c.renderAll();
    c.setActiveObject(t); c.fire('selection:created', { selected: [t] });
    await new Promise(r => setTimeout(r, 500));
    const tb = document.querySelector('.s-toolbar')?.getBoundingClientRect();
    if (!tb) return null;
    const cr = c.upperCanvasEl.getBoundingClientRect();
    const r2 = t.getBoundingRect(true, true);
    return { tbTop: tb.top, objTop: cr.top + r2.top, objBottom: cr.top + r2.top + r2.height };
  });
  ok('toolbar flips below objects at the top edge', !!flip && flip.tbTop >= flip.objBottom - 2, JSON.stringify(flip));
  const tbBefore = await page.evaluate(() => { const r = document.querySelector('.s-toolbar').getBoundingClientRect(); return { x: r.left, y: r.top }; });
  const gripBox = await (await page.evaluateHandle(() => document.querySelector('.s-grip'))).boundingBox();
  if (gripBox) {
    await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(gripBox.x + 150, gripBox.y + 100, { steps: 5 });
    await page.mouse.up();
    await new Promise(r => setTimeout(r, 300));
  }
  const tbAfter = await page.evaluate(() => { const r = document.querySelector('.s-toolbar').getBoundingClientRect(); return { x: r.left, y: r.top }; });
  ok('grip drags the toolbar out of the way',
    !!gripBox && Math.abs(tbAfter.x - tbBefore.x) > 100 && Math.abs(tbAfter.y - tbBefore.y) > 60,
    JSON.stringify({ tbBefore, tbAfter }));

  /* 15 — magic resize: reflow, text-aware scaling, author editability */
  console.log('\nmagic resize');
  const preResize = await page.evaluate(() => {
    const t = window.__fc.getObjects().find(o => /textbox|itext/i.test(o.type));
    return { fs: t.fontSize, sx: t.scaleX };
  });
  await page.evaluate(() => { [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Resize design — fit to another format')?.click(); });
  await new Promise(r => setTimeout(r, 400));
  await page.evaluate(() => { [...document.querySelectorAll('.s-list-btn')].find(b => /Facebook Post/i.test(b.textContent))?.click(); });
  await new Promise(r => setTimeout(r, 1500));
  const postResize = await page.evaluate(() => {
    const c = window.__fc;
    const t = c.getObjects().find(o => /textbox|itext/i.test(o.type));
    const bg = c.getObjects().find(o => o.kId === 'background');
    const locked = c.getObjects().find(o => o.kLocked === true);
    return { bgW: bg?.width ?? 0, bgH: bg?.height ?? 0, fs: t.fontSize, sx: t.scaleX, lockedSelectable: locked ? locked.selectable : null };
  });
  ok('background refits the new format', postResize.bgW === 1200 && postResize.bgH === 630, JSON.stringify(postResize));
  ok('text bakes a real, scaled font size', postResize.fs < preResize.fs && postResize.fs >= 10 && postResize.sx === 1,
    JSON.stringify({ preResize, postResize }));
  ok('author keeps full control of locked layers after resize', postResize.lockedSelectable !== false, JSON.stringify(postResize));

  /* summary */
  console.log('\n—'.repeat(20));
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
