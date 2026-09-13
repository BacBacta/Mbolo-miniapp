// « Sortie en duo » : une option proposée avant d'exister (P1-7).
//
// L'app annonçait « rencontrer à quatre, avec un ami » et livrait un match ordinaire, en
// tête-à-tête : aucune invitation d'ami, aucun appariement à quatre nulle part dans le serveur.
// Ces tests figent le retrait, et surtout ce qu'il advient de ceux qui l'avaient déjà choisie —
// un compte resté sur une intention retirée ne voit plus personne et n'est vu de personne,
// puisque la découverte cherche la même intention chez les autres.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'odo-duo-'));
process.env.DATA_DIR = DATA_DIR;
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.WEBAPP_URL = 'https://exemple.test';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.SEED_DEMO = 'false';
process.env.AUTO_APPROVE = 'false';

const express = (await import('express')).default;
const { INTENTS, INTENTS_RETIRES } = await import('../server/config.js');
const { store } = await import('../server/store.js');
const { bot } = await import('../server/bot.js');
const { api } = await import('../server/routes.js');

const envoyes = [];
bot.api.config.use(async (prev, method, payload) => {
  if (method === 'sendMessage') envoyes.push({ a: String(payload.chat_id), texte: payload.text });
  return { ok: true, result: { message_id: envoyes.length } };
});

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
const profilValide = { name: 'Aline', age: 25, gender: 'femme', city: 'Yaoundé', promptA: 'Le poisson braisé' };
const attendre = async (n) => { for (let i = 0; i < 40 && envoyes.length < n; i += 1) await new Promise((r) => setTimeout(r, 25)); };

test("« Sortie en duo » n'est plus proposée", async () => {
  assert.ok(!INTENTS.duo, "l'option ne doit plus être dans la liste des intentions");
  assert.deepEqual(Object.keys(INTENTS), ['amitie', 'serieux']);

  await call('9001', '/me');
  const options = (await call('9001', '/me')).body.options.intents;
  assert.ok(!options.duo, "et l'app ne doit pas l'envoyer au navigateur");
});

test('on ne peut plus enregistrer un profil en duo', async () => {
  await call('9002', '/me');
  const r = await call('9002', '/me/profile', 'PUT', { ...profilValide, intent: 'duo' });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'INTENT_REQUIRED');
});

// Le cas qui compte : quelqu'un l'avait déjà choisie avant le retrait.
test('un compte déjà en duo bascule vers Amitié, et on le lui dit', async () => {
  await call('9003', '/me');
  await call('9003', '/me/profile', 'PUT', { ...profilValide, intent: 'amitie' });
  // On remet la main dans la base pour reconstituer l'état d'avant le retrait.
  const avant = await store.getUser('9003');
  await store.updateUser('9003', { profile: { ...avant.profile, intent: 'duo' } });
  assert.equal((await store.getUser('9003')).profile.intent, 'duo');

  const moi = (await call('9003', '/me')).body;
  assert.equal(moi.profile.intent, 'amitie', 'la bascule doit avoir eu lieu à la lecture');
  assert.equal((await store.getUser('9003')).profile.intent, 'amitie', 'et être écrite, pas seulement affichée');

  await attendre(1);
  const message = envoyes.filter((m) => m.a === '9003').at(-1);
  assert.ok(message, 'la personne doit être prévenue : on a changé son profil sans qu\'elle demande');
  assert.match(message.texte, /Sortie en duo/, 'le message doit nommer ce qui a disparu');
  assert.match(message.texte, /Amitié/, 'et dire vers quoi on a basculé');
});

test('une intention encore valable n\'est jamais touchée', async () => {
  await call('9004', '/me');
  await call('9004', '/me/profile', 'PUT', { ...profilValide, intent: 'serieux' });
  const avant = envoyes.length;
  assert.equal((await call('9004', '/me')).body.profile.intent, 'serieux');
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(envoyes.length, avant, 'et personne ne reçoit de message pour rien');
});

// Entre le déploiement et la prochaine ouverture de la personne, son profil peut encore être lu
// ailleurs. Un libellé manquant y afficherait « undefined » au lieu d'un mot.
test('un profil resté en duo garde un libellé lisible', () => {
  assert.equal(INTENTS_RETIRES.duo, 'Sortie en duo');
});
