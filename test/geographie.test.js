// Ouverture internationale : le pays vient d'une liste, la ville est libre, et la zone de
// recherche appartient à chacun. Une ville écrite de deux façons ne doit pas couper le vivier.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-geo-'));
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.SEED_DEMO = 'false';
process.env.AUTO_APPROVE = 'false';

const express = (await import('express')).default;
const { store } = await import('../server/store.js');
const { bot } = await import('../server/bot.js');
const { api } = await import('../server/routes.js');
const { cleVille, estPays, nomPays, listePays, villesConnues, paysDuFuseau } = await import('../server/geo.js');

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
async function creer(id, name, gender, country, city, extra = {}) {
  await call(id, '/me');
  const r = await call(id, '/me/profile', 'PUT', { name, age: 25, gender, intent: 'amitie', country, city, promptA: 'Le poisson braisé', ...extra });
  assert.equal(r.status, 200, `profil de ${name} : ${JSON.stringify(r.body)}`);
  await store.updateUser(id, { verification: 'approved' });
  return r.body.profile;
}
const vus = async (id) => (await call(id, '/discover')).body.profiles.map((p) => p.name);

test.after(() => server.close());

test('une ville écrite de deux façons donne une seule clé', () => {
  assert.equal(cleVille('Yaoundé'), cleVille('YAOUNDE'));
  assert.equal(cleVille('Yaoundé'), cleVille('  yaounde  '));
  assert.equal(cleVille("N'Djaména"), cleVille('N Djamena'));
  assert.equal(cleVille('Saint-Louis'), cleVille('saint louis'));
  assert.notEqual(cleVille('Douala'), cleVille('Douala2'));
  assert.equal(cleVille(''), '');
});

test('les pays viennent d\'une liste et se nomment dans la langue de la personne', () => {
  assert.equal(estPays('CM'), true);
  assert.equal(estPays('cm'), true, 'la casse ne compte pas');
  assert.equal(estPays('XX'), false);
  assert.equal(estPays(''), false);
  assert.equal(nomPays('CM', 'fr'), 'Cameroun');
  assert.equal(nomPays('CM', 'en'), 'Cameroon');
  assert.ok(listePays('fr').length > 200, 'la liste couvre le monde');
  assert.ok(villesConnues('CM').includes('Yaoundé'), 'des suggestions existent pour le Cameroun');
  assert.deepEqual(villesConnues('XX'), [], 'et aucune pour un code inconnu');
});

test('le profil accepte une ville libre et un pays de la liste', async () => {
  const p = await creer('9101', 'Fatou', 'femme', 'SN', '  dakar ');
  assert.equal(p.country, 'SN');
  assert.equal(p.city, 'Dakar', 'la ville est mise en forme pour l\'affichage');
  assert.equal(p.cityKey, 'dakar');

  const vide = await call('9102', '/me/profile', 'PUT', { name: 'Sans ville', age: 25, gender: 'homme', intent: 'amitie', country: 'SN', city: ' ', promptA: 'Le thieboudienne' });
  assert.equal(vide.status, 400);
  assert.equal(vide.body.code, 'CITY_REQUIRED');
});

test('une ville tapée n\'importe comment s\'affiche proprement, sans changer le vivier', async () => {
  const a = await creer('9104', 'Majuscule', 'femme', 'SN', 'SAINT-LOUIS');
  assert.equal(a.city, 'Saint-Louis');
  assert.equal(a.cityKey, 'saint louis');
  const b = await creer('9105', 'Minuscule', 'homme', 'SN', "  saint   louis ");
  assert.equal(b.city, 'Saint Louis');
  assert.equal(b.cityKey, 'saint louis', 'la clé reste la même, donc le vivier aussi');
  assert.deepEqual(await vus('9104'), ['Minuscule']);
});

test('un profil sans pays garde le pays par défaut, pour ne pas casser les comptes existants', async () => {
  const p = await creer('9103', 'Ancien', 'homme', undefined, 'Douala');
  assert.equal(p.country, 'CM');
});

test('deux orthographes de la même ville se voient', async () => {
  await creer('9111', 'Awa', 'femme', 'CM', 'Yaoundé');
  await creer('9112', 'Eric', 'homme', 'CM', 'YAOUNDE');
  assert.deepEqual(await vus('9111'), ['Eric']);
  assert.deepEqual(await vus('9112'), ['Awa']);
});

