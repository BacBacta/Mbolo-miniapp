// Liste des profils : tout le monde y figure, balayés compris, avec son statut.
// Parcourir ne consomme rien ; un « Passer » peut être rattrapé, un « J'aime » ne se retire pas.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-liste-'));
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
const call = async (user, p, method = 'GET', body) => {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', 'x-dev-user': user }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
async function makeUser(id, name, gender, area = '') {
  await call(id, '/me');
  const r = await call(id, '/me/profile', 'PUT', { name, age: 25, gender, intent: 'amitie', city: 'Douala', area, promptA: 'Le poisson braisé' });
  assert.equal(r.status, 200);
  store.updateUser(id, { verification: 'approved' });
}

test.after(() => server.close());

test('la liste montre tout le monde, balayés compris, avec le bon statut', async () => {
  await makeUser('7101', 'Aline', 'femme'); // moi
  await makeUser('7102', 'Paul', 'homme'); // aimé, sans retour
  await makeUser('7103', 'Marc', 'homme'); // passé
  await makeUser('7104', 'Jean', 'homme'); // match
  await makeUser('7105', 'Luc', 'homme'); // bloqué
  await makeUser('7106', 'Nora', 'femme'); // rien, mais elle m'a liké

  await call('7101', '/swipes', 'POST', { targetId: '7102', action: 'like' });
  await call('7101', '/swipes', 'POST', { targetId: '7103', action: 'pass' });
  await call('7104', '/swipes', 'POST', { targetId: '7101', action: 'like' });
  const m = await call('7101', '/swipes', 'POST', { targetId: '7104', action: 'like' });
  assert.ok(m.body.match);
  store.block('7101', '7105');
  await call('7106', '/swipes', 'POST', { targetId: '7101', action: 'like' });

  const r = await call('7101', '/profiles');
  assert.equal(r.status, 200);
  const by = Object.fromEntries(r.body.profiles.map((p) => [p.id, p]));

  assert.equal(by['7102'].status, 'liked');
  assert.equal(by['7103'].status, 'passed', 'un profil passé reste visible dans la liste');
  assert.equal(by['7104'].status, 'match');
  assert.equal(by['7104'].matchId, m.body.match.id, 'le match renvoie vers sa discussion');
  assert.equal(by['7105'], undefined, 'une personne bloquée n\'apparaît pas');
  assert.equal(by['7106'].status, null);
  assert.equal(by['7106'].likedYou, true);
  assert.equal(by['7101'], undefined, 'on ne se liste pas soi-même');

  assert.equal(r.body.profiles[0].id, '7106', 'ceux qui attendent ma réponse passent en premier');
  assert.equal(r.body.profiles.at(-1).id, '7104', 'les matchs, déjà dans Messages, ferment la liste');

  // Activité : tranche fine pour le match seulement, « cette semaine » au plus pour les autres
  assert.equal(by['7104'].activity, 'recent');
  assert.equal(by['7102'].activity, 'week');
  assert.equal(by['7106'].activity, 'week');

  const brut = JSON.stringify(r.body);
  assert.ok(!brut.includes('lastActiveAt'), 'jamais l\'horodatage');
  assert.ok(!brut.includes('"since"'), 'la clé de tri ne sort pas');
});

test('parcourir la liste ne consomme pas le quota', async () => {
  const avant = store.swipesToday('7101');
  await call('7101', '/profiles');
  await call('7101', '/profiles');
  assert.equal(store.swipesToday('7101'), avant);
});

test('un « Passer » peut devenir un « J\'aime », pas l\'inverse', async () => {
  // Marc, qu'Aline avait passé, l'aime entre-temps ; elle revient sur sa décision
  await call('7103', '/swipes', 'POST', { targetId: '7101', action: 'like' });
  const lignesAvant = store.swipesCount('7101');
  const r = await call('7101', '/swipes', 'POST', { targetId: '7103', action: 'like' });
  assert.ok(r.body.match, 'le rattrapage crée le match');
  assert.equal(store.swipeOf('7101', '7103').action, 'like');
  assert.equal(store.swipesCount('7101'), lignesAvant, 'le rattrapage réutilise le balayage existant, sans nouvelle ligne');
  assert.equal((await call('7101', '/profiles')).body.profiles.find((p) => p.id === '7103').status, 'match');

  // Un like envoyé a pu prévenir la personne : il ne se retire pas en silence
  await call('7101', '/swipes', 'POST', { targetId: '7102', action: 'pass' });
  assert.equal(store.swipeOf('7101', '7102').action, 'like');
});

test('« Nouveau » la première semaine, dérivé sans exposer la date', async () => {
  await makeUser('7201', 'Bilal', 'homme');
  await makeUser('7202', 'Chloé', 'femme');
  await makeUser('7203', 'Dora', 'femme');
  store.updateUser('7203', { createdAt: Date.now() - 8 * 86400e3 });
  const r = await call('7201', '/profiles');
  const by = Object.fromEntries(r.body.profiles.map((p) => [p.id, p]));
  assert.equal(by['7202'].isNew, true, 'inscrite aujourd\'hui');
  assert.equal(by['7203'].isNew, false, 'inscrite il y a huit jours');
  assert.ok(!JSON.stringify(r.body).includes('createdAt'), 'la date d\'inscription ne sort jamais');
});

test('mon quartier d\'abord, sans position GPS', async () => {
  await makeUser('7301', 'Éric', 'homme', 'Bastos');
  await makeUser('7302', 'Fanta', 'femme', 'Essos');
  await makeUser('7303', 'Gaëlle', 'femme', 'Bastos');
  const liste = (await call('7301', '/profiles')).body.profiles.filter((p) => ['7302', '7303'].includes(p.id)).map((p) => p.id);
  assert.deepEqual(liste, ['7303', '7302'], 'liste : Bastos avant Essos');
  // Le paquet est limité à dix cartes : on vérifie que le quartier passe en tête, pas la présence de tous
  const cartes = (await call('7301', '/discover')).body.profiles.map((p) => p.id);
  assert.equal(cartes[0], '7303', 'cartes : Bastos en tête du paquet');
});

test('le quota du jour ne compte que les « J\'aime »', async () => {
  // Passer un profil qui ne convient pas ne doit pas coûter une journée de découverte
  const avant = store.swipesToday('7104');
  await call('7104', '/swipes', 'POST', { targetId: '7101', action: 'pass' });
  assert.equal(store.swipesToday('7104'), avant, 'un « Passer » ne consomme pas le quota');
  await call('7104', '/swipes', 'POST', { targetId: '7102', action: 'like' });
  assert.equal(store.swipesToday('7104'), avant + 1, 'un « J\'aime » consomme le quota');
});
