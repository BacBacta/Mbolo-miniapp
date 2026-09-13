// La dette que ce fichier ferme : les compteurs de limitation de débit étaient en mémoire.
//
// C'était correct tant qu'une seule machine tournait — mais le passage à PostgreSQL a levé cette
// contrainte sans que les compteurs suivent. À deux machines, chaque garde-fou anti-spam valait le
// double dans les faits : 40 messages par minute au lieu de 20, puisque chaque machine tenait son
// propre compte sans voir celui de l'autre.
//
// Le reste de la suite vérifie que les règles tiennent, mais dans **un seul processus** : elle
// passait déjà avant ce chantier, et elle passerait encore si les compteurs repartaient en
// mémoire demain. Seul ce fichier éprouve la chose elle-même — deux processus, la même base, un
// seul quota. Il lance donc de vrais enfants Node plutôt que de simuler.
//
// Il ne tourne qu'avec une base PostgreSQL (npm run test:pg, ou DATABASE_URL posée). Sinon il se
// déclare sauté : sur un fichier JSON, il n'y a rien à partager, et c'est voulu.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const lancer = promisify(execFile);
const URL_BASE = process.env.DATABASE_URL || '';
const racine = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
// Hors du dépôt : le stockage crée son dossier d'images au chargement, même en mode PostgreSQL.
const DOSSIER = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-instances-'));

// Une « instance » : un processus Node qui ouvre le stockage et prend des jetons sur la même clé,
// exactement comme le ferait une deuxième machine derrière le répartiteur de charge. Il écrit le
// nombre de jetons obtenus, rien d'autre.
const INSTANCE = `
  const { store } = await import('./server/store.js');
  const [cle, max, fenetre, essais, maintenant] = process.argv.slice(1);
  let obtenus = 0;
  for (let i = 0; i < Number(essais); i += 1) {
    if (await store.limiteConsommer(cle, Number(max), Number(fenetre), Number(maintenant)) === null) obtenus += 1;
  }
  process.stdout.write(String(obtenus));
`;

const instance = async (cle, max, fenetre, essais, maintenant) => Number(
  (await lancer(process.execPath, ['--input-type=module', '-e', INSTANCE, '--', cle, max, fenetre, essais, maintenant],
    { cwd: racine, env: { ...process.env, DATA_DIR: DOSSIER } })).stdout);

test('deux instances se partagent un seul quota', { skip: URL_BASE ? false : 'Aucune base PostgreSQL : npm run test:pg' }, async () => {
  const cle = `test:instances:${Date.now()}`;
  const max = 5;
  const maintenant = Date.now();

  // En parallèle, et chacune en demande autant que la règle entière en autorise. Avant ce
  // chantier, chaque processus aurait tenu son compte dans sa mémoire et en aurait accordé cinq :
  // dix au total pour une règle qui en annonce cinq.
  const [a, b] = await Promise.all([
    instance(cle, max, 60_000, max, maintenant),
    instance(cle, max, 60_000, max, maintenant),
  ]);

  // Le total, et rien d'autre : laquelle des deux est servie la première dépend de l'ordonnanceur
  // du système, et l'affirmer ferait un test qui échoue un jour sur dix sans qu'aucun code n'ait
  // changé. Ce qui doit être vrai quoi qu'il arrive, c'est que la somme ne dépasse pas la règle.
  assert.equal(a + b, max, `les deux instances ont obtenu ${a} + ${b} jetons pour une règle qui en autorise ${max}`);
});

// Le partage ne vaut rien s'il déborde : deux comptes différents doivent garder chacun le sien,
// même vus depuis deux processus.
test('deux instances ne confondent pas deux comptes', { skip: URL_BASE ? false : 'Aucune base PostgreSQL : npm run test:pg' }, async () => {
  const suffixe = Date.now();
  const maintenant = Date.now();
  const [a, b] = await Promise.all([
    instance(`test:compteA:${suffixe}`, 3, 60_000, 3, maintenant),
    instance(`test:compteB:${suffixe}`, 3, 60_000, 3, maintenant),
  ]);
  assert.equal(a, 3, 'le premier compte a tout son quota');
  assert.equal(b, 3, 'le second aussi');
});

// Une ligne expirée ne doit pas rester en base : sinon la table garderait une ligne par compte et
// par action, pour toujours, y compris pour des comptes effacés depuis longtemps.
test('la purge enlève les fenêtres mortes, pas les vivantes', { skip: URL_BASE ? false : 'Aucune base PostgreSQL : npm run test:pg' }, async () => {
  const { store } = await import('../server/store.js');
  const vieille = `test:vieille:${Date.now()}`;
  const fraiche = `test:fraiche:${Date.now()}`;
  const ancien = Date.now() - 2 * 3_600_000;

  await store.limiteConsommer(vieille, 5, 60_000, ancien);
  await store.limiteConsommer(fraiche, 5, 60_000, Date.now());
  await store.purgerLimites();

  // La vieille ligne est partie : son compteur repart de zéro, ce qui est le comportement voulu
  // puisque sa fenêtre était close de toute façon.
  assert.equal(await store.limiteConsommer(vieille, 1, 60_000, Date.now()), null, 'la fenêtre morte a été oubliée');
  // La fraîche est intacte : son unique jeton est déjà pris.
  assert.ok(await store.limiteConsommer(fraiche, 1, 60_000, Date.now()) > 0, 'la fenêtre vivante a été gardée');
});
