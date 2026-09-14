// Limitation de débit par compte : sans elle, un seul compte pouvait envoyer 1 333 messages
// par seconde et noyer la modération de signalements.
//
// Les compteurs vivent désormais dans le stockage, pour que deux instances comptent ensemble.
// Ce fichier tourne donc deux fois : sur le fichier JSON (compteurs en mémoire, mono-instance)
// et sur PostgreSQL (compteurs en base) avec npm run test:pg. Les mêmes règles doivent tenir des
// deux côtés — c'est cette double exécution qui vérifie que le portage n'a rien changé au
// comportement. Qu'ils soient réellement partagés entre deux processus se prouve ailleurs :
// test/limites-instances.test.js, qui demande une vraie base.
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
// Les routes désignent les autres par leur identifiant public, jamais par l'identifiant Telegram.
const pid = async (id) => (await store.getUser(id))?.pid;
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
test.beforeEach(async () => reinitialiser());

test('la règle laisse passer le quota puis refuse', async () => {
  const regle = REGLES.signalement;
  const t = 1_000_000;
  for (let i = 0; i < regle.max; i++) assert.equal(await consommer('u1', 'signalement', t), null, `action ${i + 1} permise`);
  const attente = await consommer('u1', 'signalement', t);
  assert.ok(attente > 0, 'la suivante est refusée');
  assert.ok(attente <= regle.fenetreMs / 1000, 'l\'attente ne dépasse pas la fenêtre');
});

test('la fenêtre glisse : après expiration, le compte repart', async () => {
  const t = 2_000_000;
  for (let i = 0; i < REGLES.message.max; i++) await consommer('u2', 'message', t);
  assert.ok(await consommer('u2', 'message', t) > 0, 'plein dans la fenêtre');
  assert.equal(await consommer('u2', 'message', t + REGLES.message.fenetreMs + 1), null, 'une fois la fenêtre passée, c\'est permis');
});

test('les comptes ne se gênent pas entre eux', async () => {
  const t = 3_000_000;
  for (let i = 0; i < REGLES.signalement.max; i++) await consommer('u3', 'signalement', t);
  assert.ok(await consommer('u3', 'signalement', t) > 0);
  assert.equal(await consommer('u4', 'signalement', t), null, 'un autre compte garde son quota');
});

test('les actions ont des compteurs séparés', async () => {
  const t = 4_000_000;
  for (let i = 0; i < REGLES.signalement.max; i++) await consommer('u5', 'signalement', t);
  assert.ok(await consommer('u5', 'signalement', t) > 0);
  assert.equal(await consommer('u5', 'message', t), null, 'écrire reste possible');
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
    dernier = await call('6301', '/reports', 'POST', { targetId: await pid('6302'), reason: 'argent' });
  }
  assert.equal(dernier.status, 429);
  assert.equal(dernier.body.code, 'RATE_LIMIT');
  assert.ok(Number(dernier.retryAfter) > 0, 'Retry-After indique combien de temps attendre');
  assert.ok(!dernier.body.message.includes('!'), 'aucun point d\'exclamation dans les messages système');
});
