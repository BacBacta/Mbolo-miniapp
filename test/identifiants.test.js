// L'identifiant Telegram d'un membre ne sort jamais du serveur, et n'ouvre aucune porte. La revue
// du 14 septembre 2026 (audit/09-revue-code.md, I6, I7) a trouvé qu'il servait d'identifiant
// public — de quoi ouvrir la fiche Telegram de n'importe qui et lui écrire hors de l'app — et que
// les photos se servaient par identifiant, y compris d'un compte en attente ou fermé.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-identifiants-'));
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
test.after(() => server.close());
const brut = (user, p, method = 'GET', body) => fetch(base + p, { method, headers: { 'Content-Type': 'application/json', 'x-dev-user': user }, body: body ? JSON.stringify(body) : undefined });
const call = async (user, p, method = 'GET', body) => { const r = await brut(user, p, method, body); return { status: r.status, body: await r.json() }; };
const pid = async (id) => (await store.getUser(id))?.pid;
const JPEG = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
// Des identifiants Telegram qui ressemblent à de vrais : numériques, longs, faciles à reconnaître
// dans une réponse JSON.
async function creer(id, name, gender, extra = {}) {
  await call(id, '/me');
  const r = await call(id, '/me/profile', 'PUT', { name, age: 25, gender, intent: 'amitie', city: 'Yaoundé', promptA: 'Le poisson braisé', ...extra });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  await store.updateUser(id, { verification: 'approved' });
}

test("l'identifiant public est aléatoire, distinct de l'identifiant Telegram, et stable", async () => {
  await creer('900000001', 'Awa', 'femme');
  const me = (await call('900000001', '/me')).body;
  assert.match(me.id, /^[a-f0-9]{16}$/);
  assert.notEqual(me.id, '900000001');
  assert.equal((await call('900000001', '/me')).body.id, me.id, 'le même à chaque appel');
  // Un compte d'avant l'identifiant public en reçoit un à son passage suivant.
  await store.updateUser('900000001', { pid: null });
  assert.match((await call('900000001', '/me')).body.id, /^[a-f0-9]{16}$/);
});

test("aucune réponse de l'API ne porte l'identifiant Telegram d'un autre membre", async () => {
  await creer('900000002', 'Bana', 'femme'); await creer('900000003', 'Cyrille', 'homme');
  const p3 = await pid('900000003');
  await call('900000002', '/swipes', 'POST', { targetId: p3, action: 'like' });
  const m = (await call('900000003', '/swipes', 'POST', { targetId: await pid('900000002'), action: 'like' })).body.match;
  await call('900000002', `/matches/${m.id}/messages`, 'POST', { text: 'Salut' });
  const reponses = [
    (await call('900000002', '/discover')).body,
    (await call('900000002', '/likes')).body,
    (await call('900000002', '/matches')).body,
    (await call('900000002', `/matches/${m.id}`)).body,
    (await call('900000003', `/matches/${m.id}`)).body,
    (await call('900000003', '/me')).body,
    m,
  ];
  for (const r of reponses) {
    const texte = JSON.stringify(r);
    assert.ok(!texte.includes('900000002') && !texte.includes('900000003'), `identifiant Telegram dans : ${texte.slice(0, 200)}`);
  }
  const fil = (await call('900000002', `/matches/${m.id}`)).body;
  assert.equal(fil.other.id, p3);
  assert.equal(fil.messages[0].mine, true);
  assert.equal('from' in fil.messages[0], false, "l'auteur d'un message ne sort pas, « mine » suffit");
  const liste = (await call('900000003', '/matches')).body.matches ?? (await call('900000003', '/matches')).body;
  const ligne = (Array.isArray(liste) ? liste : liste.matches || []).find((x) => x.id === m.id);
  assert.equal(ligne.lastMessage.mine, false);
  assert.equal('from' in ligne.lastMessage, false);
});

