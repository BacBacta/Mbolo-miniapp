// D'où vient la personne — et ce qu'on refuse de retenir.
//
// Deux choses sont éprouvées ici, et la seconde compte plus que la première.
//
// 1. Le mot se range une seule fois, ne s'écrase pas, et n'entre que s'il est dans la liste
//    fermée. Un fourre-tout « autre » n'existe pas : ce qu'on ne connaît pas n'est pas rangé.
// 2. **Aucun lien entre qui invite et qui arrive.** C'est le refus qui a décidé de la forme de
//    tout ce mécanisme (voir SOURCES dans server/config.js), et c'est celui qu'une session
//    pressée rouvrirait sans le voir : ajouter « qui m'a invité » se fait en une ligne, et
//    fabrique un graphe social sur une app de rencontres. Le test le nomme pour qu'on ait à
//    l'effacer sciemment.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-provenance-'));
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.WEBAPP_URL = 'https://exemple.test';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.SEED_DEMO = 'false';
process.env.AUTO_APPROVE = 'false';
process.env.EVENTS_RETENTION_DAYS = '180';

const express = (await import('express')).default;
const { store } = await import('../server/store.js');
const { bot } = await import('../server/bot.js');
const { api } = await import('../server/routes.js');
const { SOURCES, sourceConnue } = await import('../server/config.js');
const { calculer } = await import('../server/chiffres.js');

bot.api.sendMessage = async () => ({});

