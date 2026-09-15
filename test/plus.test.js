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
