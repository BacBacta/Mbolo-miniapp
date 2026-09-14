// Les portes que la revue du 14 septembre 2026 a trouvées ouvertes (audit/09-revue-code.md, C3,
// I2), rejouées contre l'API. Chaque test dit d'abord ce qui passait.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-portes-'));
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.WEBAPP_URL = 'https://exemple.test';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.SEED_DEMO = 'false';
process.env.AUTO_APPROVE = 'false';

const express = (await import('express')).default;
const { store } = await import('../server/store.js');
const { bot } = await import('../server/bot.js');
const { api } = await import('../server/routes.js');

const envoyes = [];
bot.api.sendMessage = async (id, text) => { envoyes.push({ id: String(id), text }); return {}; };

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
  const r = await call(id, '/me/profile', 'PUT', { name, age: 25, gender, intent: 'amitie', city: 'Yaoundé', promptA: 'Le poisson braisé', ...extra });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  await store.updateUser(id, { verification: 'approved' });
}
async function matcher(a, b) {
  await call(a, '/swipes', 'POST', { targetId: b, action: 'like' });
  const r = await call(b, '/swipes', 'POST', { targetId: a, action: 'like' });
  assert.ok(r.body.match, JSON.stringify(r.body));
  return r.body.match.id;
}
const respirer = (ms = 60) => new Promise((r) => setTimeout(r, ms));

// ---------- C3 : un like par identifiant ne regardait pas la cible ----------

test("après un blocage, un like ne recrée pas le match et n'envoie rien à la personne qui a bloqué", async () => {
  await creer('p1', 'Fatou', 'femme'); await creer('p2', 'Hervé', 'homme');
  const m = await matcher('p1', 'p2');
  assert.equal((await call('p1', '/blocks', 'POST', { targetId: 'p2' })).status, 200);
  assert.equal(await store.getMatch(m), null, 'le blocage a défait le match');
  await respirer(); envoyes.length = 0;

  const r = await call('p2', '/swipes', 'POST', { targetId: 'p1', action: 'like' });
  assert.equal(r.status, 403, JSON.stringify(r.body));
  assert.equal(r.body.code, 'SWIPE_INVALID');
  await respirer();
  assert.equal(await store.matchBetween('p1', 'p2'), null, 'aucun match recréé');
  assert.equal(envoyes.filter((e) => e.id === 'p1').length, 0, 'Fatou ne reçoit rien');
  // Et dans l'autre sens non plus : qui a bloqué ne peut pas non plus liker par identifiant.
  assert.equal((await call('p1', '/swipes', 'POST', { targetId: 'p2', action: 'like' })).status, 403);
});

test("après un match défait, le like de l'autre ne le ressuscite pas", async () => {
  await creer('p3', 'Grâce', 'femme'); await creer('p4', 'Idriss', 'homme');
  const m = await matcher('p3', 'p4');
  assert.equal((await call('p3', `/matches/${m}`, 'DELETE')).status, 200);
  await respirer(); envoyes.length = 0;

  const r = await call('p4', '/swipes', 'POST', { targetId: 'p3', action: 'like' });
  assert.equal(r.status, 200, 'Idriss peut toujours dire qu\'il aime : il ne sait pas qu\'on l\'a défait');
  assert.equal(r.body.match, null, 'mais rien ne se refait sans Grâce');
  await respirer();
  assert.equal(envoyes.filter((e) => e.id === 'p3').length, 0, 'et Grâce n\'est pas prévenue');
  // Grâce ne le revoit pas dans sa découverte : elle l'a déjà balayé.
  const deck = (await call('p3', '/discover')).body.profiles.map((p) => p.id);
  assert.ok(!deck.includes('p4'));
  // Si elle revient vers lui, c'est son choix, et le match se refait.
  const retour = await call('p3', '/swipes', 'POST', { targetId: 'p4', action: 'like' });
  assert.ok(retour.body.match, 'un « passer » peut redevenir un « j\'aime »');
});

test('un like vers un compte non vérifié, fermé, ou sans profil est refusé — sans 500', async () => {
  await creer('p5', 'Josiane', 'femme');
  await call('p6', '/me'); // existe, sans profil
  await creer('p7', 'Kofi', 'homme'); await store.updateUser('p7', { verification: 'pending' });
  await creer('p8', 'Léon', 'homme'); await store.banUser('p8', { motif: 'test', par: 'test' });
  for (const cible of ['p6', 'p7', 'p8']) {
    const r = await call('p5', '/swipes', 'POST', { targetId: cible, action: 'like' });
    assert.equal(r.status, 403, `${cible} : ${JSON.stringify(r.body)}`);
  }
  assert.equal((await call('p5', '/swipes', 'POST', { targetId: 'inconnu', action: 'like' })).status, 400);
});

test('un second like sur un match existant ne renotifie pas', async () => {
  await creer('p9', 'Mireille', 'femme'); await creer('p10', 'Nicolas', 'homme');
  const m = await matcher('p9', 'p10');
  await respirer(); envoyes.length = 0;
  const r = await call('p9', '/swipes', 'POST', { targetId: 'p10', action: 'like' });
  assert.equal(r.status, 200);
  assert.equal(r.body.match.id, m, 'le même match');
  await respirer();
  assert.equal(envoyes.length, 0);
});

// ---------- I2 : les listes fermées lues par LISTE[valeur] ----------

test('les clés du prototype ne sont ni un genre, ni une intention, ni une réponse, ni un filtre', async () => {
  await call('q1', '/me');
  const base = { name: 'Odile', age: 25, city: 'Yaoundé', promptA: 'Le poisson braisé' };
  for (const cle of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
    let r = await call('q1', '/me/profile', 'PUT', { ...base, gender: cle, intent: 'amitie' });
    assert.equal(r.status, 400, `genre ${cle}`); assert.equal(r.body.code, 'GENDER_REQUIRED');
    r = await call('q1', '/me/profile', 'PUT', { ...base, gender: 'femme', intent: cle });
    assert.equal(r.status, 400, `intention ${cle}`); assert.equal(r.body.code, 'INTENT_REQUIRED');
    r = await call('q1', '/me/profile', 'PUT', { ...base, gender: 'femme', intent: 'serieux', compat: { mariage: cle } });
    assert.equal(r.status, 400, `compat ${cle}`); assert.equal(r.body.code, 'COMPAT_INVALID');
  }
  await creer('q1', 'Odile', 'femme');
  for (const cle of ['constructor', '__proto__']) {
    const r = await call('q1', '/me/filters', 'PUT', { gender: cle });
    assert.equal(r.status, 400, `filtre ${cle}`); assert.equal(r.body.code, 'FILTERS_INVALID');
  }
  const u = await store.getUser('q1');
  assert.equal(u.profile.gender, 'femme');
  assert.ok(!u.filters?.gender, 'rien de tordu en base');
});
