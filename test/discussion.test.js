// Ce que la discussion doit faire entre deux réponses du réseau.
//
// Deux moitiés, et elles ne se prouvent pas au même endroit. Ce que le **serveur** répond
// s'éprouve en vrai, avec deux comptes et un vrai match. Ce que l'**interface** fait entre
// l'appui et la réponse se lit dans la source d'app.js : un test de bout en bout qui attendrait
// une course ne prouverait rien (même raison que test/interface.test.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-discussion-'));
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

test.after(() => server.close());

// ---------- Qui écrit ----------

test("« écrit… » ne se déclare que sur demande, et ne se voit que chez l'autre", async () => {
  await creer('9101', 'Awa', 'femme');
  await creer('9102', 'Éric', 'homme');
  const m = await matcher('9101', '9102');

  // Personne n'écrit : personne ne le voit.
  assert.equal((await call('9101', `/matches/${m}?suivi=1`)).body.ecrit, false);

  // Une interrogation ordinaire ne déclare rien. C'est le point : le mot doit être **demandé**,
  // sinon ouvrir la discussion suffirait à dire qu'on est en train de répondre.
  await call('9102', `/matches/${m}?suivi=1`);
  assert.equal((await call('9101', `/matches/${m}?suivi=1`)).body.ecrit, false);

  // Éric écrit : Awa le voit, et Éric ne se voit pas lui-même.
  await call('9102', `/matches/${m}?suivi=1&ecrit=1`);
  assert.equal((await call('9101', `/matches/${m}?suivi=1`)).body.ecrit, true);
  assert.equal((await call('9102', `/matches/${m}?suivi=1`)).body.ecrit, false);
});

test('la frappe ne laisse aucune trace : ni dans le compte, ni dans la discussion', async () => {
  await creer('9103', 'Bea', 'femme');
  await creer('9104', 'Kofi', 'homme');
  const m = await matcher('9103', '9104');
  const avant = JSON.stringify(await store.getUser('9104'));
  await call('9104', `/matches/${m}?suivi=1&ecrit=1`);
  // Rien sur le compte, et surtout aucun message : une hésitation n'est pas un message.
  assert.equal(JSON.stringify(await store.getUser('9104')), avant);
  assert.equal((await store.messagesOf(m)).length, 0);
});

test("la frappe d'une discussion ne se voit pas dans une autre", async () => {
  await creer('9105', 'Coco', 'femme');
  await creer('9106', 'Dio', 'homme');
  await creer('9107', 'Elie', 'homme');
  const m1 = await matcher('9105', '9106');
  const m2 = await matcher('9105', '9107');
  await call('9106', `/matches/${m1}?suivi=1&ecrit=1`);
  assert.equal((await call('9105', `/matches/${m1}?suivi=1`)).body.ecrit, true);
  assert.equal((await call('9105', `/matches/${m2}?suivi=1`)).body.ecrit, false);
});

test("un inconnu ne peut pas se déclarer en train d'écrire chez les autres", async () => {
  await creer('9108', 'Fana', 'femme');
  await creer('9109', 'Gaby', 'homme');
  await creer('9110', 'Curieux', 'homme');
  const m = await matcher('9108', '9109');
  // La route entière refuse avant d'arriver à la frappe : c'est `loadMatch` qui garde la porte,
  // et la déclaration est posée après lui. Un test le fige, pour que l'ordre ne s'inverse pas.
  const r = await call('9110', `/matches/${m}?suivi=1&ecrit=1`);
  assert.equal(r.status, 404);
  assert.equal((await call('9108', `/matches/${m}?suivi=1`)).body.ecrit, false);
});

// ---------- Les amorces ----------
//
// « Les amorces font-elles écrire ? » est la seule question qu'elles posent. On ne compte donc que
// ce qui y répond : le premier message de chaque personne dans un fil, parti d'une amorce connue,
// et jamais face à un profil de démonstration, dont les réponses ne prouvent rien.

const amorces = async () => (await store.events({ k: 'amorce' })).length;

test("une amorce ne se compte qu'au premier message, et seulement si le mot est connu", async () => {
  await creer('9201', 'Hawa', 'femme');
  await creer('9202', 'Idris', 'homme');
  const m = await matcher('9201', '9202');
  const avant = await amorces();
  // Un mot inconnu n'est pas une amorce : rien n'est posé, et le message part quand même.
  let r = await call('9202', `/matches/${m}/messages`, 'POST', { text: 'Salut', amorce: 'nimporte' });
  assert.equal(r.status, 200);
  assert.equal(await amorces(), avant);
  // Le premier message d'Hawa part d'une amorce : compté.
  r = await call('9201', `/matches/${m}/messages`, 'POST', { text: 'Tu es à Bastos. C\'est comment, par là ?', amorce: 'quartier' });
  assert.equal(r.status, 200);
  assert.equal(await amorces(), avant + 1);
  // Son deuxième, même avec le mot : plus un premier message, pas compté.
  await call('9201', `/matches/${m}/messages`, 'POST', { text: 'Et sinon ?', amorce: 'profil' });
  assert.equal(await amorces(), avant + 1);
  // La charge utile porte le mot, jamais le texte.
  const e = (await store.events({ k: 'amorce' })).at(-1);
  assert.deepEqual(e.p, { k: 'quartier' });
});

