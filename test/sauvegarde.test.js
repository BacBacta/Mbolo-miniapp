// Une sauvegarde qu'on n'a jamais restaurée n'est pas une sauvegarde.
//
// C'est la seule chose que ce fichier cherche à établir. Vérifier qu'un fichier a été écrit, qu'il
// pèse quelque chose et qu'il se déchiffre ne prouve rien : ce qu'il faut prouver, c'est qu'une
// base **effacée** redevient celle d'avant. Le test principal fait donc exactement ce qu'on ferait
// un mauvais jour — sauvegarder, tout détruire, remettre — et compare ligne à ligne.
//
// Il ne tourne qu'avec une base PostgreSQL (npm run test:pg, ou DATABASE_URL posée). Sinon il se
// déclare sauté : le stockage fichier n'a pas de sauvegarde à éprouver, sa copie est le fichier.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const URL_BASE = process.env.DATABASE_URL || '';
const sautSansBase = URL_BASE ? false : 'Aucune base PostgreSQL : npm run test:pg';

const { chiffrer, dechiffrer, lireTout, compter, HORS_SAUVEGARDE, VERSION } = await import('../server/sauvegarde.js');
const { TABLES } = await import('../server/bascule.js');

// ---------- Le chiffrement, sans base ----------

test('une sauvegarde chiffrée se relit avec le bon secret, et pas avec un autre', async () => {
  const contenu = { version: 1, faiteLe: 'hier', tables: { users: [{ id: 'u1', data: { a: 1 } }] } };
  const octets = await chiffrer(contenu, 'le-bon-secret');

  assert.deepEqual(await dechiffrer(octets, 'le-bon-secret'), contenu);
  await assert.rejects(() => dechiffrer(octets, 'un-autre-secret'), /secret ne correspond pas/);
});

test('un fichier modifié est refusé, pas lu de travers', async () => {
  const octets = await chiffrer({ tables: { users: [{ id: 'u1' }] } }, 'secret');
  // Un octet retourné au milieu du corps : sans étiquette d'authentification, le déchiffrement
  // rendrait des octets faux au lieu de refuser, et on restaurerait des données corrompues.
  const abime = Buffer.from(octets);
  abime[abime.length - 5] ^= 0xff;
  await assert.rejects(() => dechiffrer(abime, 'secret'), /modifié|ne correspond pas/);
});

test('sans secret, rien ne s\'écrit en clair', async () => {
  await assert.rejects(() => chiffrer({ tables: {} }, ''), /BACKUP_SECRET manquant/);
  await assert.rejects(() => dechiffrer(Buffer.from([1]), ''), /BACKUP_SECRET manquant/);
});

// ---------- La couverture des tables ----------
//
// L'import vers PostgreSQL avait oublié la table des événements de mesure — la seule donnée que
// personne ne peut reconstituer. Une sauvegarde qui oublie une table fait pire : elle rassure.

test('toute table de la base est soit sauvegardée, soit exclue pour une raison écrite', { skip: sautSansBase }, async () => {
  const { pool } = await import('../server/store.pg.js');
  const schema = process.env.DATABASE_SCHEMA || 'public';
  const { rows } = await pool.query(
    'select table_name from information_schema.tables where table_schema = $1', [schema]);
  const enBase = rows.map((r) => r.table_name).sort();

  const connues = [...TABLES, ...Object.keys(HORS_SAUVEGARDE)];
  const orphelines = enBase.filter((t) => !connues.includes(t));
  assert.deepEqual(orphelines, [],
    `table(s) en base que la sauvegarde ignore sans le dire : ${orphelines.join(', ')} — ajoute-la à TABLES, ou à HORS_SAUVEGARDE avec sa raison`);

  // Et l'inverse : une table annoncée qui n'existe plus ferait échouer la sauvegarde en production.
  const fantomes = TABLES.filter((t) => !enBase.includes(t));
  assert.deepEqual(fantomes, [], `table(s) annoncée(s) par la sauvegarde mais absente(s) de la base : ${fantomes.join(', ')}`);
});

// ---------- Le test qui compte : l'aller-retour complet ----------

