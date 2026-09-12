// La bascule vers PostgreSQL : ce que l'import emporte, et ce qu'il laisserait derrière.
//
// Ce script ne tourne qu'une fois dans la vie du produit, le jour où la production quitte le
// fichier JSON. C'est exactement pour ça qu'il doit être éprouvé avant : personne ne le relira
// ce jour-là, et ce qu'il oublie est perdu sans que rien ne le signale. Il avait justement
// oublié la table des événements de mesure — la seule donnée que personne ne peut reconstituer.
//
// Le test ne tourne que si une base PostgreSQL est là (npm run test:pg, ou DATABASE_URL posée).
// Sinon il se déclare sauté plutôt que de passer en silence.
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

// Un db.json qui contient un peu de tout, y compris ce que les derniers chantiers ont ajouté :
// un compte fermé, les horodatages d'entonnoir, une lecture de signalement, des événements.
const dbExemple = () => ({
  users: {
    900: { id: '900', firstName: 'Awa', createdAt: 1757000000000, profile: { name: 'Awa', age: 25, city: 'Yaoundé' }, verification: 'approved', profileSavedAt: 1757000100000, verifDecidedAt: 1757000200000, firstMessageAt: 1757000300000 },
    901: { id: '901', firstName: 'Bana', createdAt: 1757000000001, profile: { name: 'Bana', age: 26, city: 'Douala' }, verification: 'approved', banned: { at: 1757000400000, motif: 'arnaque', par: 'Modo' } },
  },
  swipes: [{ from: '900', to: '901', action: 'like', at: 1757000500000 }],
  matches: { m1: { id: 'm1', key: '900:901', users: ['900', '901'], createdAt: 1757000600000, readAt: {} } },
  messages: { m1: [{ id: 'msg1', from: '900', text: 'salut', at: 1757000700000 }] },
  blocks: [{ from: '901', to: '900', at: 1757000800000 }],
  reports: [{ id: 'r1', from: '900', targetId: '901', reason: 'argent', at: 1757000900000, lectures: [{ par: '42', at: 1757001000000 }] }],
  dates: { d1: { id: 'd1', matchId: 'm1', venueId: 'palmier', status: 'accepted', arrivals: { 900: 1757001100000 } } },
  events: [
    { id: 'e1', u: '900', k: 'app_opened', at: 1757001200000 },
    { id: 'e2', u: '900', k: 'antiscam_block', at: 1757001300000, p: { c: 'MONEY_BLOCKED' } },
    { id: 'e3', k: 'account_deleted', at: 1757001400000, p: { c: '2026-W37', d: 12 } },
  ],
});

// Un schéma à part par exécution : le test ne touche à rien d'autre dans la base.
// Il est posé sur ce processus aussi, et avant tout import de store.pg.js : celui-ci lit
// DATABASE_SCHEMA au chargement du module, et sans ça le test relirait le schéma par défaut,
// c'est-à-dire une base vide — et passerait pour un import raté alors qu'il a réussi ailleurs.
const schema = `import_test_${Date.now().toString(36)}`;
process.env.DATABASE_SCHEMA = schema;
const environnement = { ...process.env, DATABASE_URL: URL_BASE, DATABASE_SCHEMA: schema, BOT_TOKEN: '' };

test('l\'import reprend tout ce que porte db.json, événements de mesure compris',
  { skip: URL_BASE ? false : 'aucune base PostgreSQL (lance npm run test:pg)' }, async () => {
    const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-import-'));
    const fichier = path.join(dossier, 'db.json');
    fs.writeFileSync(fichier, JSON.stringify(dbExemple()));

    const { stdout } = await lancer('node', ['scripts/import-json.js', fichier], { cwd: racine, env: environnement });
    assert.match(stdout, /Import terminé/);

    // On relit par le stockage, pas par SQL : c'est ce que l'app verra après la bascule.
    const pg = await import('../server/store.pg.js');
    const { store } = pg;

    const awa = await store.getUser('900');
    assert.equal(awa.profile.name, 'Awa');
    assert.equal(awa.createdAt, 1757000000000, 'la date de création est reprise, pas refaite');
    assert.equal(awa.profileSavedAt, 1757000100000, "les horodatages d'entonnoir suivent");
    assert.equal(awa.verifDecidedAt, 1757000200000);

    const bana = await store.getUser('901');
    assert.equal(bana.banned.motif, 'arnaque', 'un compte fermé reste fermé après la bascule');

    assert.ok(await store.getMatch('m1'), 'le match est là');
    assert.equal((await store.messagesOf('m1'))[0].text, 'salut');
    assert.equal(await store.isBlocked('901', '900'), true, 'le blocage tient');

    const signalements = await store.reports();
    assert.equal(signalements[0].reason, 'argent');
    assert.equal(signalements[0].lectures[0].par, '42', 'la trace de lecture suit le signalement');

    const rdv = await store.getDate('d1');
    assert.equal(rdv.status, 'accepted');
    assert.ok(rdv.arrivals['900'], "l'arrivée confirmée n'est pas perdue");

    // Le cœur du test : les événements, qui ne se reconstituent pas.
    const evts = await store.events();
    assert.equal(evts.length, 3, 'les trois événements sont passés');
    const bloque = evts.find((e) => e.k === 'antiscam_block');
    assert.equal(bloque.p.c, 'MONEY_BLOCKED', 'leur charge utile aussi');
    const supprime = evts.find((e) => e.k === 'account_deleted');
    assert.ok(supprime.u === undefined || supprime.u === null,
      "et account_deleted arrive toujours sans identifiant : la bascule ne doit pas lui en donner un");
    assert.equal(supprime.p.d, 12);
  });

test('relancer l\'import ne crée pas de doublon',
  { skip: URL_BASE ? false : 'aucune base PostgreSQL (lance npm run test:pg)' }, async () => {
    const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-import2-'));
    const fichier = path.join(dossier, 'db.json');
    fs.writeFileSync(fichier, JSON.stringify(dbExemple()));

    // Sans --force, il refuse : la base porte déjà des comptes.
    await assert.rejects(
      () => lancer('node', ['scripts/import-json.js', fichier], { cwd: racine, env: environnement }),
      (e) => /contient déjà/.test(e.stderr), 'il refuse de réimporter par-dessus une base vivante',
    );

    const { store } = await import('../server/store.pg.js');
    const avant = (await store.events()).length;
    await lancer('node', ['scripts/import-json.js', fichier, '--force'], { cwd: racine, env: environnement });
    assert.equal((await store.events()).length, avant, 'une reprise n\'ajoute rien deux fois');
    assert.equal((await store.allUsers()).length, 2);
  });
