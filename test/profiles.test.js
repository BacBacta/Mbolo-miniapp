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
// Les routes désignent les autres par leur identifiant public, jamais par l'identifiant Telegram.
const pid = async (id) => (await store.getUser(id))?.pid;
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
  // Ce fichier éprouve la **vue Liste**, qui est elle-même ce que le pass ouvre : chaque compte
  // d'ici en reçoit donc un. Le test qui vérifie qu'elle est fermée sans pass est dans plus.test.js.
  await store.updateUser(id, { verification: 'approved', plus: { source: 'gift', depuisLe: Date.now(), finLe: Date.now() + 30 * 24 * 3600 * 1000 } });
}

// La vue Liste et le pays entier demandent un pass. Ces tests portent sur autre chose : on leur
// en donne un plutôt que de réécrire ce qu'ils éprouvent.
const passer = (id) => store.updateUser(id, { plus: { source: 'gift', depuisLe: Date.now(), finLe: Date.now() + 30 * 24 * 3600 * 1000 } });

test.after(() => server.close());

test('la liste montre tout le monde, balayés compris, avec le bon statut', async () => {
  await makeUser('7101', 'Aline', 'femme'); // moi
  await makeUser('7102', 'Paul', 'homme'); // aimé, sans retour
  await makeUser('7103', 'Marc', 'homme'); // passé
  await makeUser('7104', 'Jean', 'homme'); // match
  await makeUser('7105', 'Luc', 'homme'); // bloqué
  await makeUser('7106', 'Nora', 'femme'); // rien, mais elle m'a liké

  await call('7101', '/swipes', 'POST', { targetId: await pid('7102'), action: 'like' });
  await call('7101', '/swipes', 'POST', { targetId: await pid('7103'), action: 'pass' });
  await call('7104', '/swipes', 'POST', { targetId: await pid('7101'), action: 'like' });
  const m = await call('7101', '/swipes', 'POST', { targetId: await pid('7104'), action: 'like' });
  assert.ok(m.body.match);
  await store.block('7101', '7105');
  await call('7106', '/swipes', 'POST', { targetId: await pid('7101'), action: 'like' });

  const r = await call('7101', '/profiles');
  assert.equal(r.status, 200);
  // Les listes renvoient des identifiants publics : on les relit en identifiants de test.
  for (const p of r.body.profiles) p.id = (await store.userByPid(p.id)).id;
  const by = Object.fromEntries(r.body.profiles.map((p) => [p.id, p]));

  assert.equal(by['7102'].status, 'liked');
  assert.equal(by['7103'].status, 'passed', 'un profil passé reste visible dans la liste');
  assert.equal(by['7104'].status, 'match');
  assert.equal(by['7104'].matchId, m.body.match.id, 'le match renvoie vers sa discussion');
  assert.equal(by['7105'], undefined, 'une personne bloquée n\'apparaît pas');
  assert.equal(by['7106'].status, null);
  assert.equal(by['7106'].likedYou, true, "avec un pass, l'étiquette revient ; sans lui, elle disparaît sans changer la place (plus.test.js)");
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
  const avant = await store.swipesToday('7101');
  await call('7101', '/profiles');
  await call('7101', '/profiles');
  assert.equal(await store.swipesToday('7101'), avant);
});

test('un « Passer » peut devenir un « J\'aime », pas l\'inverse', async () => {
  // Marc, qu'Aline avait passé, l'aime entre-temps ; elle revient sur sa décision
  await call('7103', '/swipes', 'POST', { targetId: await pid('7101'), action: 'like' });
  const p7103 = await pid('7103');
  const lignesAvant = await store.swipesCount('7101');
  const r = await call('7101', '/swipes', 'POST', { targetId: await pid('7103'), action: 'like' });
  assert.ok(r.body.match, 'le rattrapage crée le match');
  assert.equal((await store.swipeOf('7101', '7103')).action, 'like');
  assert.equal(await store.swipesCount('7101'), lignesAvant, 'le rattrapage réutilise le balayage existant, sans nouvelle ligne');
  assert.equal((await call('7101', '/profiles')).body.profiles.find((p) => p.id === p7103).status, 'match');

  // Un like envoyé a pu prévenir la personne : il ne se retire pas en silence
  await call('7101', '/swipes', 'POST', { targetId: await pid('7102'), action: 'pass' });
  assert.equal((await store.swipeOf('7101', '7102')).action, 'like');
});

test('« Nouveau » la première semaine, dérivé sans exposer la date', async () => {
  await makeUser('7201', 'Bilal', 'homme');
  await makeUser('7202', 'Chloé', 'femme');
  await makeUser('7203', 'Dora', 'femme');
  await store.updateUser('7203', { createdAt: Date.now() - 8 * 86400e3 });
  const r = await call('7201', '/profiles');
  const by = Object.fromEntries(r.body.profiles.map((p) => [p.id, p]));
  assert.equal(by[await pid('7202')].isNew, true, 'inscrite aujourd\'hui');
  assert.equal(by[await pid('7203')].isNew, false, 'inscrite il y a huit jours');
  assert.ok(!JSON.stringify(r.body).includes('createdAt'), 'la date d\'inscription ne sort jamais');
});