test("un identifiant Telegram n'ouvre aucune porte : ni like, ni blocage, ni signalement, ni photo", async () => {
  await creer('900000004', 'Diane', 'femme'); await creer('900000005', 'Éric', 'homme');
  for (const [route, corps] of [['/swipes', { targetId: '900000005', action: 'like' }], ['/blocks', { targetId: '900000005' }], ['/reports', { targetId: '900000005', reason: 'x' }]]) {
    const r = await call('900000004', route, 'POST', corps);
    assert.equal(r.status, 400, `${route} : ${JSON.stringify(r.body)}`);
  }
  assert.equal((await brut('900000004', '/photos/900000005/1')).status, 404);
  assert.equal((await brut('900000004', '/voix/900000005')).status, 404);
  // Et avec l'identifiant public, la même chose marche.
  assert.equal((await call('900000004', '/swipes', 'POST', { targetId: await pid('900000005'), action: 'like' })).status, 200);
});

test("une photo ne se sert qu'à qui pourrait voir la carte : ni compte en attente, ni compte fermé, ni autre intention", async () => {
  await creer('900000006', 'Fatou', 'femme');
  for (const [id, name, etat] of [['900000007', 'Gaston', { verification: 'pending' }], ['900000008', 'Hervé', {}], ['900000009', 'Idriss', { profile: null }]]) {
    await creer(id, name, 'homme');
    await call(id, '/me/photos/1', 'PUT', { photo: JPEG });
    await store.setPhoto(id, 1, 'approved');
    if (id === '900000009') await call(id, '/me/profile', 'PUT', { name, age: 25, gender: 'homme', intent: 'serieux', city: 'Yaoundé', promptA: 'Le poisson braisé' });
    else await store.updateUser(id, etat);
  }
  await store.banUser('900000008', { motif: 'test', par: 'test' });
  // Sain de référence : un homme vérifié, même intention, même ville.
  await creer('900000010', 'Joseph', 'homme');
  await call('900000010', '/me/photos/1', 'PUT', { photo: JPEG });
  await store.setPhoto('900000010', 1, 'approved');
  assert.equal((await brut('900000006', `/photos/${await pid('900000010')}/1`)).status, 200, 'la carte est visible, la photo aussi');
  for (const id of ['900000007', '900000008', '900000009']) {
    assert.equal((await brut('900000006', `/photos/${await pid(id)}/1`)).status, 404, `${id} ne devrait pas être servi`);
    assert.equal((await brut('900000006', `/voix/${await pid(id)}`)).status, 404);
  }
});

test("un match garde la photo visible même quand la zone de recherche ne l'inclut plus", async () => {
  await creer('900000011', 'Karine', 'femme'); await creer('900000012', 'Léon', 'homme');
  await call('900000012', '/me/photos/1', 'PUT', { photo: JPEG });
  await store.setPhoto('900000012', 1, 'approved');
  await call('900000011', '/swipes', 'POST', { targetId: await pid('900000012'), action: 'like' });
  await call('900000012', '/swipes', 'POST', { targetId: await pid('900000011'), action: 'like' });
  // Léon déménage : plus dans la ville de Karine, mais toujours en match avec elle.
  await call('900000012', '/me/profile', 'PUT', { name: 'Léon', age: 25, gender: 'homme', intent: 'amitie', city: 'Douala', promptA: 'Le poisson braisé' });
  assert.equal((await brut('900000011', `/photos/${await pid('900000012')}/1`)).status, 200);
});

test('la ville passe par l\'anti-arnaque comme le reste du profil', async () => {
  await call('900000013', '/me');
  const base = { name: 'Mireille', age: 25, gender: 'femme', intent: 'amitie', promptA: 'Le poisson braisé' };
  for (const city of ['Douala 677 12 34 56', 'Yaoundé @handle12', 'Bafoussam wa.me/237677123456']) {
    const r = await call('900000013', '/me/profile', 'PUT', { ...base, city });
    assert.equal(r.status, 400, city); assert.equal(r.body.code, 'PROFILE_CONTACT');
  }
  assert.equal((await call('900000013', '/me/profile', 'PUT', { ...base, city: 'Douala' })).status, 200);
});
