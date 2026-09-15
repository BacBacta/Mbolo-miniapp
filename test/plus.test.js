// Odo Plus : qui a le pass, ce qu'il enlève, et ce qu'il ne montre à personne.
//
// Trois choses sont éprouvées ici, et la troisième est la moins évidente :
//
//   1. `estPlus()` est le seul endroit qui tranche, et il tranche dans le bon sens — une fin de
//      pass absente ou illisible vaut « pas de pass », jamais « pass éternel ».
//   2. Un pass s'empile. Payer deux fois et ne recevoir qu'une fois est la faute qu'on ne
//      rattrape pas : la personne a vu l'argent partir (cahier des charges, section 10.7).
//   3. Le pass ne sort pas de la personne qui l'a. Il n'est pas sur sa fiche publique, et il ne
//      le sera pas : un pass visible dirait qui peut voir la liste des « J'aime », donc qui sait.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-plus-'));
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.WEBAPP_URL = 'https://exemple.test';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.SEED_DEMO = 'false';
process.env.AUTO_APPROVE = 'false';

const express = (await import('express')).default;
const { store } = await import('../server/store.js');
const pid = async (id) => (await store.getUser(id))?.pid;
const { config } = await import('../server/config.js');
const { estPlus, etatDuPass, prolonger, SOURCES, DUREES } = await import('../server/plus.js');
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
const donnerLePass = async (id, jours = 30) => store.updateUser(id, { plus: prolonger(await store.getUser(id), { jours, source: 'gift' }) });

test.after(() => server.close());

const JOUR = 24 * 3600 * 1000;

test('un pass sans fin lisible n\'est pas un pass', () => {
  const t0 = 1_700_000_000_000;
  assert.equal(estPlus(undefined, t0), false);
  assert.equal(estPlus({}, t0), false);
  assert.equal(estPlus({ plus: {} }, t0), false, 'un champ vide ne donne rien');
  assert.equal(estPlus({ plus: { finLe: null } }, t0), false);
  // Le sens du doute compte : une écriture ratée doit retirer le pass, jamais le donner à tout
  // le monde. « Illisible » vaut donc « pas de pass ».
  assert.equal(estPlus({ plus: { finLe: 'bientôt' } }, t0), false);
  assert.equal(estPlus({ plus: { finLe: Infinity } }, t0), false, 'et surtout pas un pass éternel');
  assert.equal(estPlus({ plus: { finLe: t0 - 1 } }, t0), false, 'échu hier');
  assert.equal(estPlus({ plus: { finLe: t0 + 1 } }, t0), true);
});

test('un pass pris pendant un pass repousse la fin, il ne la remplace pas', () => {
  const t0 = 1_700_000_000_000;
  const premier = prolonger({}, { jours: 30, source: 'gift' }, t0);
  assert.equal(premier.finLe, t0 + 30 * JOUR);

  // Le deuxième part de la fin du premier, pas de maintenant : sinon quinze jours payés
  // disparaîtraient sans que personne ne le voie (section 10.7, « prolongation, jamais de perte »).
  const second = prolonger({ plus: premier }, { jours: 30, source: 'momo' }, t0 + 15 * JOUR);
  assert.equal(second.finLe, t0 + 60 * JOUR, 'les jours restants sont gardés');
  assert.equal(second.depuisLe, premier.depuisLe, 'et la date de première adhésion ne bouge plus');

  // Un pass échu, lui, repart de maintenant : il n'y avait plus rien à garder.
  const apres = prolonger({ plus: premier }, { jours: 30 }, t0 + 40 * JOUR);
  assert.equal(apres.finLe, t0 + 70 * JOUR);

  for (const mauvais of [0, -1, 1000, 2.5, 'trente', null]) {
    assert.throws(() => prolonger({}, { jours: mauvais }), /Durée de pass invalide/, `durée refusée : ${mauvais}`);
  }
  assert.throws(() => prolonger({}, { jours: 30, source: 'bitcoin' }), /Source de pass inconnue/);
  assert.ok(SOURCES.includes('momo') && SOURCES.includes('stars'), 'les sources sont celles de la table entitlements (section 10.4)');
  assert.deepEqual(DUREES, [30, 90]);
});

