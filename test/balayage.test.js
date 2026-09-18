// Revenir sur le dernier balayage (audit/15, lot 1, constat G) : le filet qui rend le balayage
// rapide acceptable. Ce que le serveur garantit : la ligne part et le quota revient, dans la
// minute seulement, jamais sur un match, jamais sur le balayage de quelqu'un d'autre.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-balayage-'));
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.WEBAPP_URL = 'https://exemple.test';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.SEED_DEMO = 'false';
process.env.AUTO_APPROVE = 'false';

const express = (await import('express')).default;
const { store } = await import('../server/store.js');
const pid = async (id) => (await store.getUser(id))?.pid;
const { bot } = await import('../server/bot.js');
const { api, RETOUR_BALAYAGE_MS } = await import('../server/routes.js');

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
async function creer(id, name, gender) {
  await call(id, '/me');
  await call(id, '/me/profile', 'PUT', { name, age: 25, gender, intent: 'amitie', city: 'Yaoundé', promptA: 'Le poisson braisé' });
  await store.updateUser(id, { verification: 'approved' });
}
test.after(() => server.close());

test('revenir sur un balayage rend le quota et remet la carte dans le paquet', async () => {
  await creer('9301', 'Awa', 'femme');
  await creer('9302', 'Boris', 'homme');
  const cible = await pid('9302');
  const avant = (await call('9301', '/discover')).body;
  assert.ok(avant.profiles.some((p) => p.id === cible), 'Boris est dans le paquet');

  // Un « J'aime » sans retour : c'est lui qui consomme le quota (passer ne compte pas).
  assert.equal((await call('9301', '/swipes', 'POST', { targetId: cible, action: 'like' })).status, 200);
  const apres = (await call('9301', '/discover')).body;
  assert.ok(!apres.profiles.some((p) => p.id === cible), 'balayé, il n\'y est plus');
  assert.equal(apres.remaining, avant.remaining - 1, 'et le quota a bougé');

  const r = await call('9301', `/swipes/${cible}`, 'DELETE');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.annule, true);
  assert.equal(r.body.profile.id, cible, 'la réponse porte la fiche, pour la reposer sans recharger');
  assert.notEqual(r.body.profile.id, '9302', "l'identifiant Telegram ne sort pas");
  const revenu = (await call('9301', '/discover')).body;
  assert.ok(revenu.profiles.some((p) => p.id === cible), 'il est revenu');
  assert.equal(revenu.remaining, avant.remaining, 'le quota aussi');

  // Deux fois : il n'y a plus rien à annuler.
  assert.equal((await call('9301', `/swipes/${cible}`, 'DELETE')).status, 404);
  // Et jamais le balayage d'un autre : Boris n'a rien balayé.
  assert.equal((await call('9302', `/swipes/${await pid('9301')}`, 'DELETE')).status, 404);
});

test("un « J'aime » se retire aussi, sauf s'il a fait un match", async () => {
  await creer('9311', 'Carine', 'femme');
  await creer('9312', 'Dieudonné', 'homme');
  await creer('9313', 'Émile', 'homme');
  // Like sans retour : annulable.
  await call('9311', '/swipes', 'POST', { targetId: await pid('9312'), action: 'like' });
  assert.equal((await call('9311', `/swipes/${await pid('9312')}`, 'DELETE')).status, 200);
  assert.equal(await store.swipeOf('9311', '9312'), null);
  // Match : refusé, avec le chemin à suivre. Le match reste entier.
  await call('9313', '/swipes', 'POST', { targetId: await pid('9311'), action: 'like' });
  const m = (await call('9311', '/swipes', 'POST', { targetId: await pid('9313'), action: 'like' })).body.match;
  assert.ok(m, 'match');
  const r = await call('9311', `/swipes/${await pid('9313')}`, 'DELETE');
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'SWIPE_MATCHED');
  assert.ok(await store.getMatch(m.id), 'le match est intact');
  assert.ok(await store.swipeOf('9311', '9313'), 'et le like aussi');
});

test("au-delà d'une minute, trop tard", async () => {
  await creer('9321', 'Fanta', 'femme');
  await creer('9322', 'Gaston', 'homme');
  await call('9321', '/swipes', 'POST', { targetId: await pid('9322'), action: 'pass' });
  assert.ok(RETOUR_BALAYAGE_MS <= 60_000, 'une minute, pas plus');
  // La ligne est datée de maintenant ; c'est l'horloge de la route qu'on avance.
  const vrai = Date.now;
  Date.now = () => vrai() + RETOUR_BALAYAGE_MS + 1000;
  try {
    const r = await call('9321', `/swipes/${await pid('9322')}`, 'DELETE');
    assert.equal(r.status, 410);
    assert.equal(r.body.code, 'SWIPE_TOO_OLD');
  } finally { Date.now = vrai; }
  assert.ok(await store.swipeOf('9321', '9322'), 'la ligne est restée');
});
