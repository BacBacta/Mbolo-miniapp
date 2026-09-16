// Ce que les routes chaudes chargent — et surtout ce qu'elles ne chargent plus.
//
// **Pourquoi ce fichier existe.** Le reste de la suite passait avant ce chantier et passerait
// encore si `allUsers()` revenait demain dans `/summary` : les réponses sont identiques, seul le
// coût change. Un correctif de charge qu'aucun test ne tient se défait à la première relecture
// distraite, et personne ne le voit — c'est exactement ce qui est arrivé à la dette n° 3, restée
// ouverte parce qu'aucune ligne ne la nommait.
//
// On compte donc les appels au stockage. C'est le seul endroit du dépôt qui le fait.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-charge-'));
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.WEBAPP_URL = 'https://exemple.test';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.SEED_DEMO = 'false';
process.env.AUTO_APPROVE = 'false';

const express = (await import('express')).default;
const { store } = await import('../server/store.js');
const { bot } = await import('../server/bot.js');
const { api } = await import('../server/routes.js');
const { prolonger } = await import('../server/plus.js');

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

const pid = async (id) => (await store.getUser(id))?.pid;

async function membre(id, name, gender) {
  await call(id, '/me');
  await call(id, '/me/profile', 'PUT', { name, age: 25, gender, intent: 'amitie', city: 'Yaoundé', promptA: 'Le ndolé' });
  await store.updateUser(id, { verification: 'approved' });
}

// Compte les appels d'une méthode du stockage le temps d'un geste, puis la remet en place.
async function pendant(methode, geste) {
  const vrai = store[methode];
  let n = 0;
  store[methode] = async (...args) => { n += 1; return vrai.apply(store, args); };
  try { await geste(); } finally { store[methode] = vrai; }
  return n;
}

// CIBLE porte un pass : c'est **le cas coûteux**, celui où `/summary` a vraiment quelque chose à
// compter. Un test de charge écrit sur un compte gratuit ne prouverait rien — sans pass la
// réponse vaut `null` et la route n'a jamais eu besoin de charger qui que ce soit.
const CIBLE = '800001';
const GRATUIT = '800009';

test('préparer : deux personnes aimées, l\'une avec un pass', async () => {
  await membre(CIBLE, 'Awa', 'femme');
  await membre(GRATUIT, 'Bibiane', 'femme');
  for (const id of ['800002', '800003', '800004']) {
    await membre(id, `Ami${id.slice(-1)}`, 'homme');
    for (const cible of [CIBLE, GRATUIT]) {
      const r = await call(id, '/swipes', 'POST', { targetId: await pid(cible), action: 'like' });
      assert.equal(r.status, 200);
    }
  }
  // Et quelques comptes qui n'ont rien fait : ce sont eux que `allUsers()` chargeait pour rien.
  for (const id of ['800005', '800006', '800007', '800008']) await membre(id, `Autre${id.slice(-1)}`, 'homme');

  const u = await store.getUser(CIBLE);
  await store.updateUser(CIBLE, { plus: prolonger(u, { jours: 30 }) });
});

test('/summary ne charge jamais toute la table, même quand il a des likes à compter', async () => {
  let reponse;
  const n = await pendant('allUsers', async () => { reponse = await call(CIBLE, '/summary'); });
  assert.equal(n, 0, "/summary est appelé toutes les 20 secondes par app ouverte : il ne peut pas charger la table entière");
  assert.equal(reponse.body.likes, 3, 'et le compte reste juste : les trois « J\'aime » reçus');
});

test('ce qu\'il charge est borné par les likes reçus, et part en une seule requête', async () => {
  // Sur une base qui vit sur une autre machine, un appel par identifiant serait pire que le
  // allUsers() qu'on retire : vingt likers feraient vingt allers-retours.
  const lots = await pendant('usersByIds', () => call(CIBLE, '/summary'));
  assert.equal(lots, 1);
});

test('sans pass, il ne charge même pas les likers : la réponse est null quoi qu\'il arrive', async () => {
  let reponse;
  const n = await pendant('usersByIds', async () => { reponse = await call(GRATUIT, '/summary'); });
  assert.equal(reponse.body.likes, null, 'null, et jamais 0 : zéro dirait « personne ne t\'a aimé »');
  assert.equal(n, 0, 'charger des comptes pour un nombre qu\'on ne dira pas est du travail pur');
});

test('/likes rend les mêmes personnes, toujours sans la table', async () => {
  let reponse;
  const n = await pendant('allUsers', async () => { reponse = await call(CIBLE, '/likes'); });
  assert.equal(n, 0);
  assert.equal(reponse.status, 200);
  assert.equal(reponse.body.profiles.length, 3);
  // L'ordre reste le plus récent d'abord : c'est `rel.maLike` qui trie, pas l'ordre de chargement.
  const noms = reponse.body.profiles.map((p) => p.name);
  assert.deepEqual(noms, ['Ami4', 'Ami3', 'Ami2']);
});

test('un like retiré par un blocage ne se compte plus', async () => {
  await call(CIBLE, '/blocks', 'POST', { targetId: await pid('800002') });
  const r = await call(CIBLE, '/summary');
  assert.equal(r.body.likes, 2, 'le filtre de likersOf est inchangé : bloquer retire bien du compte');
});

test.after(() => server.close());