test('mon quartier d\'abord, sans position GPS', async () => {
  await makeUser('7301', 'Éric', 'homme', 'Bastos');
  await makeUser('7302', 'Fanta', 'femme', 'Essos');
  await makeUser('7303', 'Gaëlle', 'femme', 'Bastos');
  const [p7302, p7303] = [await pid('7302'), await pid('7303')];
  const liste = (await call('7301', '/profiles')).body.profiles.filter((p) => [p7302, p7303].includes(p.id)).map((p) => p.id);
  assert.deepEqual(liste, [p7303, p7302], 'liste : Bastos avant Essos');
  // Le paquet est limité à dix cartes : on vérifie que le quartier passe en tête, pas la présence de tous
  const cartes = (await call('7301', '/discover')).body.profiles.map((p) => p.id);
  assert.equal(cartes[0], p7303, 'cartes : Bastos en tête du paquet');
});

test('le quota du jour ne compte que les « J\'aime »', async () => {
  // Passer un profil qui ne convient pas ne doit pas coûter une journée de découverte
  const avant = await store.swipesToday('7104');
  await call('7104', '/swipes', 'POST', { targetId: await pid('7101'), action: 'pass' });
  assert.equal(await store.swipesToday('7104'), avant, 'un « Passer » ne consomme pas le quota');
  await call('7104', '/swipes', 'POST', { targetId: await pid('7102'), action: 'like' });
  assert.equal(await store.swipesToday('7104'), avant + 1, 'un « J\'aime » consomme le quota');
});

test('la découverte dit pourquoi le paquet est vide', async () => {
  const r = await call('7101', '/discover');
  assert.ok(r.body.vivier, 'le vivier accompagne toujours la réponse');
  assert.equal(typeof r.body.vivier.total, 'number');
  assert.equal(typeof r.body.vivier.horsTranche, 'number');
  assert.equal(typeof r.body.vivier.vus, 'number');

  // Personne de compatible : le total tombe à zéro, et l'app peut le dire au lieu de
  // prétendre qu'on a « tout vu »
  await call('7199', '/me');
  await call('7199', '/me/profile', 'PUT', { name: 'Solitaire', age: 30, gender: 'femme', intent: 'serieux', city: 'Garoua', promptA: 'Le riz sauce arachide' });
  await store.updateUser('7199', { verification: 'approved' });
  const seul = await call('7199', '/discover');
  assert.equal(seul.body.vivier.total, 0);
  assert.equal(seul.body.profiles.length, 0);
});

test('la tranche d\'âge explique un paquet vide sans vivier vide', async () => {
  await call('7198', '/me');
  await call('7198', '/me/profile', 'PUT', { name: 'Exigeant', age: 25, gender: 'homme', intent: 'amitie', city: 'Douala', promptA: 'Le poisson braisé' });
  await store.updateUser('7198', { verification: 'approved' });
  // Tout le monde a 25 ans dans ce jeu de test : une tranche 40-45 vide le paquet sans vider le vivier
  await call('7198', '/me/filters', 'PUT', { ageMin: 40, ageMax: 45 });
  const r = await call('7198', '/discover');
  assert.equal(r.body.profiles.length, 0);
  assert.ok(r.body.vivier.total > 0, 'des profils compatibles existent');
  assert.ok(r.body.vivier.horsTranche > 0, 'ils sont hors de la tranche choisie');
});

// « Mon plat du dimanche » a été retirée de l'inscription. La question est rangée sur le profil
// par sa clé, et des comptes portent encore « plat » : sans filet, leur carte afficherait cette
// clé en clair. Ce test tient les deux bouts — plus proposée, toujours lisible.
test('une question retirée disparaît du choix, sans casser les profils qui l\'avaient', () => {
  const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const bloc = (nom) => source.match(new RegExp(`const ${nom} = \\{([^}]*)\\}`))?.[1] ?? '';

  assert.ok(!/\bplat:/.test(bloc('QUESTIONS')),
    "« plat » ne doit plus être proposée à l'inscription");
  assert.match(bloc('QUESTIONS_RETIREES'), /plat:\s*'Mon plat du dimanche'/,
    'son libellé reste, sinon un ancien profil afficherait « plat » en clair');

  // Le formulaire ne peut pas présélectionner une option que le menu ne contient plus : sans
  // repli, le navigateur choisirait la première en silence et rangerait la réponse de la
  // personne sous une question qu'elle n'a pas choisie.
  assert.match(source, /promptQ: QUESTIONS\[p\.promptQ\] \? p\.promptQ : QUESTION_DEFAUT/,
    'le formulaire retombe sur la question par défaut quand celle du profil est retirée');

  // Et aucun profil de démonstration ne la porte plus : ils sont regardés à chaque test manuel.
  const seed = fs.readFileSync(new URL('../server/seed.js', import.meta.url), 'utf8');
  assert.ok(!/promptQ: 'plat'/.test(seed), 'aucun profil de démonstration ne reste sur « plat »');
});
