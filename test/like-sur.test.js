// Le « J'aime » sur une réponse (audit/15, lot 2). Ce que le serveur accepte : une question **qui
// est sur la fiche de la cible**, et un mot borné qui passe par l'anti-arnaque **avant** que le
// balayage soit rangé. Ce qu'il en fait : la clé de la question en événement (jamais le mot), le
// mot en premier message au match, et rien qui sorte avant. Ce qui l'emporte : revenir sur le
// balayage, et supprimer le compte.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-like-sur-'));
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.WEBAPP_URL = 'https://exemple.test';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.SEED_DEMO = 'false';
process.env.AUTO_APPROVE = 'false';
process.env.RATE_LIMIT = 'false';

const express = (await import('express')).default;
const { store } = await import('../server/store.js');
const pid = async (id) => (await store.getUser(id))?.pid;
const { bot } = await import('../server/bot.js');
const { api, MOT_MAX, lireLeJaimeSurReponse } = await import('../server/routes.js');

bot.api.sendMessage = async () => ({});

const app = express();
app.use(express.json());
app.use('/api', api);
const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api`;
test.after(() => server.close());
const call = async (user, p, method = 'GET', body) => {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', 'x-dev-user': user }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
async function creer(id, name, gender, extra = {}) {
  await call(id, '/me');
  const r = await call(id, '/me/profile', 'PUT', { name, age: 25, gender, intent: 'amitie', city: 'Yaoundé', promptQ: 'rire', promptA: 'Mes cousins quand ils imitent notre grand-mère', ...extra });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  await store.updateUser(id, { verification: 'approved' });
}
const evenements = async (k, u) => (await store.events({ k })).filter((e) => e.u === String(u));
const attendre = async (fn, n = 100) => { for (let i = 0; i < n; i += 1) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 10)); } return fn(); };

test.before(async () => {
  await creer('7101', 'Awa', 'femme');
  // Une seconde question sur sa fiche — par le stockage, parce qu'en ajouter une par la route
  // demande un pass, et ce n'est pas le pass qu'on teste ici.
  const awa = await store.getUser('7101');
  await store.updateUser('7101', { profile: { ...awa.profile, extras: [{ q: 'weekend', a: 'Un brunch, puis la messe de 18 h' }] } });
  await creer('7102', 'Ben', 'homme');
  await creer('7103', 'Cam', 'homme');
  await creer('7104', 'Dan', 'homme');
});

test("la question visée doit être sur la fiche de la cible, et le mot est borné", () => {
  const cible = { profile: { promptQ: 'rire', extras: [{ q: 'weekend', a: 'x' }] } };
  assert.deepEqual(lireLeJaimeSurReponse({}, cible), {}, 'sans `sur`, rien ne change');
  assert.deepEqual(lireLeJaimeSurReponse({ sur: 'rire', mot: '  Moi   aussi ' }, cible), { sur: 'rire', mot: 'Moi aussi' });
  assert.deepEqual(lireLeJaimeSurReponse({ sur: { q: 'weekend' } }, cible), { sur: 'weekend', mot: null }, 'le mot est facultatif');
  assert.equal(lireLeJaimeSurReponse({ sur: 'chanson' }, cible).erreur.code, 'SWIPE_INVALID', "une question qu'elle n'a pas");
  assert.equal(lireLeJaimeSurReponse({ sur: 'rire', mot: 'a'.repeat(MOT_MAX + 1) }, cible).erreur.code, 'MOT_TROP_LONG');
  assert.equal(lireLeJaimeSurReponse({ sur: 'rire', mot: 'a'.repeat(MOT_MAX) }, cible).mot.length, MOT_MAX);
  assert.equal(lireLeJaimeSurReponse({ sur: 'rire', mot: 'Envoie-moi 5000 FCFA' }, cible).bloque.code, 'MONEY_BLOCKED', "l'anti-arnaque lit le mot comme un message");
});

test("un « J'aime » sur une réponse se range avec sa question et son mot, et l'événement ne porte que la clé", async () => {
  const r = await call('7102', '/swipes', 'POST', { targetId: await pid('7101'), action: 'like', sur: 'weekend', mot: 'Le brunch, on y va ?' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.match, null);
  const s = await store.swipeOf('7102', '7101');
  assert.equal(s.action, 'like');
  assert.equal(s.sur, 'weekend');
  assert.equal(s.mot, 'Le brunch, on y va ?');
  assert.ok(await attendre(async () => (await evenements('like_sur', '7102')).length === 1));
  const [e] = await evenements('like_sur', '7102');
  assert.deepEqual(e.p, { q: 'weekend' }, 'la clé de la question, jamais le mot');
  assert.ok(!JSON.stringify(e).includes('brunch'));
});

test("un mot refusé par l'anti-arnaque ne range aucun balayage, même sans le mot", async () => {
  const r = await call('7103', '/swipes', 'POST', { targetId: await pid('7101'), action: 'like', sur: 'rire', mot: 'Écris-moi au 677 12 34 56' });
  assert.equal(r.status, 422);
  assert.ok(['CONTACT_TOO_EARLY', 'MONEY_BLOCKED'].includes(r.body.code), r.body.code);
  assert.equal(await store.swipeOf('7103', '7101'), null, "le « J'aime » n'existe pas");
  assert.equal((await evenements('like_sur', '7103')).length, 0);
  const mauvaise = await call('7103', '/swipes', 'POST', { targetId: await pid('7101'), action: 'like', sur: 'chanson', mot: 'Moi aussi' });
  assert.equal(mauvaise.status, 400);
  assert.equal(await store.swipeOf('7103', '7101'), null, 'une question absente de la fiche non plus');
});

test("au match, le mot devient le premier message, l'écran de match et la discussion nomment la réponse aimée", async () => {
  // Awa rend le « J'aime » de Ben, avec un mot sur sa réponse à lui.
  const r = await call('7101', '/swipes', 'POST', { targetId: await pid('7102'), action: 'like', sur: 'rire', mot: 'Tes cousins ont l\'air drôles' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.match);
  // Ce que Ben a aimé chez Awa, pour l'écran de match d'Awa : la question et son mot.
  assert.deepEqual(r.body.match.aime, { q: 'weekend', mot: 'Le brunch, on y va ?' });
  const fil = await store.messagesOf(r.body.match.id);
  assert.deepEqual(fil.map((m) => [m.from, m.text]), [['7102', 'Le brunch, on y va ?'], ['7101', 'Tes cousins ont l\'air drôles']], "les deux mots, dans l'ordre des « J'aime »");
  // La discussion, côté Ben : il apprend ce qu'Awa a aimé de lui ; le mot est déjà dans le fil.
  const chatBen = await call('7102', `/matches/${r.body.match.id}`);
  assert.deepEqual(chatBen.body.aime, { q: 'rire' });
  assert.equal(chatBen.body.messages.length, 2);
  // Un second appel (suivi) ne renvoie pas `aime` : c'est du premier chargement seulement.
  const suivi = await call('7102', `/matches/${r.body.match.id}?suivi=1&after=0`);
  assert.equal(suivi.body.aime, undefined);
  // Et rien de plus ne s'est écrit : un second passage du même « J'aime » ne double pas le fil.
  const encore = await call('7101', '/swipes', 'POST', { targetId: await pid('7102'), action: 'like' });
  assert.equal(encore.body.match.id, r.body.match.id);
  assert.equal((await store.messagesOf(r.body.match.id)).length, 2);
});

test("un « J'aime » sans réponse visée ne porte ni question ni mot, et n'ouvre pas de premier message", async () => {
  await call('7104', '/swipes', 'POST', { targetId: await pid('7101'), action: 'like', mot: 'Un mot sans question' });
  const s = await store.swipeOf('7104', '7101');
  assert.equal(s.sur, undefined);
  assert.equal(s.mot, undefined, 'un mot sans question visée est ignoré');
  const r = await call('7101', '/swipes', 'POST', { targetId: await pid('7104'), action: 'like' });
  assert.ok(r.body.match);
  assert.equal(r.body.match.aime, undefined);
  assert.deepEqual(await store.messagesOf(r.body.match.id), []);
});

test("revenir sur le balayage emporte le mot, et supprimer le compte aussi", async () => {
  await creer('7105', 'Eva', 'femme');
  await creer('7106', 'Fred', 'homme');
  await call('7106', '/swipes', 'POST', { targetId: await pid('7105'), action: 'like', sur: 'rire', mot: 'Moi aussi' });
  assert.equal((await store.swipeOf('7106', '7105')).mot, 'Moi aussi');
  const retour = await call('7106', `/swipes/${await pid('7105')}`, 'DELETE');
  assert.equal(retour.status, 200);
  assert.equal(await store.swipeOf('7106', '7105'), null);
  await call('7106', '/swipes', 'POST', { targetId: await pid('7105'), action: 'like', sur: 'rire', mot: 'Encore moi' });
  await call('7106', '/me', 'DELETE');
  assert.equal(await store.swipeOf('7106', '7105'), null, 'le compte part avec ses « J\'aime » et leurs mots');
});
