// Les fondations de la mesure : ce qu'on enregistre, et ce qui disparaît.
//
// audit/05-mesure-produit.md appelle la purge des événements à la suppression d'un compte « la
// ligne sans laquelle ce plan est illégal ». C'est le premier test de ce fichier, et le reste en
// découle : une seule exception assumée (account_deleted, sans identifiant), une durée de
// conservation qui s'applique vraiment, et un marqueur qui distingue les comptes de test.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-mesure-'));
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.WEBAPP_URL = 'https://exemple.test';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.SEED_DEMO = 'false';
process.env.AUTO_APPROVE = 'false';

const express = (await import('express')).default;
const { config } = await import('../server/config.js');
const { store } = await import('../server/store.js');
// Les routes désignent les autres par leur identifiant public, jamais par l'identifiant Telegram.
const pid = async (id) => (await store.getUser(id))?.pid;
const { bot, decideVerification } = await import('../server/bot.js');
const { api } = await import('../server/routes.js');
bot.api.config.use(async () => ({ ok: true, result: { message_id: 1 } }));

const app = express();
app.use(express.json());
app.use('/api', api);
const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api`;
test.after(() => server.close());

const call = async (user, p, method = 'GET', body) => {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', 'x-dev-user': user }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
async function membre(id, name, gender = 'femme') {
  await call(id, '/me');
  await call(id, '/me/profile', 'PUT', { name, age: 25, gender, intent: 'amitie', city: 'Yaoundé', promptA: 'Le poisson braisé' });
  await store.updateUser(id, { verification: 'approved' });
}
const siens = async (id) => (await store.events()).filter((e) => e.u === String(id));

// ---------- Ce que le plan appelle la ligne sans laquelle il est illégal ----------

test("supprimer son compte emporte ses événements", async () => {
  await membre('700', 'Awa');
  await store.addEvent('deck_empty', '700', { why: 'vide' });
  // Le parcours en a posé d'autres au passage (app_opened, profile_saved) : on ne compte pas un
  // total, on exige qu'il n'en reste aucun. C'est la promesse, et elle ne dépend pas du décompte.
  assert.ok((await siens('700')).length >= 1, 'des événements le désignent');

  assert.equal((await call('700', '/me', 'DELETE')).status, 200);
  assert.deepEqual(await siens('700'), [], 'et il n\'en reste aucun');
  assert.equal(await store.getUser('700'), null, 'le compte non plus');
});

// L'exception, assumée et écrite : sans elle, supprimer son compte effacerait la trace qu'il a
// existé, et le nombre de départs deviendrait incalculable.
test("account_deleted survit, et ne désigne personne", async () => {
  await membre('701', 'Bana');
  await store.addEvent('app_opened', '701');
  await store.addEvent('account_deleted', null, { c: '2026-W37', d: 12 });

  await call('701', '/me', 'DELETE');
  const restants = await store.events({ k: 'account_deleted' });
  // La route en pose une elle aussi : il y en a donc au moins deux. Ce qui compte, c'est
  // qu'aucune ne porte d'identifiant — sinon l'exception rendrait la personne reconnaissable.
  assert.ok(restants.length >= 2, 'la ligne posée à la main et celle de la route sont là');
  for (const e of restants) assert.ok(e.u === undefined || e.u === null, `aucune ne porte d'identifiant : ${JSON.stringify(e)}`);
  assert.ok(restants.some((e) => e.p?.d === 12), 'elle garde ce qui ne désigne personne');
  assert.deepEqual(await siens('701'), [], 'et le reste est bien parti');
});

// ---------- Ce qu'un événement a le droit de contenir ----------

test("un événement ne porte ni texte ni identifiant nouveau", async () => {
  const e = await store.addEvent('antiscam_block', '702', { c: 'MONEY' });
  assert.deepEqual(Object.keys(e).sort(), ['at', 'id', 'k', 'p', 'u'].sort(), 'cinq champs, pas un de plus');
  assert.equal(e.u, '702', "l'identifiant est celui qui existe déjà");
  assert.deepEqual(e.p, { c: 'MONEY' });
});

test('une charge utile vide ne crée pas de champ', async () => {
  for (const p of [undefined, null, {}]) {
    const e = await store.addEvent('app_opened', '703', p);
    assert.ok(!('p' in e) || e.p === null, `charge ${JSON.stringify(p)} : aucun champ p`);
  }
});

// ---------- La durée de conservation ----------

