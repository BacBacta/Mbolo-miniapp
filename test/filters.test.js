// Tranche d'âge recherchée et likes reçus : ce que je vois, et qui attend ma réponse.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-filtres-'));
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
async function makeUser(id, name, gender, age = 25) {
  await call(id, '/me');
  const r = await call(id, '/me/profile', 'PUT', { name, age, gender, intent: 'amitie', city: 'Douala', promptA: 'Le poisson braisé' });
  assert.equal(r.status, 200);
  await store.updateUser(id, { verification: 'approved' });
}
const ids = (r) => r.body.profiles.map((p) => p.id);
// La vue Liste demande un pass : ces tests portent sur les filtres, pas sur la porte.
const listeDe = async (id) => { await passer(id); return ids(await call(id, '/profiles')); };
// Un pass offert : voir qui t'a aimé est ce qu'il ouvre, donc ces tests-là en ont besoin.
const passer = async (id) => store.updateUser(id, { plus: { source: 'gift', depuisLe: Date.now(), finLe: Date.now() + 30 * 24 * 3600 * 1000 } });

test.after(() => server.close());

test('la tranche d\'âge se règle, se relit, et refuse l\'absurde', async () => {
  await makeUser('7401', 'Aline', 'femme');
  // Par défaut : tous les âges, et la zone est la ville du profil
  assert.deepEqual((await call('7401', '/me')).body.filters, { ageMin: 18, ageMax: 99, gender: '', verifiesSeulement: false, zone: { country: 'CM', city: 'Douala' } }, 'par défaut : tout le monde, dans ma ville');
  assert.equal((await call('7401', '/me/filters', 'PUT', { ageMin: 30, ageMax: 25 })).status, 400, 'min > max');
  assert.equal((await call('7401', '/me/filters', 'PUT', { ageMin: 17, ageMax: 25 })).status, 400, 'jamais de mineur');
  assert.equal((await call('7401', '/me/filters', 'PUT', { ageMin: 'x', ageMax: 25 })).status, 400);
  const r = await call('7401', '/me/filters', 'PUT', { ageMin: 24, ageMax: 30 });
  assert.equal(r.status, 200);
  assert.deepEqual((await call('7401', '/me')).body.filters, { ageMin: 24, ageMax: 30, gender: '', verifiesSeulement: false, zone: { country: 'CM', city: 'Douala' } }, "une requête sans zone ne touche pas à la zone");
});

test('cartes et liste respectent la tranche ; un like reçu l\'ignore', async () => {
  await makeUser('7402', 'Paul', 'homme', 27); // dans la tranche
  await makeUser('7403', 'Marc', 'homme', 40); // hors tranche
  await makeUser('7404', 'Jean', 'homme', 45); // hors tranche, mais il m'a liké
  await call('7404', '/swipes', 'POST', { targetId: await pid('7401'), action: 'like' });

  const cartes = ids(await call('7401', '/discover'));
  assert.ok(cartes.includes(await pid('7402')) && !cartes.includes(await pid('7403')) && !cartes.includes(await pid('7404')), 'le paquet filtre par âge');

  // Les deux portes fermées se vérifient **avant** qu'un pass entre en jeu : `listeDe()` en pose
  // un, et l'ordre de ces lignes est donc ce qui fait que ce test dit encore quelque chose.
  const sansPass = await call('7401', '/likes');
  assert.equal(sansPass.status, 403, 'sans pass, la liste des « J\'aime » ne s\'ouvre pas');
  assert.equal(sansPass.body.code, 'PASS_REQUIS');
  assert.equal((await call('7401', '/summary')).body.likes, null, 'et le compteur ne dit pas zéro : il ne dit rien');
  assert.equal((await call('7401', '/profiles')).status, 403, 'la vue Liste non plus');

  const liste = await listeDe('7401'); // pose le pass, puis lit
  assert.ok(liste.includes(await pid('7402')) && !liste.includes(await pid('7403')), 'la liste aussi respecte la tranche');
  const likes = await call('7401', '/likes');
  assert.deepEqual(ids(likes), [await pid('7404')], 'Jean, hors tranche, apparaît quand même dans les likes reçus');
  assert.equal(likes.body.profiles[0].activity, 'week', 'activité rabattue avant le match');
  assert.ok(!JSON.stringify(likes.body).includes('lastActiveAt'));
  assert.equal((await call('7401', '/summary')).body.likes, 1, 'le compteur de l\'onglet compte ce like');
});

test('un like reçu disparaît des likes dès que j\'ai répondu', async () => {
  await call('7401', '/swipes', 'POST', { targetId: await pid('7404'), action: 'pass' });
  assert.deepEqual(ids(await call('7401', '/likes')), [], 'passé : plus en attente');
  assert.equal((await call('7401', '/summary')).body.likes, 0);
  // Bloqué : jamais listé, même s'il a liké
  await makeUser('7405', 'Luc', 'homme', 26);
  await call('7405', '/swipes', 'POST', { targetId: await pid('7401'), action: 'like' });
  await store.block('7401', '7405');
  assert.deepEqual(ids(await call('7401', '/likes')), []);
});

