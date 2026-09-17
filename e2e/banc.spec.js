// Banc de mesure : ce que ressent un téléphone d'entrée de gamme sur un réseau moyen.
// Processeur bridé ×4, réseau 1,6 Mb/s descendant, 150 ms de latence (300 ms d'aller-retour).
//
// `npm run mesure` (scripts/mesure.js) : il ne tourne **pas** avec `npm run e2e` — ses chiffres
// varient d'une machine à l'autre, et un banc n'est pas un test. Il écrit `.mesure.json` et
// affiche un résumé. Les chiffres de référence sont dans audit/14-fluidite.md.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
test.skip(!process.env.MESURE, 'banc de mesure : npm run mesure');
const OUT = process.env.MESURE_SORTIE || path.join(process.cwd(), '.mesure.json');
const R = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const save = () => fs.writeFileSync(OUT, JSON.stringify(R, null, 2));
const JPEG = (page, r, g, b) => page.evaluate(([r, g, b]) => { const c = document.createElement('canvas'); c.width = 720; c.height = 900; const x = c.getContext('2d'); x.fillStyle = `rgb(${r},${g},${b})`; x.fillRect(0, 0, 720, 900); for (let i = 0; i < 400; i++) { x.fillStyle = `hsl(${(i * 37) % 360} 60% ${40 + (i % 40)}%)`; x.fillRect((i * 97) % 700, (i * 53) % 880, 30, 30); } return c.toDataURL('image/jpeg', 0.85); }, [r, g, b]);
const p = (arr, q) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : null; };

async function membre(request, page, id, { name, gender, photo }) {
  const h = { 'x-dev-user': id, 'content-type': 'application/json' };
  await request.get('/api/me', { headers: h });
  await request.put('/api/me/profile', { headers: h, data: { name, age: 26, gender, intent: 'amitie', city: 'Yaoundé', promptA: 'Le poisson braisé', languages: 'Français' } });
  const g = await (await request.post('/api/me/verification/start', { headers: h, data: {} })).json();
  const selfie = await JPEG(page, 120, 90, 70);
  const v = await request.post('/api/me/verification', { headers: h, data: { selfie, gesture: g.gesture } });
  if (v.status() >= 300) throw new Error(`verif ${v.status()} ${await v.text()}`);
  if (photo) await request.put('/api/me/photos/1', { headers: h, data: { photo: await JPEG(page, ...photo) } });
  // AUTO_APPROVE valide en différé : on attend le badge avant d'ouvrir l'app.
  for (let i = 0; i < 40; i++) {
    const me = await (await request.get('/api/me', { headers: h })).json();
    if (me.verification === 'approved') return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vérification jamais validée');
}
// Les deux écrans « une seule fois » (jauge, voix) sont déjà vus : on mesure l'app, pas l'inscription.
const DEJA_VU = "try { localStorage.setItem('jauge_vue', '1'); localStorage.setItem('voix_vue', '1'); } catch {}";
async function brider(page, { cpu = 4, reseau = true } = {}) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  if (reseau) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  return cdp;
}
const OBS = `
  window.__lt = []; window.__ev = [];
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push({ t: Math.round(e.startTime), d: Math.round(e.duration) }))).observe({ type: 'longtask', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (e.duration >= 40) window.__ev.push({ n: e.name, t: Math.round(e.startTime), d: Math.round(e.duration) }); })).observe({ type: 'event', buffered: true, durationThreshold: 40 }); } catch {}
`;

test('1. chargement à froid, puis à chaud', async ({ browser, request, page }) => {
  const id = `perf-a-${Date.now()}`;
  await page.goto('/');
  await membre(request, page, id, { name: 'Perf', gender: 'femme', photo: [40, 60, 200] });
  // Un contexte neuf, sans cache : le premier lancement.
  const ctx = await browser.newContext({ viewport: { width: 393, height: 851 }, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Africa/Douala' });
  const pg = await ctx.newPage();
  await pg.addInitScript(OBS); await pg.addInitScript(DEJA_VU);
    const cdp = await brider(pg);
  const res = new Map();
  cdp.on('Network.responseReceived', (e) => res.set(e.requestId, { url: e.response.url, type: e.type, statut: e.response.status, octets: 0 }));
  cdp.on('Network.loadingFinished', (e) => { const r = res.get(e.requestId); if (r) r.octets = e.encodedDataLength; });
  const t0 = Date.now();
  await pg.goto(`/?dev_user=${id}`);
  await pg.locator('.deck .card.top, main h1').first().waitFor();
  const tPremier = Date.now() - t0;
  await pg.locator('.deck .card.top').waitFor({ timeout: 30000 });
  const tPaquet = Date.now() - t0;
  await pg.waitForTimeout(2500);
  const nav = await pg.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), ttfb: Math.round(n.responseStart) }; });
  const lt = await pg.evaluate(() => window.__lt);
  const liste = [...res.values()].filter((r) => r.octets > 0);
  const total = liste.reduce((n, r) => n + r.octets, 0);
  const parType = {};
  for (const r of liste) parType[r.type] = (parType[r.type] || 0) + r.octets;
  R.chargement = { premierEcranMs: tPremier, paquetMs: tPaquet, ...nav, requetes: liste.length, octets: total, parType, longTasks: lt.length, longTasksMs: lt.reduce((n, x) => n + x.d, 0), top: liste.sort((a, b) => b.octets - a.octets).slice(0, 12).map((r) => ({ url: r.url.replace(/^https?:\/\/[^/]+/, '').slice(0, 70), type: r.type, ko: Math.round(r.octets / 100) / 10 })) };
  // À chaud : le même contexte, une seconde ouverture.
  const t1 = Date.now();
  await pg.goto(`/?dev_user=${id}`);
  await pg.locator('.deck .card.top').waitFor({ timeout: 30000 });
  R.chargement.chaudMs = Date.now() - t1;
  save();
  await ctx.close();
});