test('le pass se lit sur soi, et sur personne d\'autre', async () => {
  await membre('9101', 'Awa', 'femme');
  await membre('9102', 'Bea', 'femme', 26);

  assert.deepEqual((await call('9101', '/me')).body.plus, { actif: false, finLe: null, source: null, jours: 0 });
  await donnerLePass('9101', 30);
  const etat = (await call('9101', '/me')).body.plus;
  assert.equal(etat.actif, true);
  assert.equal(etat.source, 'gift');
  assert.equal(etat.jours, 30, 'le nombre de jours restants est arrondi au jour supérieur');

  // Ce que 9102 voit de 9101 : sa fiche, et rien du pass. Le mot ne doit apparaître nulle part
  // dans la réponse — ni en clair, ni sous la forme d'un champ resté par mégarde.
  const paquet = await call('9102', '/discover');
  const moi = await pid('9101');
  assert.ok(paquet.body.profiles.some((p) => p.id === moi), 'la fiche de qui a le pass est bien dans le paquet');
  assert.ok(!JSON.stringify(paquet.body).includes('plus'), 'le pass ne voyage pas avec les cartes');
  assert.ok(!JSON.stringify((await call('9102', '/profiles')).body).includes('plus'), 'ni avec la liste');
});

test('le quota du jour a trois marches, et le pass enlève la dernière', async () => {
  await membre('9110', 'Cyr', 'homme', 30);
  for (let i = 0; i < 8; i += 1) await membre(`912${i}`, `Cible${i}`, 'femme', 30);

  const paquet = await call('9110', '/discover');
  assert.equal(paquet.body.quota, config.dailyProfiles, 'sans pass, le serveur dit le quota du jour');
  assert.equal(config.dailyProfiles, 5, 'cinq « J\'aime » par jour : décision du 15 septembre 2026');
  // Le paquet n'est plus coupé au quota restant : passer ne consomme rien, donc le nombre de
  // cartes n'a rien à voir avec le nombre de « J'aime » qui restent.
  assert.ok(paquet.body.profiles.length > config.dailyProfiles, 'dix cartes, pas cinq');

  for (let i = 0; i < 5; i += 1) {
    const r = await call('9110', '/swipes', 'POST', { targetId: await pid(`912${i}`), action: 'like' });
    assert.equal(r.status, 200, `le « J'aime » ${i + 1} passe`);
  }
  const sixieme = await call('9110', '/swipes', 'POST', { targetId: await pid('9125'), action: 'like' });
  assert.equal(sixieme.status, 429, 'le sixième dépasse');
  assert.equal(sixieme.body.code, 'DAILY_LIMIT');

  await donnerLePass('9110', 30);
  const avecPass = await call('9110', '/swipes', 'POST', { targetId: await pid('9125'), action: 'like' });
  assert.equal(avecPass.status, 200, 'le pass enlève le mur, sans attendre minuit');

  // Et l'interface ne doit surtout pas lire « zéro » là où il n'y a pas de compte à tenir :
  // null est le contrat, et c'est ce que `auClient()` écrit.
  const apres = await call('9110', '/discover');
  assert.equal(apres.body.quota, null, "null veut dire « aucun compte à tenir », pas zéro");
  assert.equal(apres.body.remaining, null);
});

test('un pass échu ne vaut plus rien, sans qu\'on ait à le retirer', async () => {
  await membre('9130', 'Dina', 'femme', 28);
  await store.updateUser('9130', { plus: { source: 'momo', depuisLe: Date.now() - 60 * JOUR, finLe: Date.now() - JOUR } });
  assert.equal(estPlus(await store.getUser('9130')), false);
  assert.equal((await call('9130', '/me')).body.plus.actif, false, 'expiration franche : aucune reconduction tacite');
  assert.equal((await call('9130', '/discover')).body.quota, config.dailyProfiles, 'et le quota revient tout seul');
  assert.equal(etatDuPass(await store.getUser('9130')).jours, 0);
});

// ---------- Les portes de « qui t'a aimé » ----------
//
// Il y en a quatre, et il faut les fermer ensemble : la liste, la pastille sur la carte, la
// pastille dans la liste des profils, et le compteur. Le compteur est le plus bavard des quatre —
// « une personne t'a aimé », posé à côté d'un paquet qui met cette personne en tête, fait un nom.
// Ce fichier les essaie une par une : une seule restée ouverte rend les trois autres inutiles.
test("sans pass, les quatre portes de « qui t'a aimé » sont fermées", async () => {
  await membre('9140', 'Eve', 'femme', 24);
  await membre('9141', 'Fabrice', 'homme', 27);
  assert.equal((await call('9141', '/swipes', 'POST', { targetId: await pid('9140'), action: 'like' })).status, 200);

  // 1. La liste.
  const liste = await call('9140', '/likes');
  assert.equal(liste.status, 403);
  assert.equal(liste.body.code, 'PASS_REQUIS');

  // 2. La pastille sur la carte.
  const paquet = await call('9140', '/discover');
  const carte = paquet.body.profiles.find((p) => p.name === 'Fabrice');
  assert.ok(carte, 'la carte est bien là : le pass ne retire aucune rencontre');
  assert.equal(carte.likedYou, false);

  // 3. La pastille dans la liste des profils.
  const profils = await call('9140', '/profiles');
  assert.equal(profils.body.profiles.find((p) => p.name === 'Fabrice').likedYou, false);

  // 4. Le compteur. `null`, pas `0` : zéro dirait « personne ne t'a aimé », et ce serait faux.
  const resume = await call('9140', '/summary');
  assert.equal(resume.body.likes, null, "on ne le dit pas — on ne dit pas non plus le contraire");

  // Et avec le pass, les quatre s'ouvrent.
  await donnerLePass('9140');
  assert.deepEqual((await call('9140', '/likes')).body.profiles.map((p) => p.name), ['Fabrice']);
  assert.equal((await call('9140', '/discover')).body.profiles.find((p) => p.name === 'Fabrice').likedYou, true);
  assert.equal((await call('9140', '/profiles')).body.profiles.find((p) => p.name === 'Fabrice').likedYou, true);
  assert.equal((await call('9140', '/summary')).body.likes, 1);
});

