// La politique de vérification : porte, ou badge.
//
// Le reste de la suite couvre le cas par défaut, `gate` — la vérification est une porte, et rien
// ne s'ouvre avant qu'un humain ait tranché. Ce fichier-ci couvre l'autre, `badge` : on entre
// avec un profil, et le selfie vérifié donne un bouclier. Ce qui reste réservé au bouclier est
// ce qui met deux personnes en présence, plus un quota de « J'aime » réduit tant qu'on l'attend.
//
// Le réglage se lit au démarrage : il ne peut pas être changé au milieu d'un fichier de test,
// d'où ce fichier séparé — même raison que test/match-policy.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-badge-'));
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.WEBAPP_URL = 'https://exemple.test';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.SEED_DEMO = 'false';
process.env.AUTO_APPROVE = 'false';
process.env.VERIFICATION_POLICY = 'badge';
process.env.DAILY_PROFILES_UNVERIFIED = '2';

const express = (await import('express')).default;
const { store } = await import('../server/store.js');
const pid = async (id) => (await store.getUser(id))?.pid;
const { config, entreeLibre } = await import('../server/config.js');
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
// Un compte avec un profil, et rien de plus : c'est tout ce qu'il faut pour entrer ici.
async function profil(id, name, gender, age = 25) {
  await call(id, '/me');
  const r = await call(id, '/me/profile', 'PUT', { name, age, gender, intent: 'amitie', city: 'Douala', promptA: 'Le poisson braisé' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
}
const verifier = (id) => store.updateUser(id, { verification: 'approved' });
const ids = (r) => r.body.profiles.map((p) => p.id);

test.after(() => server.close());

test("un seul endroit tranche, et il porte la politique jusqu'à l'interface", async () => {
  assert.equal(entreeLibre(), true, 'la fonction est la règle : personne ne recopie la comparaison');
  await profil('8001', 'Aline', 'femme');
  const me = await call('8001', '/me');
  assert.equal(me.body.options.entreeLibre, true, "l'interface lit le drapeau, elle ne le devine pas");
  assert.equal(me.body.verification, 'none', 'et le compte reste non vérifié : le badge ne se donne pas tout seul');
});

test('un profil non vérifié découvre, aime, matche et écrit', async () => {
  await profil('8002', 'Bea', 'femme', 26);
  await profil('8003', 'Cyr', 'homme', 27);

  const cartes = ids(await call('8001', '/discover'));
  assert.ok(cartes.includes(await pid('8002')), 'les non-vérifiés se voient entre eux');

  const like = await call('8001', '/swipes', 'POST', { targetId: await pid('8002'), action: 'like' });
  assert.equal(like.status, 200);
  const retour = await call('8002', '/swipes', 'POST', { targetId: await pid('8001'), action: 'like' });
  assert.ok(retour.body.match, 'le match se fait sans badge');

  const msg = await call('8001', `/matches/${retour.body.match.id}/messages`, 'POST', { text: 'Salut, ça va ?' });
  assert.equal(msg.status, 200, 'et la discussion aussi');
});

test('le bouclier dit qui a été regardé par un humain, et lui seul', async () => {
  await verifier('8003');
  const cartes = (await call('8001', '/discover')).body.profiles;
  const parId = Object.fromEntries(cartes.map((p) => [p.id, p]));
  assert.equal(parId[await pid('8003')]?.verified, true, 'Cyr porte le bouclier');
  // Le paquet montre tout le monde, le vérifié devant.
  assert.equal(cartes[0].id, await pid('8003'), 'les profils vérifiés passent devant, sans exclure les autres');
});

test('« vérifiés seulement » est un filtre, jamais la règle', async () => {
  // Une tranche d'âge à part, pour que le paquet ne contienne que ces deux-là : le quota des
  // non-vérifiés borne aussi le nombre de cartes servies (voir le test suivant).
  await profil('8040', 'Hawa', 'femme');
  await profil('8041', 'Ines', 'femme', 41);
  await profil('8042', 'Jade', 'femme', 42);
  await verifier('8042');
  await call('8040', '/me/filters', 'PUT', { ageMin: 40, ageMax: 45 });
  assert.deepEqual(new Set(ids(await call('8040', '/discover'))), new Set([await pid('8041'), await pid('8042')]), 'les deux sont dans le paquet');

  const r = await call('8040', '/me/filters', 'PUT', { ageMin: 40, ageMax: 45, verifiesSeulement: true });
  assert.equal(r.status, 200);
  assert.equal(r.body.filters.verifiesSeulement, true);
  assert.deepEqual(ids(await call('8040', '/discover')), [await pid('8042')], 'seul le profil vérifié reste');

  await call('8040', '/me/filters', 'PUT', { ageMin: 40, ageMax: 45, verifiesSeulement: false });
  assert.deepEqual(new Set(ids(await call('8040', '/discover'))), new Set([await pid('8041'), await pid('8042')]), 'et le réglage se défait');
});

test('le quota du jour dépend du badge', async () => {
  assert.equal(config.dailyProfilesNonVerifie, 2, 'réglable, et réglé bas pour ce test');
  await profil('8010', 'Dina', 'femme');
  assert.equal((await call('8010', '/discover')).body.quota, 2, 'le serveur dit le quota : sans quoi l\'écran vide annoncerait un mauvais nombre');

  for (const n of ['8011', '8012', '8013']) await profil(n, `P${n}`, 'homme', 28);
  assert.equal((await call('8010', '/swipes', 'POST', { targetId: await pid('8011'), action: 'like' })).status, 200);
  assert.equal((await call('8010', '/swipes', 'POST', { targetId: await pid('8012'), action: 'like' })).status, 200);
  const troisieme = await call('8010', '/swipes', 'POST', { targetId: await pid('8013'), action: 'like' });
  assert.equal(troisieme.status, 429, 'le troisième dépasse le quota des non-vérifiés');
  assert.equal(troisieme.body.code, 'DAILY_LIMIT');

  await verifier('8010');
  assert.equal((await call('8010', '/discover')).body.quota, config.dailyProfiles, 'le badge rend le quota entier');
  assert.equal((await call('8010', '/swipes', 'POST', { targetId: await pid('8013'), action: 'like' })).status, 200);
});

test('le rendez-vous demande le bouclier des deux côtés', async () => {
  await profil('8020', 'Eve', 'femme');
  await profil('8021', 'Fred', 'homme', 29);
  await call('8020', '/swipes', 'POST', { targetId: await pid('8021'), action: 'like' });
  const m = (await call('8021', '/swipes', 'POST', { targetId: await pid('8020'), action: 'like' })).body.match;
  assert.ok(m?.id, 'le match se fait sans badge, comme plus haut');

  const sansRien = await call('8020', `/matches/${m.id}/dates`, 'POST', { venueId: 'palmier', slot: 'Samedi, 11 h' });
  assert.equal(sansRien.status, 403, 'personne n\'est vérifié');
  assert.equal(sansRien.body.code, 'BADGE_REQUIS');

  await verifier('8020');
  const autreSansBadge = await call('8020', `/matches/${m.id}/dates`, 'POST', { venueId: 'palmier', slot: 'Samedi, 11 h' });
  assert.equal(autreSansBadge.status, 403, "l'autre non plus : se retrouver en vrai demande les deux");
  assert.equal(autreSansBadge.body.code, 'BADGE_REQUIS_AUTRE');
  assert.ok(autreSansBadge.body.message.includes('Fred'), 'et l\'app dit qui, pour qu\'on sache quoi faire');

  // Vérifiés des deux côtés, il ne reste que l'absence de lieu partenaire — la liste est vide
  // par choix, et c'est une autre règle (400, pas 403).
  await verifier('8021');
  const lesDeux = await call('8020', `/matches/${m.id}/dates`, 'POST', { venueId: 'palmier', slot: 'Samedi, 11 h' });
  assert.equal(lesDeux.status, 400, 'le badge ne bloque plus ; il ne reste que le lieu, qui n\'existe pas');
  assert.equal(lesDeux.body.code, 'DATE_INVALID');
});

test('écrire ne demande pas le badge, et un compte fermé n\'entre pas davantage', async () => {
  await profil('8030', 'Gis', 'femme');
  await store.updateUser('8030', { banned: { at: Date.now(), why: 'arnaque' } });
  const r = await call('8030', '/discover');
  assert.equal(r.status, 403, 'le modèle ouvert ouvre la porte aux profils, pas aux comptes fermés');
});