test('0 jour ne purge rien : c\'est le réglage « on n\'enregistre pas », pas « on efface tout »', async () => {
  await store.addEvent('app_opened', '704');
  await store.addEvent('app_opened', '704');
  assert.equal(await store.purgerEvenements(0), 0);
  assert.equal((await siens('704')).length, 2, 'les deux lignes sont intactes');
});

test('ce qui a dépassé la durée de conservation est purgé, le reste non', async () => {
  const avantTout = (await store.events()).length;
  assert.equal(await store.purgerEvenements(1), 0, 'un jour : rien de ce qui vient d\'être écrit');
  assert.equal((await store.events()).length, avantTout, 'et rien n\'a bougé');

  // On ne peut pas attendre cent quatre-vingts jours : on déplace la coupure au lieu du temps.
  // Une fraction de jour suffit à passer derrière ce qui vient d'être écrit — c'est bien la
  // comparaison à la limite qu'on éprouve, pas une valeur particulière.
  await new Promise((r) => setTimeout(r, 20));
  const purges = await store.purgerEvenements(10 / 86400000); // dix millisecondes
  assert.equal(purges, avantTout, 'tout ce qui précède la coupure est parti');

  const apres = await store.addEvent('app_opened', '704');
  assert.deepEqual((await store.events()).map((e) => e.id), [apres.id], 'et ce qui la suit reste');
  await store.purgerEvenements(10 / 86400000);
});

// ---------- Les exclusions, en amont ----------

test("un compte de développement porte un marqueur, un compte de démonstration aussi", async () => {
  await call('705', '/me');
  assert.equal((await store.getUser('705')).devUser, true, "x-dev-user marque le compte");

  await store.upsertTelegramUser({ id: '706', first_name: 'Vraie', language_code: 'fr' });
  assert.ok(!(await store.getUser('706')).devUser, "un compte venu de Telegram n'est pas marqué");
});

// ---------- Les horodatages d'entonnoir ----------

test("le profil, le like, le match et le message sont datés une seule fois", async () => {
  await membre('710', 'Carine');
  await membre('711', 'Didier', 'homme');
  const p1 = (await store.getUser('710')).profileSavedAt;
  assert.ok(p1, 'le profil est daté');

  await call('710', '/me/profile', 'PUT', { name: 'Carine', age: 26, gender: 'femme', intent: 'amitie', city: 'Yaoundé', promptA: 'Le poisson braisé' });
  assert.equal((await store.getUser('710')).profileSavedAt, p1, "modifier son profil ne redate pas l'entrée");

  await call('710', '/swipes', 'POST', { targetId: await pid('711'), action: 'like' });
  const l1 = (await store.getUser('710')).firstLikeAt;
  assert.ok(l1, 'le premier like est daté');

  await call('711', '/swipes', 'POST', { targetId: await pid('710'), action: 'like' });
  const apres = await Promise.all([store.getUser('710'), store.getUser('711')]);
  for (const u of apres) assert.ok(u.firstMatchAt, `${u.id} : le match est daté des deux côtés`);
  assert.equal(apres[0].firstLikeAt, l1, 'et le premier like ne bouge pas');
});

test('le premier message est daté, les suivants ne le redatent pas', async () => {
  const m = (await store.matchesOf('710'))[0];
  await call('710', `/matches/${m.id}/messages`, 'POST', { text: 'Salut' });
  const d1 = (await store.getUser('710')).firstMessageAt;
  assert.ok(d1, 'le premier message est daté');

  await call('710', `/matches/${m.id}/messages`, 'POST', { text: 'Ça va ?' });
  assert.equal((await store.getUser('710')).firstMessageAt, d1, 'le second ne redate rien');
});

// Le délai de modération n'existait nulle part : c'est le chiffre que le plan dit le plus manquant.
test('la décision de modération est datée, et le délai devient calculable', async () => {
  await call('720', '/me');
  await call('720', '/me/profile', 'PUT', { name: 'Élodie', age: 24, gender: 'femme', intent: 'amitie', city: 'Yaoundé', promptA: 'Le poisson braisé' });
  await store.updateUser('720', { verification: 'pending', verificationSentAt: Date.now() - 5000 });

  await decideVerification('720', true);
  const u = await store.getUser('720');
  assert.ok(u.verifDecidedAt, 'la décision est datée');
  assert.ok(u.verifDecidedAt - u.verificationSentAt >= 5000, 'le délai se calcule des deux bouts');
});

test("les horodatages partent avec le compte", async () => {
  await call('710', '/me', 'DELETE');
  assert.equal(await store.getUser('710'), null);
});
