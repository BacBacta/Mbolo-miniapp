// « Qui s'est arrêté sur ta fiche » : les trois refus, éprouvés un par un.
//
// La fonction ne collecte rien de neuf — elle relit les balayages qui existent depuis toujours.
// Ce qui la rend tenable n'est donc pas ce qu'elle enregistre, c'est ce qu'elle **refuse de
// montrer**, et c'est exactement ce que ce fichier essaie de casser :
//
//   1. l'issue du balayage ne sort jamais, sous aucune forme ;
//   2. le compte est arrondi et la liste coupée à cinq — sinon la soustraire à « qui t'a aimé »
//      donnerait la liste de ceux qui ont refusé, ce qu'aucun produit ne devrait fabriquer ;
//   3. l'opposition est gratuite et symétrique : elle rend invisible **et** aveugle.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-vues-'));
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.WEBAPP_URL = 'https://exemple.test';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.SEED_DEMO = 'false';
process.env.AUTO_APPROVE = 'false';

const express = (await import('express')).default;
const { store } = await import('../server/store.js');
const pid = async (id) => (await store.getUser(id))?.pid;
const { arrondir, dansLaFenetre, discret, FENETRE_MS, MAX_FICHES } = await import('../server/vues.js');
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
  const r = await call(id, '/me/profile', 'PUT', { name, age, gender, intent: 'amitie', city: 'Douala', promptA: 'Le poisson braisé' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  await store.updateUser(id, { verification: 'approved' });
}
const passer = (id) => store.updateUser(id, { plus: { source: 'gift', depuisLe: Date.now(), finLe: Date.now() + 30 * 24 * 3600 * 1000 } });
// Un balayage posé directement : la route /swipes est limitée par le quota du jour, et ce
// fichier a besoin de bien plus de cinq passages pour éprouver l'arrondi.
const arret = (de, vers, action) => store.addSwipe(de, vers, action);

test.after(() => server.close());

test("l'arrondi est assez grossier pour qu'on ne puisse rien soustraire", () => {
  assert.deepEqual(arrondir(0), { forme: 'aucune', n: 0 }, 'zéro se dit : il n\'y a rien à cacher');
  for (const n of [1, 2, 3, 4]) assert.deepEqual(arrondir(n), { forme: 'moins', n: 5 }, `${n} → moins de 5`);
  assert.deepEqual(arrondir(5), { forme: 'plus', n: 5 });
  assert.deepEqual(arrondir(9), { forme: 'plus', n: 5 }, '9 et 5 se disent pareil : c\'est le but');
  assert.deepEqual(arrondir(12), { forme: 'plus', n: 10 });
  assert.deepEqual(arrondir(23), { forme: 'plus', n: 20 });
  // Rien d'illisible ne devient un nombre : une donnée abîmée dit « personne », jamais l'inverse.
  for (const mauvais of [undefined, null, NaN, Infinity, -3, 'douze']) {
    assert.deepEqual(arrondir(mauvais), { forme: 'aucune', n: 0 }, `refusé : ${mauvais}`);
  }
});

test("la fenêtre laisse dehors ce qui est vieux, et l'issue ne la traverse pas", () => {
  const t0 = 1_700_000_000_000;
  const swipes = [
    { from: 'a', to: 'moi', action: 'like', at: t0 - 1000 },
    { from: 'b', to: 'moi', action: 'pass', at: t0 - FENETRE_MS - 1 },
    { from: 'moi', to: 'moi', action: 'like', at: t0 },
  ];
  const dedans = dansLaFenetre(swipes, 'moi', t0);
  assert.deepEqual(dedans.map((x) => x.from), ['a'], 'trop vieux dehors, et on ne se compte pas soi-même');
  // La fenêtre s'éprouve ici et pas à travers la route : le stockage ne sait pas antidater un
  // balayage, et lui apprendre à le faire pour la commodité d'un test ouvrirait une porte —
  // une date de balayage qu'un appelant choisit est une date qu'un appelant peut mentir.
  // La route n'a qu'une ligne vers cette fonction, et c'est la fonction qui porte la règle.
  // Le refus n° 1 tient parce que la donnée ne traverse pas la fonction : elle n'est pas
  // recopiée, donc aucune ligne en aval ne peut la laisser fuir.
  assert.ok(dedans.every((x) => !('action' in x)), "l'issue du balayage ne sort pas d'ici");
  assert.equal(discret({ discretion: true }), true);
  assert.equal(discret({}), false);
  assert.equal(discret({ discretion: 'oui' }), false, 'seul le booléen compte');
});

test('sans pass, la liste se montre floutée ; avec, elle est arrondie et coupée', async () => {
  await membre('9201', 'Awa', 'femme');
  const cible = await pid('9201');
  assert.equal(cible.length > 0, true);

  const vide = await call('9201', '/vues');
  assert.equal(vide.status, 200);
  assert.deepEqual(vide.body, { discret: false, flou: true, arrondi: { forme: 'aucune', n: 0 }, apercus: [], profiles: [] });

  // Douze personnes s'arrêtent, six en aimant et six en passant.
  for (let i = 0; i < 12; i += 1) {
    await membre(`93${String(i).padStart(2, '0')}`, `Passant${i}`, 'homme', 26);
    await arret(`93${String(i).padStart(2, '0')}`, '9201', i % 2 ? 'like' : 'pass');
  }
  // Sans pass : le même arrondi, le même plafond, mais des aperçus à la place des fiches — et
  // rien dans la réponse qui nomme quelqu'un.
  const sans = await call('9201', '/vues');
  assert.equal(sans.status, 200);
  assert.equal(sans.body.flou, true);
  assert.deepEqual(sans.body.arrondi, { forme: 'plus', n: 10 });
  assert.equal(sans.body.apercus.length, MAX_FICHES, 'cinq aperçus, pas douze');
  assert.deepEqual(sans.body.profiles, []);
  const flou = JSON.stringify(sans.body);
  assert.ok(!flou.includes('Passant'), 'aucun prénom');
  for (let i = 0; i < 12; i += 1) assert.ok(!flou.includes(await pid(`93${String(i).padStart(2, '0')}`)), 'aucun identifiant public');
  assert.ok(!/"(like|pass)"/.test(flou), "et l'issue ne sort pas davantage sans pass");

  await passer('9201');
  const r = await call('9201', '/vues');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.arrondi, { forme: 'plus', n: 10 }, 'douze se dit « plus de 10 », jamais douze');
  assert.equal(r.body.profiles.length, MAX_FICHES, 'cinq fiches, pas douze');
  assert.equal(r.body.discret, false);

  // Le refus n° 1, jusque dans la réponse HTTP : ni le mot, ni la valeur.
  const brut = JSON.stringify(r.body);
  assert.ok(!brut.includes('"action"'), "l'issue du balayage ne sort pas du serveur");
  assert.ok(!/"(like|pass)"/.test(brut), "ni sa valeur, sous aucun nom");
  assert.ok(r.body.profiles.every((p) => p.likedYou === false), 'et la pastille des « J\'aime » ne sert pas de fuite');
});

