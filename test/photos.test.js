// Jusqu'à trois photos, chacune validée par la modération avant d'être montrée. Refusée : supprimée.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-photos-'));
process.env.DATA_DIR = DATA_DIR;
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.WEBAPP_URL = 'https://exemple.test';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.SEED_DEMO = 'false';
process.env.AUTO_APPROVE = 'false';

const express = (await import('express')).default;
const { config } = await import('../server/config.js');
const { store } = await import('../server/store.js');
const { bot, decidePhoto } = await import('../server/bot.js');
const { api } = await import('../server/routes.js');
const sent = [];
bot.api.sendMessage = async (chatId, text) => { sent.push({ chatId: String(chatId), text }); return {}; };

const app = express();
app.use(express.json({ limit: '3mb' }));
app.use('/api', api);
const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api`;
const call = async (user, p, method = 'GET', body) => {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', 'x-dev-user': user }, body: body ? JSON.stringify(body) : undefined });
  const ct = r.headers.get('content-type') || '';
  return { status: r.status, body: ct.includes('json') ? await r.json() : await r.arrayBuffer() };
};
async function makeUser(id, name, gender) {
  await call(id, '/me');
  const r = await call(id, '/me/profile', 'PUT', { name, age: 25, gender, intent: 'amitie', city: 'Douala', promptA: 'Le poisson braisé' });
  assert.equal(r.status, 200);
  store.updateUser(id, { verification: 'approved' });
}
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
const file = (id, n) => path.join(DATA_DIR, 'uploads', `${id}-photo-${n}.jpg`);
const photosSeenBy = async (viewer, id) => (await call(viewer, '/profiles')).body.profiles.find((p) => p.id === id)?.photos;

test.after(() => server.close());

test('un emplacement hors de 1..3 ou une image invalide sont refusés', async () => {
  await makeUser('7501', 'Aline', 'femme');
  assert.equal((await call('7501', '/me/photos/0', 'PUT', { photo: JPEG })).status, 400);
  assert.equal((await call('7501', '/me/photos/4', 'PUT', { photo: JPEG })).status, 400);
  assert.equal((await call('7501', '/me/photos/1', 'PUT', { photo: 'data:text/plain;base64,QUJD' })).status, 400);
  assert.equal((await call('7501', '/me/photos/1', 'PUT', {})).status, 400);
});

test('une photo ajoutée attend la modération : visible pour soi, pas pour les autres', async () => {
  await makeUser('7502', 'Paul', 'homme');
  const r = await call('7501', '/me/photos/1', 'PUT', { photo: JPEG });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.photos, [{ n: 1, status: 'pending' }]);
  assert.ok(fs.existsSync(file('7501', 1)), 'le fichier est écrit');
  assert.deepEqual((await call('7501', '/me')).body.photos, [{ n: 1, status: 'pending' }], 'je vois mon attente');
  assert.deepEqual(await photosSeenBy('7502', '7501'), [], 'Paul ne voit rien');
  assert.equal((await call('7502', '/photos/7501/1')).status, 404, 'Paul ne peut pas la charger');
  assert.equal((await call('7501', '/photos/7501/1')).status, 200, 'moi, si');
});

test('validée, elle est montrée ; refusée, elle est supprimée et la personne prévenue', async () => {
  await decidePhoto('7501', 1, true);
  assert.deepEqual(await photosSeenBy('7502', '7501'), [1]);
  assert.equal((await call('7502', '/photos/7501/1')).status, 200);
  assert.equal((await call('7502', '/photos/7501')).status, 200, 'l\'adresse historique sert la première validée');
  assert.match(sent.at(-1).text, /photo 1 est validée/);

  await call('7501', '/me/photos/2', 'PUT', { photo: JPEG });
  assert.ok(fs.existsSync(file('7501', 2)));
  await decidePhoto('7501', 2, false);
  assert.ok(!fs.existsSync(file('7501', 2)), 'le fichier refusé est effacé');
  assert.deepEqual((await call('7501', '/me')).body.photos, [{ n: 1, status: 'approved' }], 'l\'emplacement 2 a disparu');
  assert.match(sent.at(-1).text, /photo 2 a été refusée/);
  assert.match(sent.at(-1).text, /supprimée/);
});

test('une décision sur une photo déjà retirée ne recrée rien', async () => {
  await call('7501', '/me/photos/3', 'PUT', { photo: JPEG });
  await call('7501', '/me/photos/3', 'DELETE');
  await decidePhoto('7501', 3, true);
  assert.deepEqual((await call('7501', '/me')).body.photos, [{ n: 1, status: 'approved' }]);
  assert.ok(!fs.existsSync(file('7501', 3)));
});

test('retirer sa photo, être bloqué, supprimer son compte', async () => {
  const r = await call('7501', '/me/photos/1', 'DELETE');
  assert.deepEqual(r.body.photos, []);
  assert.ok(!fs.existsSync(file('7501', 1)));
  assert.equal((await call('7502', '/profiles')).body.profiles.find((p) => p.id === '7501').hasPhoto, false);

  await call('7501', '/me/photos/1', 'PUT', { photo: JPEG });
  await decidePhoto('7501', 1, true);
  store.block('7502', '7501');
  assert.equal((await call('7502', '/photos/7501/1')).status, 404, 'bloqué : pas de photo');

  await call('7501', '/me/photos/2', 'PUT', { photo: JPEG });
  await call('7501', '/me', 'DELETE');
  assert.ok(!fs.existsSync(file('7501', 1)) && !fs.existsSync(file('7501', 2)), 'aucun fichier orphelin');
});

test('un ancien profil à une photo devient l\'emplacement 1, déjà validé', async () => {
  await makeUser('7503', 'Marc', 'homme');
  const u = store.getUser('7503');
  fs.writeFileSync(path.join(DATA_DIR, 'uploads', '7503-profile.jpg'), Buffer.from('jpeg'));
  u.profile.hasPhoto = true;
  delete u.photos;
  assert.deepEqual((await call('7503', '/me')).body.photos, [{ n: 1, status: 'approved' }]);
  assert.ok(fs.existsSync(file('7503', 1)) && !fs.existsSync(path.join(DATA_DIR, 'uploads', '7503-profile.jpg')), 'fichier renommé');
});

test('en test, AUTO_APPROVE valide sans attendre', async () => {
  config.autoApprove = true;
  try {
    const r = await call('7503', '/me/photos/2', 'PUT', { photo: JPEG });
    assert.deepEqual(r.body.photos, [{ n: 1, status: 'approved' }, { n: 2, status: 'approved' }]);
  } finally {
    config.autoApprove = false;
  }
});
