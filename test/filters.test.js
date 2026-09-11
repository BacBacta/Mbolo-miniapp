// Tranche d'âge recherchée et likes reçus : ce que je vois, et qui attend ma réponse.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-filtres-'));
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.WEBAPP_URL = 'https://exemple.test';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.SEED_DEMO = 'false';
process.env.AUTO_APPROVE = 'false';

const express = (await import('express')).default;
const { store } = await import('../server/store.js');
const { bot } = await import('../server/bot.js');
const { api } = await import('../server/routes.js');
bot.api.sendMessage = async () => ({});

const app = express();
app.use(express.json());
app.use('/api', api);
const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api`;
const call = async (user, p, method = 'GET', body) => {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', 'x-dev-user': user }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
async function makeUser(id, name, gender, age = 25) {
  await call(id, '/me');
  const r = await call(id, '/me/profile', 'PUT', { name, age, gender, intent: 'amitie', city: 'Douala', promptA: 'Le poisson braisé' });
  assert.equal(r.status, 200);
  store.updateUser(id, { verification: 'approved' });
}
const ids = (r) => r.body.profiles.map((p) => p.id);

test.after(() => server.close());

test('la tranche d\'âge se règle, se relit, et refuse l\'absurde', async () => {
  await makeUser('7401', 'Aline', 'femme');
  assert.deepEqual((await call('7401', '/me')).body.filters, { ageMin: 18, ageMax: 99 }, 'par défaut : tout le monde');
  assert.equal((await call('7401', '/me/filters', 'PUT', { ageMin: 30, ageMax: 25 })).status, 400, 'min > max');
  assert.equal((await call('7401', '/me/filters', 'PUT', { ageMin: 17, ageMax: 25 })).status, 400, 'jamais de mineur');
  assert.equal((await call('7401', '/me/filters', 'PUT', { ageMin: 'x', ageMax: 25 })).status, 400);
  const r = await call('7401', '/me/filters', 'PUT', { ageMin: 24, ageMax: 30 });
  assert.equal(r.status, 200);
  assert.deepEqual((await call('7401', '/me')).body.filters, { ageMin: 24, ageMax: 30 });
});

test('cartes et liste respectent la tranche ; un like reçu l\'ignore', async () => {
  await makeUser('7402', 'Paul', 'homme', 27); // dans la tranche
  await makeUser('7403', 'Marc', 'homme', 40); // hors tranche
  await makeUser('7404', 'Jean', 'homme', 45); // hors tranche, mais il m'a liké
  await call('7404', '/swipes', 'POST', { targetId: '7401', action: 'like' });

  const cartes = ids(await call('7401', '/discover'));
  assert.ok(cartes.includes('7402') && !cartes.includes('7403') && !cartes.includes('7404'), 'le paquet filtre par âge');
  const liste = ids(await call('7401', '/profiles'));
  assert.ok(liste.includes('7402') && !liste.includes('7403'), 'la liste aussi');

  const likes = await call('7401', '/likes');
  assert.deepEqual(ids(likes), ['7404'], 'Jean, hors tranche, apparaît quand même dans les likes reçus');
  assert.equal(likes.body.profiles[0].activity, 'week', 'activité rabattue avant le match');
  assert.ok(!JSON.stringify(likes.body).includes('lastActiveAt'));
  assert.equal((await call('7401', '/summary')).body.likes, 1, 'le compteur de l\'onglet compte ce like');
});

test('un like reçu disparaît des likes dès que j\'ai répondu', async () => {
  await call('7401', '/swipes', 'POST', { targetId: '7404', action: 'pass' });
  assert.deepEqual(ids(await call('7401', '/likes')), [], 'passé : plus en attente');
  assert.equal((await call('7401', '/summary')).body.likes, 0);
  // Bloqué : jamais listé, même s'il a liké
  await makeUser('7405', 'Luc', 'homme', 26);
  await call('7405', '/swipes', 'POST', { targetId: '7401', action: 'like' });
  store.block('7401', '7405');
  assert.deepEqual(ids(await call('7401', '/likes')), []);
});
