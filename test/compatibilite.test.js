// Questions de compatibilité (P1-4) : le mariage et les enfants, en « Relation sérieuse ».
//
// Ce que ces tests protègent surtout, c'est ce qui n'est **pas** là. La religion n'est pas un
// champ : le raisonnement de MATCH_POLICY sur l'orientation vaut pour elle — une colonne
// interrogeable, croisée avec la ville et le quartier déjà stockés, est une liste de ciblage en
// cas de fuite ou de réquisition. Qui veut le dire l'écrit dans sa réponse libre, avec ses mots.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'odo-compat-'));
process.env.DATA_DIR = DATA_DIR;
process.env.BOT_TOKEN = '';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.SEED_DEMO = 'false';
process.env.AUTO_APPROVE = 'false';

const express = (await import('express')).default;
const { COMPAT } = await import('../server/config.js');
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
const profil = (extra = {}) => ({ name: 'Aline', age: 25, gender: 'femme', intent: 'serieux', city: 'Yaoundé', promptA: 'Le poisson braisé', ...extra });
async function membre(id, extra = {}) {
  await call(id, '/me');
  const r = await call(id, '/me/profile', 'PUT', profil(extra));
  await store.updateUser(id, { verification: 'approved' });
  return r;
}

// ---------- Ce qu'on ne collecte pas ----------

test('aucune question ne porte sur la religion, ni sur rien de sensible', () => {
  assert.deepEqual(Object.keys(COMPAT), ['mariage', 'enfants']);
  const tout = JSON.stringify(COMPAT).toLowerCase();
  for (const interdit of ['religion', 'confession', 'ethnie', 'tribu', 'orientation', 'parti']) {
    assert.ok(!tout.includes(interdit), `« ${interdit} » ne doit apparaître nulle part dans les questions`);
  }
});

// ---------- Enregistrement ----------

test('les deux réponses sont enregistrées et renvoyées', async () => {
  const r = await membre('9101', { compat: { mariage: 'oui', enfants: 'peutetre' } });
  assert.equal(r.status, 200);
  assert.deepEqual((await store.getUser('9101')).profile.compat, { mariage: 'oui', enfants: 'peutetre' });
});

test('ne pas répondre est une réponse : rien n\'est inventé', async () => {
  await membre('9102');
  assert.equal((await store.getUser('9102')).profile.compat, undefined);

  // Une seule des deux : l'autre reste absente, pas vide.
  await membre('9103', { compat: { enfants: 'non' } });
  assert.deepEqual((await store.getUser('9103')).profile.compat, { enfants: 'non' });
});

// Règle 1 : la liste vient du serveur, donc une valeur hors liste est un bogue du client ou une
// main extérieure. On la refuse, on ne la range pas discrètement.
test('une valeur hors de la liste est refusée, avec la question en clair', async () => {
  await call('9104', '/me');
  const r = await call('9104', '/me/profile', 'PUT', profil({ compat: { mariage: 'bientot' } }));
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'COMPAT_INVALID');
  assert.match(r.body.message, /Le mariage/, "le message doit dire de quelle question il s'agit");
});

// ---------- Ce que les autres voient ----------

test('les réponses ne sortent qu\'en « Relation sérieuse »', async () => {
  await membre('9105', { compat: { mariage: 'oui', enfants: 'oui' } });
  await membre('9106', { intent: 'amitie', compat: { mariage: 'oui' } });
  assert.equal((await store.getUser('9106')).profile.compat, undefined,
    "en amitié, la question n'est pas posée : la réponse ne doit pas être rangée non plus");

  // En « Relation sérieuse », MATCH_POLICY (romance_opposite) ne met en relation que des genres
  // opposés : le lecteur doit être un homme pour voir ces profils.
  await membre('9107', { name: 'Blaise', gender: 'homme' });
  const profils = (await call('9107', '/profiles')).body.profiles;
  const serieux = profils.find((p) => p.id === '9105');
  assert.ok(serieux, 'le profil sérieux est proposé');
  assert.equal(serieux.compat.length, 2);
  assert.deepEqual(serieux.compat.map((c) => c.champ), ['mariage', 'enfants']);
  assert.equal(serieux.compat[0].reponse, COMPAT.mariage.valeurs.oui, 'la phrase, pas le code interne');
});

test('un profil sans réponse ne montre pas un bloc vide', async () => {
  await membre('9108');
  await membre('9109', { name: 'Blaise', gender: 'homme' });
  const p = (await call('9109', '/profiles')).body.profiles.find((x) => x.id === '9108');
  assert.equal(p.compat, null, 'null, pas un tableau vide qui dessinerait une ligne pour rien');
});

// Changer d'intention ne doit pas laisser derrière soi des réponses à des questions qu'on ne
// pose plus — elles ressortiraient au retour, sans avoir été reconfirmées.
test('passer en amitié efface les réponses', async () => {
  await membre('9110', { compat: { mariage: 'non' } });
  assert.ok((await store.getUser('9110')).profile.compat);
  await call('9110', '/me/profile', 'PUT', profil({ intent: 'amitie' }));
  assert.equal((await store.getUser('9110')).profile.compat, undefined);
});

test('la liste des questions part au navigateur avec le reste des options', async () => {
  await call('9111', '/me');
  const o = (await call('9111', '/me')).body.options;
  assert.deepEqual(Object.keys(o.compat), ['mariage', 'enfants']);
  assert.ok(o.compat.mariage.valeurs.oui, 'avec ses valeurs, pour que le formulaire les propose');
});