const app = express();
app.use(express.json());
app.use('/api', api);
const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api`;
const call = async (user, p) => {
  const r = await fetch(base + p, { headers: { 'x-dev-user': user } });
  return { status: r.status, body: await r.json() };
};
const sourceDe = async (id) => (await store.getUser(id))?.source;
const evts = async (id) => (await store.events({ k: 'venu_de' })).filter((e) => e.u === String(id));

test('la liste est fermée, et elle ne contient pas de fourre-tout', () => {
  assert.ok(SOURCES.length > 0);
  // « autre » attirerait tout ce qui ne va nulle part, et on croirait mesurer un canal.
  for (const interdit of ['autre', 'divers', 'inconnu', '']) assert.ok(!SOURCES.includes(interdit), `« ${interdit} » ne doit pas être un canal`);
  assert.ok(sourceConnue('campus'));
  assert.ok(!sourceConnue('CAMPUS'), 'la comparaison est exacte, pas approximative');
  assert.ok(!sourceConnue('sarah'));
  assert.ok(!sourceConnue(undefined));
});

test('un mot de la liste se range, et pose un événement', async () => {
  const r = await call('900001', '/me?source=campus');
  assert.equal(r.status, 200);
  assert.equal(await sourceDe('900001'), 'campus');
  assert.equal((await evts('900001')).length, 1);
});

test('la première vue gagne : une seconde ouverture ne l\'écrase pas', async () => {
  await call('900002', '/me?source=campus');
  await call('900002', '/me?source=whatsapp');
  await call('900002', '/me?source=affiche');
  assert.equal(await sourceDe('900002'), 'campus');
  // Et l'événement n'est posé qu'à la pose réelle : rouvrir dix fois ne fait pas dix arrivées.
  assert.equal((await evts('900002')).length, 1);
});

test('un mot hors liste n\'est pas rangé, et n\'est pas corrigé en « autre »', async () => {
  await call('900003', '/me?source=tiktok');
  assert.equal(await sourceDe('900003'), undefined);
  assert.equal((await evts('900003')).length, 0);
  // Et la place reste libre : le vrai canal, découvert plus tard, entre encore.
  await call('900003', '/me?source=groupe');
  assert.equal(await sourceDe('900003'), 'groupe');
});

test('un prénom ne passe pas par cette porte', async () => {
  for (const tentative of ['Sarah', 'sarah', '237690000000', 'campus%20de%20Ngoa']) {
    await call('900004', `/me?source=${encodeURIComponent(tentative)}`);
    assert.equal(await sourceDe('900004'), undefined, `« ${tentative} » ne doit rien ranger`);
  }
});

test('la provenance ne sort jamais du serveur', async () => {
  const r = await call('900005', '/me?source=story');
  assert.equal(await sourceDe('900005'), 'story');
  // Le navigateur l'a envoyée ; il n'a aucune raison de la relire, et une réponse qui la porte
  // est une réponse qu'un autre écran pourrait recopier ailleurs sans y penser.
  assert.equal(JSON.stringify(r.body).includes('story'), false);
});

test('aucun lien entre qui invite et qui arrive', async () => {
  await call('900006', '/me?source=membre');
  const u = await store.getUser('900006');
  // Le compte ne porte qu'un mot de canal. Pas d'identifiant, pas de pid, pas de prénom.
  assert.equal(u.source, 'membre');
  for (const champ of ['parrain', 'invitePar', 'referrer', 'invitedBy', 'filleuls', 'invites']) {
    assert.equal(u[champ], undefined, `« ${champ} » rouvrirait le graphe social : voir SOURCES dans config.js`);
  }
  // Et l'événement ne porte que le canal.
  const [e] = await evts('900006');
  assert.deepEqual(Object.keys(e.p), ['source']);
});

test('le lien de partage dit « membre » et ne nomme personne', () => {
  const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'app.js'), 'utf8');
  // Le partage vit dans inviter() : deux portes y mènent (les réglages, et un paquet vide).
  const invite = src.slice(src.indexOf('function inviter() {'), src.indexOf('function inviter() {') + 500);
  // `startapp` et pas `start` : seul le premier remplit start_param dans la mini app.
  assert.match(invite, /\?startapp=ref_membre/);
  // Ce qui ne doit pas s'y glisser : l'identifiant de qui partage.
  assert.ok(!/ref_\$\{/.test(invite), 'le lien de partage ne doit pas être composé avec une valeur');
});

test('la source part avec le compte', async () => {
  await call('900007', '/me?source=campus');
  assert.equal(await sourceDe('900007'), 'campus');
  await store.deleteUser('900007');
  assert.equal(await store.getUser('900007'), null);
});

test('les chiffres découpent l\'entonnoir par canal, et « — » n\'est pas un canal', () => {
  const JOUR = 86400e3;
  const maintenant = Date.UTC(2026, 8, 16);
  const vieux = maintenant - 30 * JOUR;
  const users = [
    { id: '1', createdAt: vieux, profileSavedAt: vieux, verification: 'approved', source: 'campus' },
    { id: '2', createdAt: vieux, profileSavedAt: vieux, verification: 'approved', source: 'campus' },
    { id: '3', createdAt: vieux, source: 'whatsapp' },
    { id: '4', createdAt: vieux },
  ];
  const r = calculer({ users, events: [], matches: [], messages: new Map() }, maintenant);
  assert.equal(r.provenance.campus.comptes, 2);
  assert.equal(r.provenance.campus.profil, 2);
  assert.equal(r.provenance.campus.partProfil, 1);
  assert.equal(r.provenance.whatsapp.comptes, 1);
  assert.equal(r.provenance.whatsapp.partProfil, 0);
  // Sans provenance, le compte va sous « — » plutôt que d'être rangé de force quelque part.
  assert.equal(r.provenance['—'].comptes, 1);
  // Et l'avertissement sur la falsifiabilité est là dès qu'un canal existe.
  assert.ok(r.avertissements.some((a) => a.includes('?startapp=ref_campus')));
});

// Le partage en story est l'autre moitié de la diffusion, et il porte sa propre provenance
// (`ref_story`). Ce qui est éprouvé ici : l'image existe vraiment, elle est légère, elle est
// servie par une adresse stable, et **elle ne montre le profil de personne**.
test('le visuel de story existe, reste léger, et ne montre aucun profil', () => {
  const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const image = path.join(racine, 'public', 'story.jpg');
  assert.ok(fs.existsSync(image), 'public/story.jpg doit être dans le dépôt : Telegram va le chercher par son adresse');
  // Règle 15 : ce fichier part sur un forfait compté à chaque partage. Un PNG en faisait un
  // mégaoctet, d'où le JPEG. La borne empêche d'y revenir sans le voir.
  assert.ok(fs.statSync(image).size < 200 * 1024, 'le visuel de story doit rester sous 200 ko');

  const index = fs.readFileSync(path.join(racine, 'server', 'index.js'), 'utf8');
  assert.match(index, /app\.get\('\/story\.jpg'/, "l'image doit avoir sa propre route : son adresse ne porte pas d'empreinte");
  assert.ok(!/story\.jpg[^\n]*immutable/.test(index), 'un an de cache ferait circuler un ancien nom après un renommage');

  const app = fs.readFileSync(path.join(racine, 'public', 'app.js'), 'utf8');
  const debut = app.indexOf("case 'story'");
  const bloc = app.slice(debut, app.indexOf("case '", debut + 20));
  // Le lien de la story dit d'où vient l'arrivant, et rien de plus.
  assert.match(bloc, /startapp=ref_story/);
  // Rien du profil n'entre dans le partage : ni photo, ni prénom, ni identifiant public.
  for (const fuite of ['S.me.profile', 'S.me.id', 'publicProfile', 'photos']) {
    assert.ok(!bloc.includes(fuite), `le partage en story ne doit rien emporter du profil (${fuite})`);
  }
});

test.after(() => server.close());
