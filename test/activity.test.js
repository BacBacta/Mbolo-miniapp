// Tranche d'activité montrée aux autres : floue, réservée aux matchs, jamais l'horodatage brut.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-activite-'));
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.WEBAPP_URL = 'https://exemple.test';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.SEED_DEMO = 'true';
process.env.AUTO_APPROVE = 'false';

const express = (await import('express')).default;
const { store } = await import('../server/store.js');
// Les routes désignent les autres par leur identifiant public, jamais par l'identifiant Telegram.
const pid = async (id) => (await store.getUser(id))?.pid;
const { bot } = await import('../server/bot.js');
const { seedDemo } = await import('../server/seed.js');
const { api, activityBucket } = await import('../server/routes.js');

bot.api.sendMessage = async () => ({});
seedDemo();

const app = express();
app.use(express.json());
app.use('/api', api);
const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api`;
const call = async (user, p, method = 'GET', body) => {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', 'x-dev-user': user }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};

async function makeUser(id, name, gender, city = 'Douala') {
  await call(id, '/me');
  const r = await call(id, '/me/profile', 'PUT', { name, age: 25, gender, intent: 'amitie', city, promptA: 'Le poisson braisé' });
  assert.equal(r.status, 200);
  await store.updateUser(id, { verification: 'approved' });
}

test.after(() => server.close());

test('les tranches sont floues et bornées', () => {
  const now = 1_700_000_000_000;
  assert.equal(activityBucket(null, now), null, 'jamais vu');
  assert.equal(activityBucket(now - 5 * 60e3, now), 'recent');
  assert.equal(activityBucket(now - 15 * 60e3, now), 'today', '15 min pile bascule sur aujourd\'hui');
  assert.equal(activityBucket(now - 3 * 3600e3, now), 'today');
  assert.equal(activityBucket(now - 2 * 86400e3, now), 'week');
  assert.equal(activityBucket(now - 8 * 86400e3, now), null, 'plus d\'une semaine : rien');
});

test('signe de vie à chaque appel, tranche fine réservée aux matchs, horodatage jamais exposé', async () => {
  await makeUser('7001', 'Aline', 'femme');
  await makeUser('7002', 'Paul', 'homme');

  const first = (await store.getUser('7001')).lastActiveAt;
  assert.ok(Date.now() - first < 5000, 'le premier appel pose l\'horodatage');
  await call('7001', '/me');
  assert.equal((await store.getUser('7001')).lastActiveAt, first, 'au plus une écriture par minute');

  // Avant le match, Paul ne voit que « cette semaine »
  const d = await call('7002', '/discover');
  const p7001 = await pid('7001');
  const aline = d.body.profiles.find((p) => p.id === p7001);
  assert.ok(aline, 'Aline est proposée à Paul');
  assert.equal(aline.activity, 'week');
  assert.ok(!JSON.stringify(d.body).includes('lastActiveAt'), 'pas d\'horodatage dans la découverte');

  // Une fois matchés, la tranche fine apparaît
  await call('7001', '/swipes', 'POST', { targetId: await pid('7002'), action: 'like' });
  const m = await call('7002', '/swipes', 'POST', { targetId: await pid('7001'), action: 'like' });
  assert.equal(m.body.match.other.activity, 'recent');
  const list = await call('7002', '/matches');
  assert.equal(list.body.matches[0].other.activity, 'recent');
  const chat = await call('7002', `/matches/${m.body.match.id}`);
  assert.equal(chat.body.other.activity, 'recent');
  for (const body of [m.body, list.body, chat.body]) assert.ok(!JSON.stringify(body).includes('lastActiveAt'));

  // Son propre profil ne fuit rien non plus vers le client
  const me = await call('7001', '/me');
  assert.ok(!JSON.stringify(me.body).includes('lastActiveAt'));

  // Suppression du compte : l'horodatage part avec le reste
  await call('7001', '/me', 'DELETE');
  assert.equal(await store.getUser('7001'), null);
});

test('les profils de démonstration ont une tranche même sans activité réelle', async () => {
  await makeUser('7003', 'Chris', 'homme', 'Yaoundé');
  const d = await call('7003', '/discover');
  const demo = d.body.profiles.find((p) => p.demo);
  assert.ok(demo, 'un profil de démonstration est proposé à Yaoundé');
  assert.equal(demo.activity, 'week', 'coarsé en découverte, mais présent');
});