test("l'opposition rend invisible et aveugle, et elle est gratuite", async () => {
  await membre('9210', 'Bea', 'femme', 27);
  await membre('9211', 'Cyr', 'homme', 27);
  await membre('9212', 'Dany', 'homme', 28);
  await arret('9211', '9210', 'like');
  await arret('9212', '9210', 'pass');
  await passer('9210');
  assert.equal((await call('9210', '/vues')).body.profiles.length, 2, 'les deux sont là au départ');

  // Le réglage ne demande pas de pass : on ne vend pas le droit de ne pas être montré.
  assert.equal((await call('9211', '/me')).body.plus.actif, false, 'Cyr n\'a pas de pass');
  const mis = await call('9211', '/me/discretion', 'PUT', { discret: true });
  assert.equal(mis.status, 200);
  assert.equal(mis.body.discretion, true);
  assert.equal((await call('9211', '/me')).body.discretion, true, 'et le réglage se relit');
  assert.equal((await call('9211', '/me/discretion', 'PUT', { discret: 'oui' })).status, 400, 'liste fermée');

  const apres = await call('9210', '/vues');
  assert.deepEqual(apres.body.profiles.map((p) => p.name), ['Dany'], 'Cyr disparaît de chez Béa');

  // Symétrie : Cyr ne voit pas la liste chez lui non plus, même avec un pass.
  await passer('9211');
  await arret('9212', '9211', 'like');
  const chezCyr = await call('9211', '/vues');
  assert.equal(chezCyr.status, 200, 'la route répond : se retirer n\'est pas une panne');
  assert.equal(chezCyr.body.discret, true);
  assert.deepEqual(chezCyr.body.profiles, [], 'invisible et aveugle, des deux côtés');
  assert.deepEqual(chezCyr.body.arrondi, { forme: 'aucune', n: 0 });

  // Et l'on peut revenir : un retrait n'est pas un aller simple.
  await call('9211', '/me/discretion', 'PUT', { discret: false });
  assert.deepEqual((await call('9211', '/vues')).body.profiles.map((p) => p.name), ['Dany']);
  assert.deepEqual((await call('9210', '/vues')).body.profiles.map((p) => p.name).sort(), ['Cyr', 'Dany']);
});

test('un compte fermé ou bloqué ne s\'est arrêté sur la fiche de personne', async () => {
  await membre('9220', 'Eve', 'femme', 29);
  await membre('9221', 'Fabrice', 'homme', 29);
  await membre('9222', 'Gaston', 'homme', 29);
  await arret('9221', '9220', 'like');
  await arret('9222', '9220', 'pass');
  await passer('9220');
  assert.equal((await call('9220', '/vues')).body.profiles.length, 2);

  await store.banUser('9221', { motif: 'test', par: 'test' });
  await store.block('9220', '9222');
  const r = await call('9220', '/vues');
  assert.deepEqual(r.body.profiles, [], 'un compte fermé et une personne bloquée sortent des deux');
  assert.deepEqual(r.body.arrondi, { forme: 'aucune', n: 0 }, 'le compte et la liste sortent du même ensemble');
});