test("la date du match arrive avec la discussion, et le texte d'une amorce n'est pas stocké à part", async () => {
  await creer('9203', 'Jo', 'femme');
  await creer('9204', 'Karim', 'homme');
  const m = await matcher('9203', '9204');
  const r = await call('9203', `/matches/${m}`);
  assert.ok(Number.isFinite(r.body.depuis) && Date.now() - r.body.depuis < 60_000, 'depuis = création du match');
  // L'interrogation suivante ne la renvoie pas : elle ne change jamais, et chaque octet compte.
  assert.equal((await call('9203', `/matches/${m}?suivi=1`)).body.depuis, undefined);
});

// ---------- Ce que fait l'interface avant la réponse du serveur ----------

const app_js = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const entre = (debut, fin) => app_js.slice(app_js.indexOf(debut), app_js.indexOf(fin, app_js.indexOf(debut)));

test("la bulle part avant le serveur, marquée en cours, et un refus la retire en rendant le texte", () => {
  const envoi = entre('async function sendMessage(input) {', 'async function sendDate() {');
  // Poussée **avant** l'appel : c'est toute la différence entre « instantané » et « deux secondes ».
  const posee = envoi.indexOf('S.chat.messages.push(brouillon)');
  const appel = envoi.indexOf('await api(');
  assert.ok(posee > 0 && posee < appel, "la bulle doit être posée avant l'appel au serveur");
  assert.match(envoi, /enCours: true/, 'et marquée en cours tant que rien n\'est confirmé');
  // Un refus (anti-arnaque, limite de débit) doit défaire exactement ce qui a été fait.
  const refus = envoi.slice(envoi.indexOf('} catch (e) {'));
  assert.match(refus, /S\.chat\.messages\.splice\(i, 1\)/, 'la bulle disparaît');
  assert.match(refus, /input\.value = text/, 'et le texte revient dans le champ');
});

test("l'horodatage d'un message provisoire ne sert jamais de repère au serveur", () => {
  const poll = entre('async function pollChat() {', 'function montrerLaFrappe() {');
  // `at` d'un provisoire vient de l'horloge du téléphone. Prise comme `after`, une horloge en
  // avance ferait sauter de vrais messages — ils ne reviendraient jamais.
  assert.match(poll, /messages\.filter\(\(m\) => !m\.enCours\)\.at\(-1\)/);
});

test("une amorce remplit le champ sans envoyer, et la carte s'efface au premier message envoyé", () => {
  const pose = entre('function poserLAmorce(', 'function chatTete(c) {');
  assert.match(pose, /input\.value = texte/);
  assert.ok(!/api\(|sendMessage\(|requestSubmit/.test(pose), "une amorce n'envoie rien : c'est la personne qui appuie");
  assert.ok(!/render\(|SCREENS\./.test(pose), "et ne refait pas l'écran : le clavier se fermerait");
  const carte = entre('function ouverture(c) {', 'function poserLAmorce(');
  assert.match(carte, /if \(c\.messages\.some\(\(m\) => m\.mine\)\) return '';/, 'la carte disparaît dès que j\'ai écrit');
  // Le mot accompagne l'envoi, une fois, puis s'efface : un deuxième message ne le porte pas.
  const envoi = entre('async function sendMessage(input) {', 'async function sendDate() {');
  assert.match(envoi, /const amorce = S\.chat\.amorce;\s*S\.chat\.amorce = null;/);
});

test('une bulle en cours se voit comme telle', () => {
  const css = fs.readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.bubble\.encours \{[^}]*opacity/, "sans quoi un message refusé aurait eu l'air d'être parti");
});

test("la barre de déblocage compte l'échange, comme le serveur", () => {
  // Le serveur débloque sur `Math.min(les miens, les siens)` — le message d'erreur dit déjà
  // « échangés de chaque côté ». La barre additionnait tout le fil : trois messages dont un seul
  // de l'autre personne affichaient « 3/10 » pour un échange réel de 1.
  const calcul = entre('const echangeDe = (c) =>', 'function barreDeDeblocage');
  assert.match(calcul, /Math\.min\(/);
  assert.match(calcul, /m\.mine\)\.length/);
  assert.match(calcul, /!m\.mine\)\.length/);
  assert.ok(!/Math\.min\(c\.messages\.length, c\.unlockAfter\)/.test(app_js), 'le total ne doit plus servir de compte');
});

test("il n'y a qu'un endroit qui arme le minuteur de la discussion, et il éteint le précédent", () => {
  // La cadence change selon l'activité, donc le minuteur se réarme à chaque tour : c'est
  // exactement la situation où un second minuteur orphelin s'installe sans qu'on le voie.
  const armements = app_js.match(/S\.chatTimer = set\w+\(/g) || [];
  assert.equal(armements.length, 1, 'un seul endroit arme le minuteur');
  assert.match(entre('function arreterLePoll(', 'function relancerLePoll('), /clearTimeout\(S\.chatTimer\)/);
  const relancer = entre('function relancerLePoll(', 'async function pollChat()');
  assert.match(relancer, /arreterLePoll\(\);[\s\S]*S\.chatTimer = setTimeout/, 'et il éteint avant d\'armer');
});