test('deux villes du même pays ne se voient pas, sauf à élargir au pays', async () => {
  await creer('9121', 'Bea', 'femme', 'GA', 'Port-Gentil');
  await creer('9122', 'Cyrille', 'homme', 'GA', 'Franceville');
  assert.deepEqual(await vus('9121'), [], 'chacun dans sa ville');

  const r = await call('9121', '/me/filters', 'PUT', { ageMin: 18, ageMax: 99, zone: { country: 'GA', city: null } });
  assert.equal(r.status, 200);
  assert.equal(r.body.filters.zone.city, null);
  assert.deepEqual(await vus('9121'), ['Cyrille'], 'tout le pays');
  assert.deepEqual(await vus('9122'), [], "la zone de l'un ne s'impose pas à l'autre");
});

test('on peut chercher dans une autre ville que la sienne', async () => {
  await creer('9131', 'Diane', 'femme', 'CM', 'Garoua');
  await creer('9132', 'Ernest', 'homme', 'CM', 'Maroua');
  assert.deepEqual(await vus('9131'), []);
  await call('9131', '/me/filters', 'PUT', { ageMin: 18, ageMax: 99, zone: { country: 'CM', city: 'maroua' } });
  assert.deepEqual(await vus('9131'), ['Ernest']);
});

test('deux pays ne se mélangent jamais', async () => {
  await creer('9141', 'Aminata', 'femme', 'CI', 'Abidjan');
  await creer('9142', 'Koffi', 'homme', 'CI', 'Abidjan');
  await creer('9143', 'Lointain', 'homme', 'FR', 'Abidjan');
  assert.deepEqual(await vus('9141'), ['Koffi'], 'la même ville dans un autre pays ne compte pas');

  // Et l'on peut viser un autre pays : la diaspora qui prépare un voyage
  await call('9141', '/me/filters', 'PUT', { ageMin: 18, ageMax: 99, zone: { country: 'FR', city: null } });
  assert.deepEqual(await vus('9141'), ['Lointain']);
});

test('une zone invalide est refusée avec un message clair', async () => {
  await creer('9151', 'Zoé', 'femme', 'CM', 'Yaoundé');
  const r = await call('9151', '/me/filters', 'PUT', { ageMin: 18, ageMax: 99, zone: { country: 'CM', city: 'x' } });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'ZONE_INVALID');
  const pays = await call('9151', '/me/filters', 'PUT', { ageMin: 18, ageMax: 99, zone: { country: 'ZZ', city: null } });
  assert.equal(pays.status, 200, 'un code de pays inconnu retombe sur la zone en place');
  assert.equal(pays.body.filters.zone.country, 'CM');
});

test('un like reçu de hors zone atteint quand même la personne', async () => {
  await creer('9161', 'Nina', 'femme', 'BJ', 'Parakou');
  await creer('9162', 'Olivier', 'homme', 'BJ', 'Cotonou');
  // Olivier élargit au pays, voit Nina, et l'aime. Nina ne cherche que sa ville.
  await call('9162', '/me/filters', 'PUT', { ageMin: 18, ageMax: 99, zone: { country: 'BJ', city: null } });
  assert.deepEqual(await vus('9162'), ['Nina']);
  await call('9162', '/swipes', 'POST', { targetId: '9161', action: 'like' });

  const likes = (await call('9161', '/likes')).body.profiles.map((p) => p.name);
  assert.deepEqual(likes, ['Olivier'], "un signal qui m'est adressé traverse ma zone");
});

test('les lieux partenaires suivent le pays et la ville', async () => {
  await creer('9171', 'Paule', 'femme', 'CM', 'Yaoundé');
  const yde = await call('9171', '/venues');
  assert.ok(yde.body.venues.length >= 3, 'Yaoundé a ses lieux');
  assert.equal(yde.body.partenairesDansLePays, true);

  await creer('9172', 'Rita', 'femme', 'CM', 'Kribi');
  const kribi = await call('9172', '/venues');
  assert.deepEqual(kribi.body.venues, [], 'aucun lieu à Kribi');
  assert.equal(kribi.body.partenairesDansLePays, true, 'mais le pays en a ailleurs');

  await creer('9173', 'Sophie', 'femme', 'SN', 'Dakar');
  const dakar = await call('9173', '/venues');
  assert.deepEqual(dakar.body.venues, []);
  assert.equal(dakar.body.partenairesDansLePays, false, 'aucun lieu au Sénégal pour le moment');
});

