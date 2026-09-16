// Le temps réel de la discussion, éprouvé avec un vrai flux lu depuis Node : ce qui arrive, à
// qui, et ce qui n'arrive pas. Le flux ne transporte jamais un message — il dit qu'il s'est
// passé quelque chose, et le client va chercher. Ce fichier tient donc trois promesses : le
// signal part chez l'autre et pas chez qui vient d'agir, un inconnu n'ouvre rien, et fermer le
// flux libère sa place.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-flux-'));
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.WEBAPP_URL = 'https://exemple.test';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.SEED_DEMO = 'false';
process.env.AUTO_APPROVE = 'false';

const express = (await import('express')).default;
const { store } = await import('../server/store.js');
const pid = async (id) => (await store.getUser(id))?.pid;
const { bot } = await import('../server/bot.js');
const { api } = await import('../server/routes.js');
const { nombreDeFlux, abonner, signaler, PLAFOND } = await import('../server/flux.js');
const { venues, VENUES_DEMO } = await import('../server/config.js');
venues.push(...VENUES_DEMO);

bot.api.sendMessage = async () => ({});

const app = express();
app.use(express.json());
app.use('/api', api);
const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api`;
const entetes = (user) => ({ 'Content-Type': 'application/json', 'x-dev-user': user });
const call = async (user, p, method = 'GET', body) => {
  const r = await fetch(base + p, { method, headers: entetes(user), body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
async function creer(id, name, gender) {
  await call(id, '/me');
  await call(id, '/me/profile', 'PUT', { name, age: 25, gender, intent: 'amitie', city: 'Yaoundé', promptA: 'Le poisson braisé' });
  await store.updateUser(id, { verification: 'approved' });
}
async function matcher(a, b) {
  await call(a, '/swipes', 'POST', { targetId: await pid(b), action: 'like' });
  const r = await call(b, '/swipes', 'POST', { targetId: await pid(a), action: 'like' });
  return r.body.match.id;
}

// Ouvre le flux comme le fait l'app : fetch, en-tête d'authentification, lecture continue.
async function ouvrir(user, matchId) {
  const stop = new AbortController();
  const res = await fetch(`${base}/matches/${matchId}/flux`, { headers: entetes(user), signal: stop.signal });
  const lecteur = res.ok ? res.body.getReader() : null;
  const dec = new TextDecoder();
  let texte = '';
  // Attend qu'un motif apparaisse dans ce qui a été reçu, ou rend ce qu'il y a au bout du délai.
  const attendre = async (motif, ms = 3000) => {
    const fin = Date.now() + ms;
    while (!motif.test(texte) && Date.now() < fin) {
      const course = await Promise.race([lecteur.read(), new Promise((r) => setTimeout(() => r({ delai: true }), fin - Date.now()))]);
      if (course.delai || course.done) break;
      texte += dec.decode(course.value, { stream: true });
    }
    return texte;
  };
  return { res, attendre, fermer: () => stop.abort(), recu: () => texte };
}
const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));

test.after(() => server.close());

test("le flux s'ouvre avec l'en-tête d'authentification, jamais avec un jeton dans l'adresse", async () => {
  await creer('9301', 'Awa', 'femme');
  await creer('9302', 'Éric', 'homme');
  const m = await matcher('9301', '9302');
  const f = await ouvrir('9301', m);
  assert.equal(f.res.status, 200);
  assert.match(f.res.headers.get('content-type'), /text\/event-stream/);
  assert.match(await f.attendre(/: ok/), /: ok/, "le prélude confirme que le flux est vivant");
  f.fermer();
  // Sans en-tête, rien : c'est l'authentification ordinaire qui garde la porte.
  const nu = await fetch(`${base}/matches/${m}/flux`);
  assert.equal(nu.status, 401);
});

test("un message de l'autre fait un signal ; le sien n'en fait pas", async () => {
  await creer('9303', 'Bea', 'femme');
  await creer('9304', 'Kofi', 'homme');
  const m = await matcher('9303', '9304');
  const bea = await ouvrir('9303', m);
  const kofi = await ouvrir('9304', m);
  await bea.attendre(/: ok/); await kofi.attendre(/: ok/);

  await call('9304', `/matches/${m}/messages`, 'POST', { text: 'Salut Bea' });
  assert.match(await bea.attendre(/event: signal\ndata: message/), /event: signal\ndata: message/, 'Bea est réveillée');
  // Kofi vient d'écrire : il relit déjà, on ne le réveille pas pour ça.
  await tick();
  assert.ok(!/event: signal/.test(kofi.recu()), "l'auteur ne reçoit pas son propre signal");
  // Et le flux ne porte jamais le texte : il dit qu'il y a quelque chose, pas quoi.
  assert.ok(!/Salut Bea/.test(bea.recu()), 'le message ne voyage pas dans le flux');
  bea.fermer(); kofi.fermer();
});

test("« j'écris » par le flux arrive chez l'autre, et seulement chez l'autre", async () => {
  await creer('9305', 'Coco', 'femme');
  await creer('9306', 'Dio', 'homme');
  const m = await matcher('9305', '9306');
  const coco = await ouvrir('9305', m);
  const dio = await ouvrir('9306', m);
  await coco.attendre(/: ok/); await dio.attendre(/: ok/);
  const r = await call('9306', `/matches/${m}/ecrit`, 'POST');
  assert.equal(r.status, 200);
  assert.match(await coco.attendre(/event: ecrit/), /event: ecrit/);
  await tick();
  assert.ok(!/event: ecrit/.test(dio.recu()));
  // Et la carte en mémoire le sait aussi : l'interrogation ordinaire le verrait pareil.
  assert.equal((await call('9305', `/matches/${m}?suivi=1`)).body.ecrit, true);
  coco.fermer(); dio.fermer();
});

test('un rendez-vous qui bouge fait un signal « dates »', async () => {
  await creer('9307', 'Elie', 'femme');
  await creer('9308', 'Fofo', 'homme');
  const m = await matcher('9307', '9308');
  const elie = await ouvrir('9307', m);
  await elie.attendre(/: ok/);
  const lieu = venues.find((v) => v.city === 'Yaoundé');
  const d = await call('9308', `/matches/${m}/dates`, 'POST', { venueId: lieu.id, slot: 'samedi 15h' });
  assert.equal(d.status, 200);
  assert.match(await elie.attendre(/event: signal\ndata: dates/), /event: signal\ndata: dates/);
  elie.fermer();
});

test("un inconnu n'ouvre pas le flux d'une discussion qui n'est pas la sienne", async () => {
  await creer('9309', 'Gigi', 'femme');
  await creer('9310', 'Hama', 'homme');
  await creer('9311', 'Curieux', 'homme');
  const m = await matcher('9309', '9310');
  const r = await fetch(`${base}/matches/${m}/flux`, { headers: entetes('9311') });
  assert.equal(r.status, 404);
});

test('fermer le flux libère sa place, et un second flux de la même personne remplace le premier', async () => {
  await creer('9312', 'Ines', 'femme');
  await creer('9313', 'Jules', 'homme');
  const m = await matcher('9312', '9313');
  const avant = nombreDeFlux();
  const a = await ouvrir('9312', m); await a.attendre(/: ok/);
  assert.equal(nombreDeFlux(), avant + 1);
  // Un rechargement de l'app rouvre un flux : l'ancien ne doit pas rester en orphelin.
  const b = await ouvrir('9312', m); await b.attendre(/: ok/);
  await tick();
  assert.equal(nombreDeFlux(), avant + 1, 'une personne, une discussion, un flux');
  b.fermer(); a.fermer();
  await tick(150);
  assert.equal(nombreDeFlux(), avant, 'fermer libère');
});

// Le plafond, sans ouvrir cent cinquante connexions : la carte se pilote directement.
test("au plafond, le flux répond 503 et l'app continue sans lui", async () => {
  await creer('9314', 'Kim', 'femme');
  await creer('9315', 'Lou', 'homme');
  const m = await matcher('9314', '9315');
  const faux = [];
  const bidon = () => ({ write() {}, end() {} });
  for (let i = nombreDeFlux(); i < PLAFOND; i += 1) faux.push(abonner(`faux-${i}`, `u${i}`, bidon()));
  try {
    const r = await fetch(`${base}/matches/${m}/flux`, { headers: entetes('9314') });
    assert.equal(r.status, 503);
    assert.equal((await r.json()).code, 'FLUX_SATURE');
  } finally { faux.forEach((d) => d()); }
  // Une fois la place libérée, ça rouvre.
  const f = await ouvrir('9314', m);
  assert.equal(f.res.status, 200);
  f.fermer();
});

test("signaler() n'écrit qu'aux abonnés de la discussion, sauf l'exclu, et retire un abonné mort", () => {
  const recu = [];
  const bon = (nom) => ({ write: (x) => recu.push(`${nom}:${x}`), end() {} });
  const mort = { write() { throw new Error('fermé'); }, end() {} };
  const d1 = abonner('t1', 'a', bon('a'));
  const d2 = abonner('t1', 'b', bon('b'));
  const d3 = abonner('t1', 'c', mort);
  const d4 = abonner('t2', 'z', bon('z'));
  assert.equal(signaler('t1', 'signal', 'message', { sauf: 'a' }), 1, 'b seulement : a est exclu, c est mort');
  assert.deepEqual(recu, ['b:event: signal\ndata: message\n\n']);
  assert.equal(signaler('t1', 'ecrit'), 2, "c a été retiré : il ne compte plus");
  assert.equal(signaler('inconnue', 'signal'), 0);
  [d1, d2, d3, d4].forEach((d) => d());
});
