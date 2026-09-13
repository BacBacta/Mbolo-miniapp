// La jauge de confiance (P1-5) : ce qu'elle compte, et ce qu'elle ne compte plus.
//
// Elle s'affichait « sur 3 » alors que le troisième critère — le garant — était figé à `false`
// pour tout compte réel : personne ne pouvait dépasser 2 sur 3, et rien ne disait pourquoi.
// Expliquer une jauge dans cet état aurait été expliquer une déception. Elle compte donc les
// critères **ouverts**. Le garant ne reviendra pas : P1-6 est abandonné, parce que nommer un
// membre comme répondant d'un autre laisse croire à un recours qui n'existe pas. Ce test le
// garde dehors pour de bon, au lieu de le garder dehors en attendant.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'odo-jauge-'));
process.env.DATA_DIR = DATA_DIR;
process.env.BOT_TOKEN = '';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.SEED_DEMO = 'false';
process.env.AUTO_APPROVE = 'false';

const express = (await import('express')).default;
const { CRITERES, calculer } = await import('../server/jauge.js');
const { store } = await import('../server/store.js');
const { api } = await import('../server/routes.js');

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
const TROIS_MOIS = 91 * 24 * 3600 * 1000;

// ---------- Le calcul, sans rien allumer ----------

test('la jauge ne compte que les critères ouverts', () => {
  assert.deepEqual(CRITERES.map((c) => c.cle), ['selfie', 'seniority']);
  assert.ok(!CRITERES.some((c) => c.cle === 'guarantor'),
    "le garant est abandonné (P1-6) : il ne doit pas figurer dans une jauge qu'on explique");
});

test('un compte neuf et vérifié est à 1 sur 2, pas à 1 sur 3', () => {
  const j = calculer({ verification: 'approved', createdAt: Date.now() });
  assert.equal(j.score, 1);
  assert.equal(j.total, 2, 'le dénominateur doit être atteignable');
});

test('le temps qui passe allume la seconde pastille tout seul', () => {
  const veille = calculer({ verification: 'approved', createdAt: Date.now() - TROIS_MOIS + 86400e3 });
  assert.equal(veille.score, 1, 'la veille des trois mois, pas encore');
  const apres = calculer({ verification: 'approved', createdAt: Date.now() - TROIS_MOIS });
  assert.equal(apres.score, 2);
});

test('un compte non vérifié n\'a aucune pastille', () => {
  const j = calculer({ verification: 'pending', createdAt: Date.now() });
  assert.equal(j.score, 0);
  assert.deepEqual(j.criteres.map((c) => c.ok), [false, false]);
});

// Les profils de démonstration portent leur propre `trust`, garant compris. Un critère que la
// liste ne connaît pas ne doit ni gonfler le score ni le dénominateur.
test('un critère inconnu est ignoré, pas compté', () => {
  const j = calculer({ verification: 'approved', profile: { trust: { selfie: true, guarantor: true, seniority: true } } });
  assert.equal(j.total, 2);
  assert.equal(j.score, 2, 'le garant du profil de démonstration ne compte pas');
});

// ---------- Ce que l'app en reçoit ----------

test('le profil public porte le score et son dénominateur', async () => {
  await call('9201', '/me');
  await call('9201', '/me/profile', 'PUT', { name: 'Aline', age: 25, gender: 'femme', intent: 'amitie', city: 'Yaoundé', promptA: 'Le poisson braisé' });
  await store.updateUser('9201', { verification: 'approved' });

  const moi = (await call('9201', '/me')).body;
  assert.equal(moi.publicProfile.trust.total, 2, 'la carte ne doit pas deviner combien de critères existent');
  assert.equal(moi.publicProfile.trust.score, 1);
  assert.deepEqual(moi.publicProfile.trust.criteres.map((c) => c.cle), ['selfie', 'seniority']);
  assert.ok(moi.publicProfile.trust.criteres[0].titre, 'avec de quoi écrire la ligne « ce qui est acquis »');
});

// L'écran d'explication et la carte doivent lire la même liste : deux descriptions de la même
// chose finissent toujours par diverger, et c'est l'explication qui devient fausse.
test('les critères expliqués sont exactement ceux qui sont comptés', async () => {
  await call('9202', '/me');
  const o = (await call('9202', '/me')).body.options;
  assert.deepEqual(o.criteres.map((c) => c.cle), CRITERES.map((c) => c.cle));
  for (const c of o.criteres) {
    assert.ok(c.titre && c.quoi && c.comment, `${c.cle} doit dire ce que c'est et comment l'obtenir`);
  }
});
