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
// Les routes désignent les autres par leur identifiant public, jamais par l'identifiant Telegram.
const pid = async (id) => (await store.getUser(id))?.pid;
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
  await store.updateUser(id, { verification: 'approved' });
}
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
const file = (id, n) => path.join(DATA_DIR, 'uploads', `${id}-photo-${n}.jpg`);
const photosSeenBy = async (viewer, id) => { await passer(viewer); const p = await pid(id); return (await call(viewer, '/profiles')).body.profiles.find((x) => x.id === p)?.photos; };

// La vue Liste et le pays entier demandent un pass. Ces tests portent sur autre chose : on leur
// en donne un plutôt que de réécrire ce qu'ils éprouvent.
const passer = (id) => store.updateUser(id, { plus: { source: 'gift', depuisLe: Date.now(), finLe: Date.now() + 30 * 24 * 3600 * 1000 } });

test.after(() => server.close());

// Deux refus qu'il ne faut pas confondre, depuis que le pass ouvre six emplacements : un
// emplacement qui **n'existe pas** (400, et il n'existera jamais) et un emplacement qui existe
// mais que **cette personne** n'a pas (403, et un pass l'ouvre). Les mélanger ferait dire à
// l'app « ça n'existe pas » là où la vraie réponse est « pas encore pour toi ».
test("un emplacement inexistant est refusé, un emplacement fermé l'est autrement", async () => {
  await makeUser('7501', 'Aline', 'femme');
  assert.equal((await call('7501', '/me/photos/0', 'PUT', { photo: JPEG })).status, 400, "l'emplacement 0 n'existe pas");
  assert.equal((await call('7501', '/me/photos/7', 'PUT', { photo: JPEG })).status, 400, "ni le 7");

  const ferme = await call('7501', '/me/photos/3', 'PUT', { photo: JPEG });
  assert.equal(ferme.status, 403, "le 3 existe, mais il demande un pass");
  assert.equal(ferme.body.code, 'PASS_REQUIS');
  await passer('7501');
  assert.equal((await call('7501', '/me/photos/6', 'PUT', { photo: JPEG })).status, 200, 'et le pass va jusqu\'au sixième');
  await call('7501', '/me/photos/6', 'DELETE');

  assert.equal((await call('7501', '/me/photos/1', 'PUT', { photo: 'data:text/plain;base64,QUJD' })).status, 400);
  assert.equal((await call('7501', '/me/photos/1', 'PUT', {})).status, 400);
});

// Le palier s'applique à l'envoi, jamais à l'affichage : des comptes portent trois photos d'un
// temps où trois était la limite pour tout le monde. Les cacher aujourd'hui retirerait à
// quelqu'un ce qu'il avait, parce que la règle a changé sous lui.
test('une photo au-delà du palier reste visible, et reste supprimable', async () => {
  await makeUser('7510', 'Zoe', 'femme');
  await passer('7510');
  assert.equal((await call('7510', '/me/photos/3', 'PUT', { photo: JPEG })).status, 200);
  await store.updateUser('7510', { plus: null });

  const mien = (await call('7510', '/me')).body.photos.map((x) => x.n);
  assert.ok(mien.includes(3), "la troisième photo ne disparaît pas quand le pass s'arrête");
  assert.equal((await call('7510', '/me/photos/3', 'PUT', { photo: JPEG })).status, 403, 'on ne peut plus la remplacer');
  assert.equal((await call('7510', '/me/photos/3', 'DELETE')).status, 200, "mais on peut toujours s'en débarrasser");
});

test('une photo ajoutée attend la modération : visible pour soi, pas pour les autres', async () => {
  await makeUser('7502', 'Paul', 'homme');
  const r = await call('7501', '/me/photos/1', 'PUT', { photo: JPEG });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.photos, [{ n: 1, status: 'pending' }]);
  assert.ok(fs.existsSync(file('7501', 1)), 'le fichier est écrit');
  assert.deepEqual((await call('7501', '/me')).body.photos, [{ n: 1, status: 'pending' }], 'je vois mon attente');
  assert.deepEqual(await photosSeenBy('7502', '7501'), [], 'Paul ne voit rien');
  const p7501 = await pid('7501');
  assert.equal((await call('7502', `/photos/${p7501}/1`)).status, 404, 'Paul ne peut pas la charger');
  assert.equal((await call('7501', `/photos/${p7501}/1`)).status, 200, 'moi, si');
});

test('validée, elle est montrée ; refusée, elle est supprimée et la personne prévenue', async () => {
  await decidePhoto('7501', 1, true);
  assert.deepEqual(await photosSeenBy('7502', '7501'), [1]);
  const p7501 = await pid('7501');
  assert.equal((await call('7502', `/photos/${p7501}/1`)).status, 200);
  assert.equal((await call('7502', `/photos/${p7501}`)).status, 200, 'l\'adresse historique sert la première validée');
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
  const p7501b = await pid('7501');
  await passer('7502');
  assert.equal((await call('7502', '/profiles')).body.profiles.find((p) => p.id === p7501b).hasPhoto, false);

  await call('7501', '/me/photos/1', 'PUT', { photo: JPEG });
  await decidePhoto('7501', 1, true);
  await store.block('7502', '7501');
  assert.equal((await call('7502', `/photos/${await pid('7501')}/1`)).status, 404, 'bloqué : pas de photo');

  await call('7501', '/me/photos/2', 'PUT', { photo: JPEG });
  await call('7501', '/me', 'DELETE');
  assert.ok(!fs.existsSync(file('7501', 1)) && !fs.existsSync(file('7501', 2)), 'aucun fichier orphelin');
});

test('un ancien profil à une photo devient l\'emplacement 1, déjà validé', async () => {
  await makeUser('7503', 'Marc', 'homme');
  const u = await store.getUser('7503');
  fs.writeFileSync(path.join(DATA_DIR, 'uploads', '7503-profile.jpg'), Buffer.from('jpeg'));
  // L'état d'avant les trois emplacements : hasPhoto vrai, aucune liste de photos.
  await store.updateUser('7503', { profile: { ...u.profile, hasPhoto: true }, photos: null });
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