test('une base effacée redevient elle-même après restauration', { skip: sautSansBase }, async () => {
  const { pool } = await import('../server/store.pg.js');
  const { store } = await import('../server/store.js');

  // De quoi remplir plusieurs tables, avec des formes qui se relisent mal si le chiffrement ou le
  // JSON abîment quelque chose : un accent, une apostrophe, un objet imbriqué, une valeur nulle.
  await store.upsertTelegramUser({ id: '5101', first_name: 'Awa', language_code: 'fr' });
  await store.upsertTelegramUser({ id: '5102', first_name: 'Éric', language_code: 'en' });
  await store.updateUser('5101', { profile: { name: "L'Awa", city: 'Yaoundé', promptA: 'Le poisson braisé' }, verification: 'approved' });
  await store.updateUser('5102', { profile: { name: 'Éric', city: 'Douala' }, verification: 'approved', voix: null });
  await store.addSwipe('5101', '5102', 'like');
  await store.addSwipe('5102', '5101', 'like');
  const m = await store.createMatch('5101', '5102');
  await store.addMessage(m.id, '5101', "Salut, ça va ? J'arrive à 15 h.");
  await store.addEvent('app_opened', '5101', { n: 1 });

  const avant = await lireTout(pool);
  const attendu = compter(avant);
  assert.ok(attendu.users >= 2 && attendu.messages >= 1 && attendu.events >= 1, 'le jeu d\'essai doit remplir plusieurs tables');

  // La copie, par le vrai script : un script de sauvegarde jamais lancé est du même acabit qu'une
  // sauvegarde jamais restaurée.
  const { execFileSync } = await import('node:child_process');
  const racine = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-sauvegarde-'));
  const ecrit = execFileSync(process.execPath, ['scripts/sauvegarde.js', dossier], {
    cwd: racine, encoding: 'utf8',
    env: { ...process.env, BACKUP_SECRET: 'secret-du-test' },
  });
  assert.match(ecrit, /Sauvegarde écrite/);
  const fichiers = fs.readdirSync(dossier).filter((f) => f.endsWith('.sauvegarde'));
  assert.equal(fichiers.length, 1, 'une sauvegarde, et pas de fichier partiel laissé derrière');
  const fichier = path.join(dossier, fichiers[0]);
  // Le fichier ne doit rien laisser lire : ni un prénom, ni un message, ni un nom de table.
  const brut = fs.readFileSync(fichier).toString('latin1');
  for (const secret of ['Awa', 'Yaoundé', 'poisson braisé', 'users']) {
    assert.ok(!brut.includes(secret), `« ${secret} » se lit en clair dans la sauvegarde`);
  }

  // Le mauvais jour : tout disparaît.
  for (const table of [...TABLES].reverse()) await pool.query(`delete from "${table}"`);
  assert.equal(compter(await lireTout(pool)).users, 0, 'la base est bien vide avant la restauration');

  // La remise, par le vrai script — pas par une copie de sa logique dans le test.
  // Le test garde sa propre connexion ouverte sous le nom de l'app : le script la verrait et
  // refuserait, c'est bien ce qu'il doit faire en production. Ici on le dit explicitement.
  const sortie = execFileSync(process.execPath, ['scripts/restaurer.js', fichier, '--meme-si-lapp-tourne'], {
    cwd: racine, encoding: 'utf8',
    env: { ...process.env, BACKUP_SECRET: 'secret-du-test' },
  });
  assert.match(sortie, /Restauré et vérifié/);

  // Et la comparaison qui décide : chaque table, puis le contenu réel d'une ligne.
  const apres = await lireTout(pool);
  assert.deepEqual(compter(apres), attendu, 'chaque table doit retrouver son compte');

  const awa = apres.tables.users.find((u) => u.id === '5101');
  assert.equal(awa.data.profile.name, "L'Awa", 'l\'apostrophe a traversé');
  assert.equal(awa.data.profile.city, 'Yaoundé', 'l\'accent aussi');
  assert.equal(String(awa.created_at), String(avant.tables.users.find((u) => u.id === '5101').created_at),
    'la date d\'inscription est la même : c\'est elle qui date les cohortes');
  const message = apres.tables.messages.find((x) => x.match_id === m.id);
  assert.equal(message.text, "Salut, ça va ? J'arrive à 15 h.");

  fs.rmSync(dossier, { recursive: true, force: true });
});

// Restaurer par-dessus une base vivante, c'est faire un second incident avec le remède du premier.
test('la restauration refuse une base qui porte déjà des lignes', { skip: sautSansBase }, async () => {
  const { pool } = await import('../server/store.pg.js');
  const { store } = await import('../server/store.js');
  const { execFileSync } = await import('node:child_process');
  const racine = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-ecraser-'));
  const fichier = path.join(dossier, 'essai.sauvegarde');
  fs.writeFileSync(fichier, await chiffrer(await lireTout(pool), 'secret-du-test'));

  await store.upsertTelegramUser({ id: '5199', first_name: 'Depuis', language_code: 'fr' });

  let refus = null;
  try {
    execFileSync(process.execPath, ['scripts/restaurer.js', fichier, '--meme-si-lapp-tourne'], {
      cwd: racine, encoding: 'utf8', env: { ...process.env, BACKUP_SECRET: 'secret-du-test' },
    });
  } catch (e) { refus = `${e.stdout}${e.stderr}`; }

  assert.ok(refus, 'le script doit refuser, pas écraser en silence');
  assert.match(refus, /porte déjà/);
  assert.match(refus, /--ecraser/, 'et dire comment passer outre si c\'est voulu');
  // La personne ajoutée depuis la sauvegarde est toujours là : rien n'a été touché.
  assert.ok(await store.getUser('5199'), 'aucune ligne n\'a été effacée par un refus');

  fs.rmSync(dossier, { recursive: true, force: true });
});