test("le pass ne retire aucune rencontre : la place ne dépend pas de lui", async () => {
  await membre('9150', 'Gaelle', 'femme', 29);
  await membre('9151', 'Hervé', 'homme', 29);
  await membre('9152', 'Ivan', 'homme', 29);
  // Hervé aime Gaëlle ; Ivan non. Sans pass, Gaëlle ne sait pas lequel — mais elle voit Hervé
  // en premier, exactement comme avec le pass. C'est ce que la notification du bot promet.
  await call('9151', '/swipes', 'POST', { targetId: await pid('9150'), action: 'like' });
  const sans = (await call('9150', '/discover')).body.profiles.map((p) => p.name);
  await donnerLePass('9150');
  const avec = (await call('9150', '/discover')).body.profiles.map((p) => p.name);
  assert.equal(sans[0], 'Hervé', 'la personne qui a aimé passe devant, avec ou sans pass');
  assert.deepEqual(sans, avec, "l'ordre est le même : une différence d'ordre dirait ce que l'étiquette ne dit plus");
});

// ---------- Ce que le pass laisse comme trace ----------
//
// Le pass a été construit pour répondre à une question : est-ce que ce qu'il y a derrière
// intéresse quelqu'un. Pendant une journée, **rien n'y répondait** — les portes étaient fermées
// et aucune ligne ne comptait ceux qui butaient dessus. Ce test va de la requête refusée jusqu'à
// la table des événements : une charge que la barrière de `mesure.js` refuserait passerait
// inaperçue autrement, puisque `mesurer()` ne jette jamais.
test('un refus et un usage laissent chacun leur trace, et rien de plus', async () => {
  await membre('9160', 'Jo', 'femme', 26);
  const evenements = async (cle) => (await store.events()).filter((e) => e.k === cle && String(e.u) === '9160');

  assert.equal((await call('9160', '/likes')).status, 403);
  assert.equal((await call('9160', '/vues')).status, 403);
  const refus = await evenements('pass_refuse');
  assert.deepEqual(refus.map((e) => e.p.quoi).sort(), ['likes', 'vues'], 'chaque porte se compte à part');
  // La barrière n'a rien refusé en silence : une charge invalide ne serait jamais arrivée ici.
  assert.ok(refus.every((e) => Object.keys(e.p).length === 1), "le refus ne transporte rien d'autre");

  await donnerLePass('9160');
  assert.equal((await call('9160', '/likes')).status, 200);
  assert.deepEqual((await evenements('pass_usage')).map((e) => e.p.quoi), ['likes']);
  // Et le droit ouvert ne compte plus comme une demande.
  assert.equal((await evenements('pass_refuse')).length, 2, 'le compteur des refus ne bouge plus');
});

test('buter sur le quota dit désormais quel mur on a rencontré', async () => {
  await membre('9170', 'Kofi', 'homme', 31);
  for (let i = 0; i < 6; i += 1) await membre(`918${i}`, `Cible${i}`, 'femme', 31);
  for (let i = 0; i < 5; i += 1) await call('9170', '/swipes', 'POST', { targetId: await pid(`918${i}`), action: 'like' });
  assert.equal((await call('9170', '/swipes', 'POST', { targetId: await pid('9185'), action: 'like' })).status, 429);

  const [mur] = (await store.events()).filter((e) => e.k === 'quota_hit' && String(e.u) === '9170');
  assert.ok(mur, 'la butée est enregistrée');
  assert.equal(mur.p.q, config.dailyProfiles, 'avec le palier touché, pas seulement le fait de buter');
  assert.equal(mur.p.action, 'like');
});