test('2. changer d’onglet, ouvrir une fiche', async ({ browser, request, page }) => {
  const id = `perf-b-${Date.now()}`;
  await page.goto('/');
  await membre(request, page, id, { name: 'Perf', gender: 'femme', photo: [200, 60, 60] });
  const ctx = await browser.newContext({ viewport: { width: 393, height: 851 }, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Africa/Douala' });
  const pg = await ctx.newPage();
  await pg.addInitScript(OBS); await pg.addInitScript(DEJA_VU);
  await brider(pg);
  await pg.goto(`/?dev_user=${id}`);
  await pg.locator('.deck .card.top').waitFor({ timeout: 30000 });
  await pg.waitForTimeout(1500);
  const mesures = [];
  const onglet = async (nom, attendu) => {
    await pg.evaluate(() => { window.__lt = []; window.__ev = []; });
    const t = Date.now();
    await pg.locator('#tabs [role="tab"]', { hasText: nom }).click();
    await pg.locator(attendu).first().waitFor({ timeout: 20000 });
    const rendu = Date.now() - t;
    await pg.waitForTimeout(800);
    const lt = await pg.evaluate(() => window.__lt);
    const ev = await pg.evaluate(() => window.__ev);
    const dom = await pg.evaluate(() => document.querySelectorAll('*').length);
    mesures.push({ ecran: nom, renduMs: rendu, longTasks: lt.length, longTasksMs: lt.reduce((n, x) => n + x.d, 0), pireTacheMs: Math.max(0, ...lt.map((x) => x.d)), interactionMs: Math.max(0, ...ev.map((x) => x.d)), dom });
  };
  await onglet('Messages', 'main .group, main .empty');
  await onglet('Profil', 'main .me-head, main .list');
  await onglet('Sécurité', 'main h1, main .list');
  await onglet('Découvrir', '.deck .card.top');
  // Ouvrir la fiche depuis la carte
  await pg.evaluate(() => { window.__lt = []; });
  const t = Date.now();
  await pg.locator('.deck .card.top .more, .deck .card.top [data-action="person"]').first().click().catch(() => {});
  await pg.waitForTimeout(900);
  const lt = await pg.evaluate(() => window.__lt);
  mesures.push({ ecran: 'fiche', renduMs: Date.now() - t, longTasks: lt.length, longTasksMs: lt.reduce((n, x) => n + x.d, 0) });
  R.navigation = mesures;
  save();
  await ctx.close();
});

test('3. balayer une carte', async ({ browser, request, page }) => {
  const id = `perf-c-${Date.now()}`;
  await page.goto('/');
  await membre(request, page, id, { name: 'Perf', gender: 'femme' });
  const ctx = await browser.newContext({ viewport: { width: 393, height: 851 }, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Africa/Douala' });
  const pg = await ctx.newPage();
  await pg.addInitScript(OBS); await pg.addInitScript(DEJA_VU);
  await brider(pg, { reseau: false });
  await pg.goto(`/?dev_user=${id}`);
  const carte = pg.locator('.deck .card.top');
  await carte.waitFor({ timeout: 30000 });
  await pg.waitForTimeout(1500);
  const box = await carte.boundingBox();
  const x0 = box.x + box.width / 2, y0 = box.y + box.height / 2;
  const releves = [];
  for (let essai = 0; essai < 3; essai++) {
    await pg.evaluate(() => { window.__frames = []; let last = performance.now(); const tic = (t) => { window.__frames.push(t - last); last = t; if (window.__frames.length < 200) requestAnimationFrame(tic); }; requestAnimationFrame(tic); });
    await pg.mouse.move(x0, y0);
    await pg.mouse.down();
    for (let i = 1; i <= 30; i++) { await pg.mouse.move(x0 + i * 3, y0 + i * 0.5); await pg.waitForTimeout(16); }
    for (let i = 30; i >= 0; i--) { await pg.mouse.move(x0 + i * 3, y0); await pg.waitForTimeout(16); }
    await pg.mouse.up();
    await pg.waitForTimeout(600);
    const frames = await pg.evaluate(() => window.__frames.slice(1));
    releves.push({ p50: Math.round(p(frames, 0.5)), p95: Math.round(p(frames, 0.95)), max: Math.round(Math.max(...frames)), lentes: frames.filter((f) => f > 50).length, n: frames.length });
  }
  R.balayage = releves;
  save();
  await ctx.close();
});

test('4. la discussion : frappe, message, réseau au repos', async ({ browser, request, page }) => {
  test.setTimeout(180000);
  const a = `perf-d-a-${Date.now()}`, b = `perf-d-b-${Date.now()}`;
  await page.goto('/');
  await membre(request, page, a, { name: 'Ama', gender: 'femme' });
  await membre(request, page, b, { name: 'Bob', gender: 'homme' });
  const ha = { 'x-dev-user': a, 'content-type': 'application/json' }, hb = { 'x-dev-user': b, 'content-type': 'application/json' };
  const pidA = (await (await request.get('/api/me', { headers: ha })).json()).publicProfile.id;
  const pidB = (await (await request.get('/api/me', { headers: hb })).json()).publicProfile.id;
  await request.post('/api/swipes', { headers: ha, data: { targetId: pidB, action: 'like' } });
  const m = await (await request.post('/api/swipes', { headers: hb, data: { targetId: pidA, action: 'like' } })).json();
  const matchId = m.matchId || m.match?.id;
  expect(matchId).toBeTruthy();
  const ctxA = await browser.newContext({ viewport: { width: 393, height: 851 }, isMobile: true, hasTouch: true, locale: 'fr-FR' });
  const ctxB = await browser.newContext({ viewport: { width: 393, height: 851 }, isMobile: true, hasTouch: true, locale: 'fr-FR' });
  const pa = await ctxA.newPage(), pb = await ctxB.newPage();
  await pa.addInitScript(DEJA_VU); await pb.addInitScript(DEJA_VU);
  await brider(pa, { cpu: 2 }); const cdpB = await brider(pb, { cpu: 2 });
  let reqB = 0; cdpB.on('Network.requestWillBeSent', (e) => { if (e.request.url.includes('/api/')) reqB += 1; });
  await pa.goto(`/?dev_user=${a}&screen=chat&match=${matchId}`);
  await pb.goto(`/?dev_user=${b}&screen=chat&match=${matchId}`);
  await pa.locator('.composer input').waitFor({ timeout: 30000 });
  await pb.locator('.composer input').waitFor({ timeout: 30000 });
  await pa.waitForTimeout(3000); await pb.waitForTimeout(3000);
  // (a) frappe : A tape, quand B voit-il l'indicateur ?
  reqB = 0; const tRepos = Date.now();
  await pb.waitForTimeout(30000);
  const requetesAuReposParMin = Math.round((reqB * 60000) / (Date.now() - tRepos));
  const t1 = Date.now();
  await pa.locator('.composer input').pressSequentially('Salut, ça va ?', { delay: 60 });
  let frappeMs = null;
  try { await pb.locator('#chat-frappe .frappe, .frappe, .bubble.frappe').first().waitFor({ timeout: 15000 }); frappeMs = Date.now() - t1; } catch { frappeMs = 'jamais (15 s)'; }
  // (b) message : A envoie, quand B le voit-il ?
  const t2 = Date.now();
  await pa.locator('.composer .send').click();
  await pb.locator('.bubble.theirs', { hasText: 'Salut' }).waitFor({ timeout: 15000 });
  const messageMs = Date.now() - t2;
  // (c) accusé : A voit-il que B a lu ?
  let luMs = null;
  const t3 = Date.now();
  try { await pa.locator('.bubble.mine.lu, .bubble.mine .lu').first().waitFor({ timeout: 10000 }); luMs = Date.now() - t3; } catch { luMs = 'aucun accusé de lecture'; }
  R.discussion = { requetesAuReposParMin, frappeMs, messageMs, luMs };
  save();
  await ctxA.close(); await ctxB.close();
});

test('5. temps de réponse de l’API', async ({ request, page }) => {
  const id = `perf-e-${Date.now()}`;
  await page.goto('/');
  await membre(request, page, id, { name: 'Perf', gender: 'femme' });
  const h = { 'x-dev-user': id };
  const chemins = ['/api/me', '/api/discover', '/api/matches', '/api/summary', '/api/likes', '/api/vues'];
  const out = {};
  for (const c of chemins) {
    const ts = [];
    for (let i = 0; i < 15; i++) { const t = process.hrtime.bigint(); const r = await request.get(c, { headers: h }); await r.text(); ts.push(Number(process.hrtime.bigint() - t) / 1e6); }
    out[c] = { p50: Math.round(p(ts, 0.5) * 10) / 10, p95: Math.round(p(ts, 0.95) * 10) / 10 };
  }
  R.api = out;
  save();
});
