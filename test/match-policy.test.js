// La politique de mise en relation, et ce qu'elle décide du genre recherché.
//
// `test/filters.test.js` couvre le cas par défaut, `romance_opposite` : en « Relation sérieuse »,
// l'app met en relation une femme et un homme, personne ne choisit, et rien de l'orientation de
// personne n'est enregistré. Ce fichier-ci couvre l'autre cas, celui d'un déploiement où un
// juriste local a validé qu'on peut lever la règle : elle disparaît, et il faut alors bien que
// la personne dise qui elle cherche — sans quoi elle verrait des profils qu'elle n'a pas demandés.
//
// Le réglage se lit au démarrage : il ne peut donc pas être changé au milieu d'un fichier de
// test, d'où ce fichier séparé.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-policy-'));
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.WEBAPP_URL = 'https://exemple.test';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.SEED_DEMO = 'false';
process.env.AUTO_APPROVE = 'false';
process.env.MATCH_POLICY = 'open';

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
async function membre(id, name, gender, age = 25) {
  await call(id, '/me');
  const r = await call(id, '/me/profile', 'PUT', { name, age, gender, intent: 'serieux', city: 'Bruxelles', country: 'BE', promptA: 'Les frites du coin' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  await store.updateUser(id, { verification: 'approved' });
}
const ids = (r) => r.body.profiles.map((p) => p.id);

test.after(() => server.close());

test("la règle femme/homme ne s'applique plus", async () => {
  await membre('9001', 'Ana', 'femme');
  await membre('9002', 'Bea', 'femme', 26);
  await membre('9003', 'Cyr', 'homme', 27);
  // Sans la règle, tout le monde est compatible : c'est précisément ce qui rend le choix
  // nécessaire, et non plus dangereux à demander.
  const cartes = ids(await call('9001', '/discover'));
  assert.ok(cartes.includes(await pid('9002')), 'deux femmes peuvent se voir');
  assert.ok(cartes.includes(await pid('9003')), 'et les hommes aussi');
});

test("l'app annonce que le genre se choisit, et le range en relation sérieuse", async () => {
  await membre('9010', 'Dina', 'femme');
  assert.equal((await call('9010', '/me')).body.options.genreAuChoix, true,
    "l'écran des filtres se règle sur ce drapeau : sans lui, il afficherait la règle d'un serveur qui ne l'applique plus");

  await membre('9011', 'Eve', 'femme', 26);
  await membre('9012', 'Fred', 'homme', 27);
  const r = await call('9010', '/me/filters', 'PUT', { ageMin: 18, ageMax: 99, gender: 'femme' });
  assert.equal(r.body.filters.gender, 'femme', 'ici, le choix est retenu');

  const cartes = ids(await call('9010', '/discover'));
  assert.ok(cartes.includes(await pid('9011')) && !cartes.includes(await pid('9012')), 'et il trie le paquet');
});

test('une valeur hors de la liste reste refusée', async () => {
  await membre('9020', 'Gaby', 'femme');
  assert.equal((await call('9020', '/me/filters', 'PUT', { ageMin: 18, ageMax: 99, gender: 'autre' })).status, 400);
});

test("changer d'intention n'efface plus un choix qui vaut des deux côtés", async () => {
  await membre('9030', 'Hana', 'femme');
  await call('9030', '/me/filters', 'PUT', { ageMin: 18, ageMax: 99, gender: 'homme' });
  await call('9030', '/me/profile', 'PUT', { name: 'Hana', age: 25, gender: 'femme', intent: 'amitie', city: 'Bruxelles', country: 'BE', promptA: 'Les frites du coin' });
  assert.equal((await call('9030', '/me')).body.filters.gender, 'homme',
    'sous cette politique le champ vaut dans les deux intentions : le nettoyage du cas par défaut ne doit pas s\'y appliquer');
});