// ---------- Le contrôle de lisibilité, sans base ----------
//
// Les tests ci-dessus prouvent que le mécanisme est juste. Ils ne prouvent rien sur **le fichier
// réellement écrit en production avec le secret réellement posé sur la machine** : ils emploient
// un secret de test et une base de test. C'est exactement ce qui manque le jour d'une
// restauration — et ce jour-là, découvrir que le secret a changé ou n'a jamais été gardé arrive
// trop tard. scripts/verifier-sauvegarde.js comble ce trou, et la nuit le lance sur la copie
// qu'il vient d'écrire. Ces tests-ci éprouvent le script lui-même, en vrai processus : son code
// de sortie est ce que le travail nocturne lit pour décider si la sauvegarde tient.

const lancerVerif = (fichier, secret) => new Promise((resolve) => {
  const p = spawn(process.execPath, ['scripts/verifier-sauvegarde.js', fichier], {
    env: { ...process.env, BACKUP_SECRET: secret }, cwd: process.cwd(),
  });
  let sortie = '';
  p.stdout.on('data', (d) => { sortie += d; });
  p.stderr.on('data', (d) => { sortie += d; });
  p.on('close', (code) => resolve({ code, sortie }));
});

const fichierDEssai = async (secret, tables) => {
  const contenu = {
    version: VERSION,
    faiteLe: new Date().toISOString(),
    tables: { ...Object.fromEntries(TABLES.map((t) => [t, []])), ...tables },
  };
  const chemin = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'verif-')), 'essai.sauvegarde');
  fs.writeFileSync(chemin, Buffer.from(await chiffrer(contenu, secret)));
  return chemin;
};

test('le contrôle ouvre la sauvegarde et rend compte de ce qu\'elle porte', async () => {
  const f = await fichierDEssai('bon-secret', { users: [{ id: '1' }, { id: '2' }], events: [{ id: 9 }] });
  const { code, sortie } = await lancerVerif(f, 'bon-secret');
  assert.equal(code, 0, `le contrôle doit réussir :\n${sortie}`);
  assert.match(sortie, /lisible/);
  assert.match(sortie, /users 2/);
  assert.match(sortie, /events 1/, 'chaque table est comptée, pas seulement le total');
});

test('le contrôle échoue avec un autre secret, et le dit sans ambiguïté', async () => {
  const f = await fichierDEssai('bon-secret', { users: [{ id: '1' }] });
  const { code, sortie } = await lancerVerif(f, 'pas-le-bon');
  assert.equal(code, 1, 'un mauvais secret doit faire échouer le travail, pas passer inaperçu');
  assert.match(sortie, /ne s'ouvre pas/);
  assert.ok(!sortie.includes('bon-secret'), 'et le secret ne doit jamais se retrouver dans la sortie');
});

test('le contrôle refuse un fichier abîmé, plutôt que de le lire de travers', async () => {
  const f = await fichierDEssai('bon-secret', { users: [{ id: '1' }] });
  const octets = fs.readFileSync(f);
  octets[Math.floor(octets.length / 2)] ^= 1; // un seul bit
  fs.writeFileSync(f, octets);
  const { code, sortie } = await lancerVerif(f, 'bon-secret');
  assert.equal(code, 1, 'le chiffrement est authentifié : un bit changé doit se voir');
  assert.match(sortie, /ne s'ouvre pas/);
});

test('le contrôle refuse une sauvegarde à qui il manque une table', async () => {
  // Écrite à la main sans une table : une restauration la laisserait vide en silence.
  const contenu = {
    version: VERSION,
    faiteLe: new Date().toISOString(),
    tables: Object.fromEntries(TABLES.filter((t) => t !== 'messages').map((t) => [t, []])),
  };
  const chemin = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'verif-')), 'trouee.sauvegarde');
  fs.writeFileSync(chemin, Buffer.from(await chiffrer(contenu, 'bon-secret')));
  const { code, sortie } = await lancerVerif(chemin, 'bon-secret');
  assert.equal(code, 1);
  assert.match(sortie, /messages/, 'et il nomme la table qui manque');
});
