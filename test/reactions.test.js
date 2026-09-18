// Les réactions sur un message (audit/15, lot 4) : une liste fermée de six, un emoji par membre et
// par message, la sienne comme celle de l'autre, jamais un identifiant, jamais une notification.
// L'interrogation rattrape une réaction posée sur un vieux message ; le message retiré n'en
// prend plus ; tout part avec le match.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-reactions-'));
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
const { api, REACTIONS } = await import('../server/routes.js');

const envoyes = [];
bot.api.sendMessage = async (id, text) => { envoyes.push({ id: String(id), text }); return {}; };

const app = express();
app.use(express.json({ limit: '3mb' }));
app.use('/api', api);
const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api`;
test.after(() => server.close());
const call = async (user, p, method = 'GET', body) => {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', 'x-dev-user': user }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
async function creer(id, name, gender) {
  await call(id, '/me');
  const r = await call(id, '/me/profile', 'PUT', { name, age: 25, gender, intent: 'amitie', city: 'Yaoundé', promptA: 'Le poisson braisé' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  await store.updateUser(id, { verification: 'approved' });
}
let matchId, message;
test.before(async () => {
  await creer('8201', 'Awa', 'femme');
  await creer('8202', 'Ben', 'homme');
  await call('8201', '/swipes', 'POST', { targetId: await pid('8202'), action: 'like' });
  const r = await call('8202', '/swipes', 'POST', { targetId: await pid('8201'), action: 'like' });
  matchId = r.body.match.id;
  const m = await call('8201', `/matches/${matchId}/messages`, 'POST', { text: 'Salut Ben' });
  message = m.body.message;
});

test('la liste des réactions est fermée, et six', () => {
  assert.equal(REACTIONS.length, 6);
  assert.ok(REACTIONS.every((e) => typeof e === 'string' && e.length <= 4));
});

test("réagir pose l'emoji, le remplacer le change, null le retire, et personne n'est prévenu", async () => {
  const avant = envoyes.length;
  const r = await call('8202', `/matches/${matchId}/messages/${message.id}/reaction`, 'PUT', { emoji: '❤️' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body, { id: message.id, reactions: { moi: '❤️', autre: null } });
  const r2 = await call('8202', `/matches/${matchId}/messages/${message.id}/reaction`, 'PUT', { emoji: '🔥' });
  assert.deepEqual(r2.body.reactions, { moi: '🔥', autre: null }, 'une seule réaction par membre : la seconde remplace');
  // Côté Awa : la sienne, et celle de Ben, sans identifiant.
  const fil = await call('8201', `/matches/${matchId}`);
  assert.deepEqual(fil.body.messages[0].reactions, { moi: null, autre: '🔥' });
  assert.ok(!JSON.stringify(fil.body.messages[0]).includes('8202'), "l'identifiant ne sort pas");
  const r3 = await call('8202', `/matches/${matchId}/messages/${message.id}/reaction`, 'PUT', { emoji: null });
  assert.equal(r3.body.reactions, undefined, 'plus rien : le champ disparaît');
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(envoyes.length, avant, 'aucune notification du bot');
});

test('une réaction hors liste est refusée, et un message retiré n\'en prend plus', async () => {
  const r = await call('8201', `/matches/${matchId}/messages/${message.id}/reaction`, 'PUT', { emoji: '💰' });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'REACTION_INVALID');
  const m = await call('8201', `/matches/${matchId}/messages`, 'POST', { text: 'À retirer' });
  await call('8201', `/matches/${matchId}/messages/${m.body.message.id}`, 'DELETE');
  const r2 = await call('8202', `/matches/${matchId}/messages/${m.body.message.id}/reaction`, 'PUT', { emoji: '👍' });
  assert.equal(r2.status, 404);
  const inconnu = await call('8202', `/matches/${matchId}/messages/nexistepas/reaction`, 'PUT', { emoji: '👍' });
  assert.equal(inconnu.status, 404);
});

test("l'interrogation rattrape une réaction posée sur un message plus ancien que `after`", async () => {
  await new Promise((r) => setTimeout(r, 5));
  const after = Date.now();
  await new Promise((r) => setTimeout(r, 5));
  await call('8202', `/matches/${matchId}/messages/${message.id}/reaction`, 'PUT', { emoji: '😂' });
  const suivi = await call('8201', `/matches/${matchId}?suivi=1&after=${after}`);
  assert.equal(suivi.body.messages.length, 0, "le message lui-même n'est pas renvoyé");
  assert.deepEqual(suivi.body.reagis, [{ id: message.id, reactions: { moi: null, autre: '😂' } }]);
  // Un passage plus tard ne le redit pas.
  const plusTard = await call('8201', `/matches/${matchId}?suivi=1&after=${Date.now() + 1}`);
  assert.equal(plusTard.body.reagis, undefined);
  // Et le premier chargement (sans after) le porte dans le message, pas dans `reagis`.
  const premier = await call('8201', `/matches/${matchId}`);
  assert.equal(premier.body.reagis, undefined);
  assert.deepEqual(premier.body.messages[0].reactions, { moi: null, autre: '😂' });
});

test("réagir demande d'être dans la discussion", async () => {
  await creer('8203', 'Cam', 'homme');
  const r = await call('8203', `/matches/${matchId}/messages/${message.id}/reaction`, 'PUT', { emoji: '👍' });
  assert.ok([403, 404].includes(r.status), String(r.status));
});

test('GET /me dit s\'il y a un lieu partenaire dans ma ville', async () => {
  const moi = await call('8201', '/me');
  assert.equal(moi.body.options.lieuxIci, false, 'la liste des lieux part vide');
});