// ---------- Le genre recherché ----------
//
// Il ne vaut qu'en Amitié, et c'est le cœur de ces tests. En « Relation sérieuse », la mise en
// relation est déjà décidée par MATCH_POLICY (une femme et un homme) : y laisser un choix
// reviendrait à enregistrer l'orientation de chacun, ce que la règle 5.2 interdit. Le champ n'y
// est donc ni lu ni rangé — et le sabotage qui le rangerait quand même tombe ici.

const profil = (id, champs) => call(id, '/me/profile', 'PUT', {
  name: 'X', age: 25, gender: 'femme', intent: 'amitie', city: 'Douala', promptA: 'Le poisson braisé', ...champs,
});

test('en amitié, le genre recherché se règle et le paquet le suit', async () => {
  await makeUser('7410', 'Awa', 'femme');
  await makeUser('7411', 'Bea', 'femme', 26);
  await makeUser('7412', 'Cyr', 'homme', 26);

  assert.ok(ids(await call('7410', '/discover')).includes(await pid('7412')), 'sans filtre, les deux passent');

  const r = await call('7410', '/me/filters', 'PUT', { ageMin: 18, ageMax: 99, gender: 'femme' });
  assert.equal(r.status, 200);
  assert.equal(r.body.filters.gender, 'femme', 'le choix est rendu tel quel');

  const cartes = ids(await call('7410', '/discover'));
  assert.ok(cartes.includes(await pid('7411')), 'les femmes restent');
  assert.ok(!cartes.includes(await pid('7412')), 'les hommes sortent du paquet');
  assert.ok(!(await listeDe('7410')).includes(await pid('7412')), 'et de la liste aussi');

  // Revenir à « tout le monde » est un choix comme un autre : la chaîne vide, pas une absence.
  await call('7410', '/me/filters', 'PUT', { ageMin: 18, ageMax: 99, gender: '' });
  assert.ok(ids(await call('7410', '/discover')).includes(await pid('7412')), 'tout le monde revient');
});

test('un genre hors de la liste est refusé, jamais rangé tel quel', async () => {
  await makeUser('7420', 'Dina', 'femme');
  const r = await call('7420', '/me/filters', 'PUT', { ageMin: 18, ageMax: 99, gender: 'autre' });
  assert.equal(r.status, 400, 'liste fermée, comme les réponses de compatibilité (règle 5.1)');
  assert.equal((await call('7420', '/me')).body.filters.gender, '', 'et rien ne reste derrière');
});

test('sous la politique par défaut, l\'app annonce que le genre ne se choisit pas', async () => {
  await makeUser('7425', 'Coco', 'femme');
  assert.equal((await call('7425', '/me')).body.options.genreAuChoix, false,
    "c'est ce drapeau qui fait afficher la règle plutôt qu'un réglage : faux ici, vrai sous une politique levée (test/match-policy.test.js)");
});

test("en relation sérieuse, le genre recherché n'est ni lu ni rangé", async () => {
  await makeUser('7430', 'Eve', 'femme');
  await profil('7430', { name: 'Eve', intent: 'serieux' });

  // La requête est acceptée — refuser ferait échouer un enregistrement ordinaire des filtres —
  // mais le genre n'est pas retenu : le serveur ne garde pas une donnée qu'il n'a pas le droit
  // de lire. Sans quoi une colonne « je cherche des femmes » sur une femme dirait son orientation.
  const r = await call('7430', '/me/filters', 'PUT', { ageMin: 18, ageMax: 99, gender: 'femme' });
  assert.equal(r.status, 200);
  assert.equal(r.body.filters.gender, '', "aucune orientation ne s'enregistre ici");
  assert.equal((await call('7430', '/me')).body.filters.gender, '', 'et rien au rechargement');

  // Et la règle de mise en relation, elle, continue de faire son travail.
  await makeUser('7431', 'Fara', 'femme', 26);
  await profil('7431', { name: 'Fara', intent: 'serieux' });
  assert.ok(!ids(await call('7430', '/discover')).includes(await pid('7431')), 'femme et femme ne se voient pas en relation sérieuse');
});

test("quitter l'amitié efface le genre recherché", async () => {
  await makeUser('7440', 'Gaby', 'femme');
  await call('7440', '/me/filters', 'PUT', { ageMin: 18, ageMax: 99, gender: 'homme' });
  assert.equal((await call('7440', '/me')).body.filters.gender, 'homme');

  // Même règle que pour les réponses de compatibilité (P1-4) : un réglage qui ne s'applique plus
  // ne reste pas rangé dans la base, où il ressortirait sans avoir été reconfirmé.
  await profil('7440', { name: 'Gaby', intent: 'serieux' });
  assert.equal((await call('7440', '/me')).body.filters.gender, '', "le genre part avec l'intention");
  assert.equal((await call('7440', '/me')).body.filters.ageMin, 18, 'le reste des filtres est intact');
});
