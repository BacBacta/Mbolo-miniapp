// Limitation de débit par compte : sans elle, un seul compte pouvait envoyer 1 333 messages
// par seconde et noyer la modération de signalements.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-limites-'));
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.SEED_DEMO = 'false';
process.env.AUTO_APPROVE = 'false';

const express = (await import('express')).default;
const { store } = await import('../server/store.js');
const { bot } = await import('../server/bot.js');
const { api } = await import('../server/routes.js');
const { consommer, reinitialiser, REGLES } = await import('../server/limites.js');

bot.api.sendMessage = async () => ({});

const app = express();
app.use(express.json());
app.use('/api', api);
const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api`;
const call = async (user, p, method = 'GET', body) => {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', 'x-dev-user': user }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json(), retryAfter: r.headers.get('retry-after') };
};

test.after(() => server.close());
test.beforeEach(() => reinitialiser());

test('la règle laisse passer le quota puis refuse', () => {
  const regle = REGLES.signalement;
  const t = 1_000_000;
  for (let i = 0; i < regle.max; i++) assert.equal(consommer('u1', 'signalement', t), null, `action ${i + 1} permise`);
  const attente = consommer('u1', 'signalement', t);
  assert.ok(attente > 0, 'la suivante est refusée');
  assert.ok(attente <= regle.fenetreMs / 1000, 'l\'attente ne dépasse pas la fenêtre');
});

test('la fenêtre glisse : après expiration, le compte repart', () => {
  const t = 2_000_000;
  for (let i = 0; i < REGLES.message.max; i++) consommer('u2', 'message', t);
  assert.ok(consommer('u2', 'message', t) > 0, 'plein dans la fenêtre');
  assert.equal(consommer('u2', 'message', t + REGLES.message.fenetreMs + 1), null, 'une fois la fenêtre passée, c\'est permis');
});

test('les comptes ne se gênent pas entre eux', () => {
  const t = 3_000_000;
  for (let i = 0; i < REGLES.signalement.max; i++) consommer('u3', 'signalement', t);
  assert.ok(consommer('u3', 'signalement', t) > 0);
  assert.equal(consommer('u4', 'signalement', t), null, 'un autre compte garde son quota');
});

test('les actions ont des compteurs séparés', () => {
  const t = 4_000_000;
  for (let i = 0; i < REGLES.signalement.max; i++) consommer('u5', 'signalement', t);
  assert.ok(consommer('u5', 'signalement', t) > 0);
  assert.equal(consommer('u5', 'message', t), null, 'écrire reste possible');
});

test('en HTTP, le refus est un 429 avec Retry-After et un message en français', async () => {
  await call('6301', '/me');
  const profil = { name: 'Sandra', age: 26, gender: 'femme', intent: 'amitie', city: 'Yaoundé', promptA: 'Le poisson braisé' };
  await call('6301', '/me/profile', 'PUT', profil);
  await store.updateUser('6301', { verification: 'approved' });
  await call('6302', '/me');
  await call('6302', '/me/profile', 'PUT', { ...profil, name: 'Thomas', gender: 'homme' });
  await store.updateUser('6302', { verification: 'approved' });

  let dernier = { status: 200 };
  for (let i = 0; i <= REGLES.signalement.max; i++) {
    dernier = await call('6301', '/reports', 'POST', { targetId: '6302', reason: 'argent' });
  }
  assert.equal(dernier.status, 429);
  assert.equal(dernier.body.code, 'RATE_LIMIT');
  assert.ok(Number(dernier.retryAfter) > 0, 'Retry-After indique combien de temps attendre');
  assert.ok(!dernier.body.message.includes('!'), 'aucun point d\'exclamation dans les messages système');
});