test('un rendez-vous ne peut pas être proposé dans un lieu d\'un autre pays', async () => {
  await creer('9181', 'Tania', 'femme', 'SN', 'Dakar');
  await creer('9182', 'Ulysse', 'homme', 'SN', 'Dakar');
  await call('9181', '/swipes', 'POST', { targetId: '9182', action: 'like' });
  const m = await call('9182', '/swipes', 'POST', { targetId: '9181', action: 'like' });
  const matchId = m.body.match.id;
  const r = await call('9181', `/matches/${matchId}/dates`, 'POST', { venueId: 'palmier', slot: 'samedi 15h' });
  assert.equal(r.status, 400, 'Le Palmier est à Yaoundé, pas à Dakar');
  assert.equal(r.body.code, 'DATE_INVALID');
});

// ------------------------------------------------------------------
// Localisation : le fuseau du téléphone donne le pays, et rien d'autre
// ------------------------------------------------------------------

test('le fuseau du téléphone donne le pays, sans GPS ni service externe', () => {
  assert.equal(paysDuFuseau('Africa/Douala'), 'CM');
  assert.equal(paysDuFuseau('America/New_York'), 'US');
  assert.equal(paysDuFuseau('Europe/Paris'), 'FR');
  assert.equal(paysDuFuseau('Africa/Dakar'), 'SN');
  assert.equal(paysDuFuseau('Pacific/Auckland'), 'NZ');
  // Anciens noms encore renvoyés par des Android d'entrée de gamme
  assert.equal(paysDuFuseau('Asia/Calcutta'), 'IN', 'alias historique de Asia/Kolkata');
  assert.equal(paysDuFuseau('Europe/Kiev'), 'UA', 'alias historique de Europe/Kyiv');
  // Un fuseau absurde ne casse rien : l'appelant gardera son pays par défaut
  for (const absurde of ['', null, undefined, 'Terre/Milieu', 'x'.repeat(200), '../../etc/passwd']) {
    assert.equal(paysDuFuseau(absurde), null, `fuseau refusé : ${absurde}`);
  }
});

test('le fuseau préremplit le pays à l\'inscription, mais ne décide de rien', async () => {
  const r = await call('9601', '/me?tz=Africa/Dakar');
  assert.equal(r.body.options.suggestedCountry, 'SN', 'le pays est proposé au navigateur');
  assert.equal(r.body.profile, null, 'rien n\'est encore écrit dans le profil');

  // La personne garde la main : elle s'inscrit ailleurs, et c'est son choix qui compte
  const p = await creer('9601', 'Voyageuse', 'femme', 'BJ', 'Cotonou');
  assert.equal(p.country, 'BJ', 'le choix de la personne l\'emporte sur le fuseau');
  const apres = await call('9601', '/me?tz=Africa/Dakar');
  assert.equal(apres.body.profile.country, 'BJ', 'un profil existant n\'est jamais réécrit par le fuseau');
});

test('un fuseau inconnu ou absent laisse le pays par défaut', async () => {
  assert.equal((await call('9602', '/me')).body.options.suggestedCountry, null, 'sans fuseau, aucune suggestion');
  assert.equal((await call('9602', '/me?tz=Terre/Milieu')).body.options.suggestedCountry, null);
  assert.equal((await call('9602', '/me')).body.options.defaultCountry, 'CM', 'le pays de configuration reste le filet');
});

test('le fuseau n\'est jamais stocké', async () => {
  await call('9603', '/me?tz=Asia/Tokyo');
  await creer('9603', 'Discret', 'homme', 'JP', 'Osaka');
  await call('9603', '/me?tz=Asia/Tokyo');
  const brut = JSON.stringify(await store.getUser('9603'));
  assert.ok(!brut.includes('Asia/Tokyo'), 'le fuseau ne doit apparaître nulle part dans le compte');
  assert.ok(!/\btz\b|timezone|fuseau/i.test(brut), 'aucun champ de fuseau dans le compte');
});
