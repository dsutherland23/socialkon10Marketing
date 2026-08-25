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

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__fc?.getObjects?.().length > 0, { timeout: 30000 });
  await new Promise(r => setTimeout(r, 2500));
  await page.evaluate(() => { [...document.querySelectorAll('button')].find(x => /skip/i.test(x.textContent))?.click(); });
  await new Promise(r => setTimeout(r, 500));
  // crash-recovery modal appears whenever a previous session left an autosaved draft — discard it for a clean baseline
  await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"][aria-label="Unsaved version found"]');
    if (d) [...d.querySelectorAll('button')].find(x => x.textContent.trim() === 'Discard')?.click();
  });
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

  /* 9 — right-click context menu: current item set, actions fire, menu closes */
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
  ok('menu lists core actions', await page.evaluate(() => {
    const t = document.querySelector('.s-menu')?.textContent ?? '';
    return /Copy/.test(t) && /Duplicate/.test(t) && /Delete/.test(t);
  }));
  const nCtx = await count();
  await page.evaluate(() => { [...document.querySelectorAll('.s-menu-item')].find(x => /^Duplicate/.test(x.textContent.trim()))?.click(); });
  await new Promise(r => setTimeout(r, 500));
  ok('menu Duplicate adds exactly one object', (await count()) === nCtx + 1, `got ${await count()} want ${nCtx + 1}`);
  ok('menu closed after action', await page.evaluate(() => !document.querySelector('.s-menu')));
  await key('Meta', 'z');
  ok('undo restores count after menu duplicate', (await count()) === nCtx);

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

  /* 14 — contextual selection dock: appears on selection, hides on deselect, controls work */
  console.log('\ncontextual dock');
  const dock = () => page.evaluate(() => {
    const d = [...document.querySelectorAll('div')].find(x => x.className.includes('bottom-3') && x.className.includes('-translate-x-1/2') && x.className.includes('z-40'));
    if (!d) return null;
    return { on: d.className.includes('opacity-100'), off: d.className.includes('opacity-0') };
  });
  await selectText('SUMMER');
  await new Promise(r => setTimeout(r, 600));
  const dockSel = await dock();
  ok('dock appears when an object is selected', !!dockSel && dockSel.on, JSON.stringify(dockSel));
  const fsDock0 = await page.evaluate(() => window.__fc.getActiveObject()?.fontSize);
  await page.evaluate((v) => {
    const d = [...document.querySelectorAll('div')].find(x => x.className.includes('bottom-3') && x.className.includes('-translate-x-1/2'));
    const inp = d?.querySelector('input[aria-label="Font size"]');
    if (!inp) return;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, String(v));
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  }, Math.round(fsDock0) + 6);
  await new Promise(r => setTimeout(r, 400));
  const fsDock1 = await page.evaluate(() => window.__fc.getActiveObject()?.fontSize);
  ok('dock font-size input changes fontSize', fsDock1 === Math.round(fsDock0) + 6, `${fsDock0} → ${fsDock1}`);
  await key('Escape');
  const dockOff = await dock();
  ok('dock hides after deselect', !!dockOff && dockOff.off, JSON.stringify(dockOff));

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

  /* helpers for the extended sweep */
  const clickBtn = (re) => page.evaluate((src) => {
    const b = [...document.querySelectorAll('button')].find(x => new RegExp(src, 'i').test(x.textContent) && !x.disabled);
    if (b) { b.click(); return true; }
    return false;
  }, re);
  const clickTip = (tip) => page.evaluate((t) => {
    const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('aria-label') ?? '') === t);
    if (b && !b.disabled) { b.click(); return true; }
    return false;
  }, tip);
  const dialogOpen = (label) => page.evaluate((l) => !!document.querySelector(`[role="dialog"][aria-label="${l}"]`), label);

  /* 16 — top bar toggles & modals */
  console.log('\ntop bar');
  const snapBefore = await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /Snapping/.test(b.getAttribute('aria-label') ?? ''))?.className.includes('s-btn-on'));
  await page.evaluate(() => { [...document.querySelectorAll('button')].find(b => /Snapping/.test(b.getAttribute('aria-label') ?? ''))?.click(); });
  await new Promise(r => setTimeout(r, 300));
  const snapAfter = await page.evaluate(() => [...document.querySelectorAll('button')].find(b => /Snapping/.test(b.getAttribute('aria-label') ?? ''))?.className.includes('s-btn-on'));
  ok('snap toggle flips active state', snapBefore !== snapAfter, `${snapBefore} → ${snapAfter}`);
  await page.evaluate(() => { [...document.querySelectorAll('button')].find(b => /Snapping/.test(b.getAttribute('aria-label') ?? ''))?.click(); });

  await clickTip('Rulers');
  await new Promise(r => setTimeout(r, 400));
  ok('rulers toggle renders ruler bars', await page.evaluate(() => !!document.querySelector('[title^="Ruler Unit"]')));
  await clickTip('Rulers');
  await new Promise(r => setTimeout(r, 300));
  ok('rulers toggle hides ruler bars', await page.evaluate(() => !document.querySelector('[title^="Ruler Unit"]')));

  await clickTip('Keyboard shortcuts · ?');
  await new Promise(r => setTimeout(r, 300));
  ok('shortcuts modal opens', await dialogOpen('Keyboard shortcuts'));
  await clickBtn('^Close$');
  await new Promise(r => setTimeout(r, 300));
  ok('shortcuts modal closes', !(await dialogOpen('Keyboard shortcuts')));

  await clickTip('Version history');
  await new Promise(r => setTimeout(r, 400));
  ok('version history modal opens', await dialogOpen('Version history'));
  await clickBtn('^Close$');
  await new Promise(r => setTimeout(r, 300));
  ok('version history modal closes', !(await dialogOpen('Version history')));

  await clickBtn('^Preview$');
  await new Promise(r => setTimeout(r, 800));
  const previewOpen = await dialogOpen('Design preview');
  ok('preview overlay opens', previewOpen);
  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 400));
  ok('Escape closes preview', !(await dialogOpen('Design preview')));

  /* zoom controls */
  const z0 = await page.evaluate(() => window.__fc.getZoom());
  await page.evaluate(() => { [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Zoom in')?.click(); });
  await new Promise(r => setTimeout(r, 300));
  const z1 = await page.evaluate(() => window.__fc.getZoom());
  ok('zoom-in raises canvas zoom', z1 > z0, `${z0} → ${z1}`);
  await page.evaluate(() => { [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Zoom out')?.click(); });
  await new Promise(r => setTimeout(r, 300));
  const z2 = await page.evaluate(() => window.__fc.getZoom());
  ok('zoom-out restores canvas zoom', Math.abs(z2 - z0) < 0.001, `${z1} → ${z2}`);
  await page.evaluate(() => { [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Fit')?.click(); });
  await new Promise(r => setTimeout(r, 400));
  const zFit = await page.evaluate(() => window.__fc.getZoom());
  ok('fit zoom within bounds', zFit >= 0.15 && zFit <= 2, `got ${zFit}`);

  /* 17 — text formatting panel */
  console.log('\ntext formatting');
  await selectText('SUMMER');
  await new Promise(r => setTimeout(r, 500));
  const alignBefore = await page.evaluate(() => window.__fc.getActiveObject()?.textAlign);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'Align right');
    b?.click();
  });
  await new Promise(r => setTimeout(r, 300));
  const alignAfter = await page.evaluate(() => window.__fc.getActiveObject()?.textAlign);
  ok('align button sets textAlign', alignAfter === 'right' && alignBefore !== 'right', `${alignBefore} → ${alignAfter}`);
  await page.evaluate(() => { [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'Align center')?.click(); });
  await new Promise(r => setTimeout(r, 300));

  await page.evaluate(() => { [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'Lowercase')?.click(); });
  await new Promise(r => setTimeout(r, 400));
  const lower = await page.evaluate(() => window.__fc.getActiveObject()?.text);
  ok('lowercase case button transforms text', lower === lower.toLowerCase() && /[a-z]/.test(lower), JSON.stringify(lower));
  await page.evaluate(() => { [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'Uppercase')?.click(); });
  await new Promise(r => setTimeout(r, 400));
  const upper = await page.evaluate(() => window.__fc.getActiveObject()?.text);
  ok('uppercase case button restores text', upper === upper.toUpperCase(), JSON.stringify(upper));

  const fs0 = await page.evaluate(() => window.__fc.getActiveObject()?.fontSize);
  await page.evaluate(() => {
    const panel = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === '+');
    panel[panel.length - 1]?.click();
  });
  await new Promise(r => setTimeout(r, 300));
  const fs1 = await page.evaluate(() => window.__fc.getActiveObject()?.fontSize);
  ok('font size + increases fontSize', fs1 === fs0 + 2, `${fs0} → ${fs1}`);

  /* 18 — image panel: flip, mask, filters */
  console.log('\nimage panel');
  await page.evaluate(() => {
    const c = window.__fc;
    const img = c.getObjects().find(o => /image/i.test(o.type));
    c.setActiveObject(img); c.renderAll();
    c.fire('selection:created', { selected: [img] });
  });
  await new Promise(r => setTimeout(r, 500));
  const flipBefore = await page.evaluate(() => window.__fc.getActiveObject()?.flipX);
  await clickBtn('^Flip H$');
  await new Promise(r => setTimeout(r, 300));
  const flipAfter = await page.evaluate(() => window.__fc.getActiveObject()?.flipX);
  ok('Flip H toggles flipX', flipAfter === !flipBefore, `${flipBefore} → ${flipAfter}`);
  await clickBtn('^Flip H$');
  await new Promise(r => setTimeout(r, 300));

  await clickBtn('^Circle$');
  await new Promise(r => setTimeout(r, 400));
  const maskType = await page.evaluate(() => window.__fc.getActiveObject()?.clipPath?.type ?? 'none');
  ok('circle mask sets a circle clipPath', maskType === 'circle', `got ${maskType}`);
  await clickBtn('^None$');
  await new Promise(r => setTimeout(r, 300));
  ok('mask None clears clipPath', await page.evaluate(() => !window.__fc.getActiveObject()?.clipPath));

  const gray = await page.evaluate(() => {
    const t = [...document.querySelectorAll('[role="switch"]')].find(x => x.textContent.trim() === 'Grayscale');
    if (!t) return null;
    t.click();
    return true;
  });
  await new Promise(r => setTimeout(r, 500));
  const grayOn = await page.evaluate(() => (window.__fc.getActiveObject()?.filters ?? []).some(f => /grayscale/i.test(f.type)));
  ok('grayscale toggle adds a Grayscale filter', gray === true && grayOn, `clicked=${gray} on=${grayOn}`);
  await page.evaluate(() => {
    [...document.querySelectorAll('[role="switch"]')].find(x => x.textContent.trim() === 'Grayscale')?.click();
  });
  await new Promise(r => setTimeout(r, 400));
  ok('grayscale toggle off removes the filter', await page.evaluate(() => !(window.__fc.getActiveObject()?.filters ?? []).some(f => /grayscale/i.test(f.type))));

  /* 19 — position / blend / shadow */
  console.log('\nposition & effects');
  const w0 = await page.evaluate(() => Math.round(window.__fc.getActiveObject().getScaledWidth()));
  await page.evaluate((target) => {
    const inp = document.querySelector('input[aria-label="Width"]');
    if (!inp) return;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(inp, String(target));
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  }, w0 + 40);
  await new Promise(r => setTimeout(r, 400));
  const w1 = await page.evaluate(() => Math.round(window.__fc.getActiveObject().getScaledWidth()));
  ok('width input resizes the object', w1 === w0 + 40, `${w0} → ${w1}`);

  await page.select('select[aria-label="Blend mode"]', 'multiply');
  await new Promise(r => setTimeout(r, 300));
  ok('blend mode select applies', await page.evaluate(() => window.__fc.getActiveObject()?.globalCompositeOperation === 'multiply'));
  await page.select('select[aria-label="Blend mode"]', 'source-over');
  await new Promise(r => setTimeout(r, 300));

  const shadow = await page.evaluate(() => {
    const t = [...document.querySelectorAll('[role="switch"]')].find(x => x.textContent.trim() === 'Drop shadow');
    if (!t) return null;
    t.click();
    return true;
  });
  await new Promise(r => setTimeout(r, 400));
  ok('drop shadow toggle adds a shadow', shadow === true && await page.evaluate(() => !!window.__fc.getActiveObject()?.shadow), `clicked=${shadow}`);
  await page.evaluate(() => {
    [...document.querySelectorAll('[role="switch"]')].find(x => x.textContent.trim() === 'Drop shadow')?.click();
  });
  await new Promise(r => setTimeout(r, 300));

  /* template permission checkboxes (author mode) */
  const perm = await page.evaluate(() => {
    const lbl = [...document.querySelectorAll('label')].find(x => x.textContent.trim() === 'Movable');
    const box = lbl?.querySelector('input[type="checkbox"]');
    if (!box) return null;
    const before = box.checked;
    box.click();
    return { before, after: box.checked };
  });
  ok('template permission checkbox toggles', !!perm && perm.before !== perm.after, JSON.stringify(perm));
  if (perm) {
    ok('kMovable written to the object', await page.evaluate(() => window.__fc.getActiveObject()?.kMovable === false));
    await page.evaluate(() => { [...document.querySelectorAll('label')].find(x => x.textContent.trim() === 'Movable')?.querySelector('input')?.click(); });
    await new Promise(r => setTimeout(r, 300));
  }

  /* 20 — layers panel: visibility eye + folder create */
  console.log('\nlayers panel extras');
  await page.evaluate(() => {
    if (!document.querySelector('.s-layer')) {
      [...document.querySelectorAll('button')].find(x => x.textContent.trim().toUpperCase() === 'LAYERS')?.click();
    }
  });
  await new Promise(r => setTimeout(r, 500));
  const eye = await page.evaluate(() => {
    const c = window.__fc;
    const target = c.getObjects().find(o => /textbox/i.test(o.type) && /SUMMER/i.test(o.text ?? ''));
    const row = [...document.querySelectorAll('.s-layer')].find(r => r.textContent.includes(target.kName));
    const btn = row && [...row.querySelectorAll('button')].find(b => /hide|show|visibility|visible/i.test((b.title ?? '') + (b.getAttribute('aria-label') ?? '')));
    if (!btn) return null;
    const wasVisible = target.visible;
    btn.click();
    return { wasVisible, name: target.kName };
  });
  await new Promise(r => setTimeout(r, 400));
  const visNow = await page.evaluate(() => {
    const t = window.__fc.getObjects().find(o => /textbox/i.test(o.type) && /SUMMER/i.test(o.text ?? ''));
    return t?.visible;
  });
  ok('layers eye toggles object visibility', !!eye && visNow === !eye.wasVisible, JSON.stringify({ eye, visNow }));
  await page.evaluate(() => {
    const t = window.__fc.getObjects().find(o => /textbox/i.test(o.type) && /SUMMER/i.test(o.text ?? ''));
    const row = [...document.querySelectorAll('.s-layer')].find(r => r.textContent.includes(t.kName));
    const btn = row && [...row.querySelectorAll('button')].find(b => /hide|show|visibility|visible/i.test((b.title ?? '') + (b.getAttribute('aria-label') ?? '')));
    btn?.click();
  });
  await new Promise(r => setTimeout(r, 300));

  /* 21 — pages: add / duplicate / delete / switch-back */
  console.log('\npages');
  const openPages = () => page.evaluate(() => {
    if (![...document.querySelectorAll('button')].some(b => b.title === 'Open page · double-click to rename')) {
      [...document.querySelectorAll('button')].find(x => x.textContent.trim().toUpperCase() === 'PAGES')?.click();
    }
  });
  await openPages();
  await new Promise(r => setTimeout(r, 500));
  const pageCount = () => page.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.title === 'Open page · double-click to rename').length);
  const pages0 = await pageCount();
  await clickBtn('^\\+ New page$');
  await new Promise(r => setTimeout(r, 900));
  ok('new page adds a row', (await pageCount()) === pages0 + 1, `got ${await pageCount()} want ${pages0 + 1}`);
  const onBlank = await page.evaluate(() => window.__fc.getObjects().length);
  ok('new page switches to a blank canvas', onBlank === 0, `got ${onBlank}`);
  const dupeBtn = await page.evaluate(() => {
    const row = document.querySelector('.s-layer.s-layer-active');
    const b = row && [...row.querySelectorAll('button')].find(x => x.title === 'Duplicate page');
    if (b) { b.click(); return true; }
    return false;
  });
  await new Promise(r => setTimeout(r, 900));
  ok('duplicate page button adds a row', dupeBtn === true && (await pageCount()) === pages0 + 2, `got ${await pageCount()}`);
  const delBtn = await page.evaluate(() => {
    const row = document.querySelector('.s-layer.s-layer-active');
    const b = row && [...row.querySelectorAll('button')].find(x => x.title === 'Delete page');
    if (b) { b.click(); return true; }
    return false;
  });
  await new Promise(r => setTimeout(r, 900));
  ok('delete page button removes a row', delBtn === true && (await pageCount()) === pages0 + 1, `got ${await pageCount()}`);
  /* switch back to page 1 and confirm objects restore */
  await page.evaluate(() => { [...document.querySelectorAll('button')].find(b => b.title === 'Open page · double-click to rename')?.click(); });
  await new Promise(r => setTimeout(r, 900));
  const backHome = await page.evaluate(() => window.__fc.getObjects().length);
  ok('switching back to page 1 restores its objects', backHome >= 5, `got ${backHome}`);
  /* cleanup: remove the extra blank page so later sections see the template */
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.s-layer')].filter(r => r.querySelector('button[title="Open page · double-click to rename"]'));
    rows[rows.length - 1]?.querySelector('button[title="Open page · double-click to rename"]')?.click();
  });
  await new Promise(r => setTimeout(r, 700));
  await page.evaluate(() => {
    const row = document.querySelector('.s-layer.s-layer-active');
    [...(row?.querySelectorAll('button') ?? [])].find(x => x.title === 'Delete page')?.click();
  });
  await new Promise(r => setTimeout(r, 900));
  await page.evaluate(() => { [...document.querySelectorAll('button')].find(b => b.title === 'Open page · double-click to rename')?.click(); });
  await new Promise(r => setTimeout(r, 900));

  /* 22 — export dialog controls */
  console.log('\nexport dialog');
  await clickBtn('^Download$');
  await new Promise(r => setTimeout(r, 900));
  ok('export dialog opens', await dialogOpen('Download design'));
  const fmtBtns = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"][aria-label="Download design"] button')]
    .map(b => b.textContent.trim()).filter(t => /^(png|jpg|svg|pdf|psd)/i.test(t)));
  ok('export dialog lists format options', fmtBtns.length >= 2, JSON.stringify(fmtBtns));
  await page.evaluate(() => {
    [...document.querySelectorAll('[role="dialog"][aria-label="Download design"] button')]
      .find(b => /^jpg/i.test(b.textContent.trim()))?.click();
  });
  await new Promise(r => setTimeout(r, 500));
  ok('JPG format reveals quality slider', await page.evaluate(() => /JPG Quality/i.test(document.body.textContent)));
  await page.evaluate(() => {
    [...document.querySelectorAll('[role="dialog"][aria-label="Download design"] button')]
      .find(b => b.textContent.trim() === 'Cancel')?.click();
  });
  await new Promise(r => setTimeout(r, 400));
  ok('export dialog cancels cleanly', !(await dialogOpen('Download design')));

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
