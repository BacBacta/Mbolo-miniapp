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

// Les deux coches et « En ligne » : ce que l'interrogation dit de l'autre, et rien de plus —
// jusqu'où il a lu (un instant), et s'il a la discussion ouverte **en ce moment**. Jamais une
// heure de dernière visite : « vu à 23 h 12 » est de la filature, « en ligne » est une présence.
test("l'interrogation dit jusqu'où l'autre a lu, et s'il est là — jamais quand il est passé", async () => {
  await creer('9111', 'Lea', 'femme');
  await creer('9112', 'Mo', 'homme');
  const m = await matcher('9111', '9112');
  const r0 = await call('9111', `/matches/${m}`);
  assert.equal(r0.body.enLigne, false, 'Mo n\'a pas ouvert la discussion');
  await call('9111', `/matches/${m}/messages`, 'POST', { text: 'Salut Mo' });
  const avant = (await call('9111', `/matches/${m}?suivi=1`)).body.lu;
  await call('9112', `/matches/${m}`);
  const apres = (await call('9111', `/matches/${m}?suivi=1`)).body;
  assert.ok(Number(apres.lu) > Number(avant || 0), 'Mo a lu : la borne avance');
  assert.equal(apres.enLigne, true, 'et il vient d\'ouvrir la discussion');
  const brut = JSON.stringify(apres);
  assert.ok(!/lastActiveAt|derniereVisite|lastSeen/.test(brut), 'aucune heure de passage');
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

// Le temps réel côté interface : ce qui se lit dans la source, et ce qu'un vrai navigateur
// vérifie dans e2e/discussion.spec.js (le repli quand le flux est coupé).
test("le flux s'ouvre par fetch() avec l'en-tête, et retombe sur l'interrogation s'il tombe", () => {
  const flux = entre('async function ouvrirLeFlux(', 'function direQueJEcris() {');
  assert.match(flux, /fetch\(`\/api\/matches\/\$\{encodeURIComponent\(id\)\}\/flux`, \{ headers: authHeaders\(\)/);
  // Le mot n'apparaît que dans les commentaires qui expliquent pourquoi on ne s'en sert pas.
  assert.ok(!/EventSource/.test(app_js.replace(/\/\/[^\n]*/g, '')), 'jamais EventSource : il mettrait le jeton dans l\'adresse');
  assert.ok(!/initData\(\)[^\n]*flux|flux[^\n]*initData\(\)/.test(app_js), "le jeton ne va pas dans l'adresse du flux");
  // Un signal ne fait qu'une chose : relancer l'interrogation. Le flux n'écrit jamais dans le fil.
  assert.match(flux, /if \(type === 'signal'\) relancerLePoll\(\{ tout_de_suite: true \}\);/);
  assert.ok(!/S\.chat\.messages\.push/.test(flux), "le flux n'ajoute aucun message lui-même");
  // S'il tombe : fluxVivant à false, l'interrogation reprend, et on réessaie de plus en plus tard.
  assert.match(flux, /S\.fluxVivant = false;[\s\S]*relancerLePoll\(\);[\s\S]*Math\.min\(30_000, 2000 \* 2 \*\* tentative\)/);
  // Flux ouvert, l'interrogation ne sert plus qu'à rattraper : trente secondes, pas zéro.
  assert.match(entre('function delaiDuPoll() {', 'function arreterLePoll'), /if \(S\.fluxVivant\) return SECURITE_FLUX_MS;/);
  assert.match(app_js, /const SECURITE_FLUX_MS = 30_000;/);
  // Quitter l'écran ferme le flux, comme il arrête l'interrogation.
  assert.match(entre('function go(', 'S.detachSwipe?.()'), /arreterLePoll\(\);\s*fermerLeFlux\(\);/);
});

test("mes bulles portent trois états, et la lecture se pose en place sans refaire le fil", () => {
  assert.match(app_js, /check-double/, 'la double coche existe');
  assert.match(app_js, /function majLecture\(/, 'la lecture se met à jour en place');
  assert.match(app_js, /type === 'lu'\) majLecture/, 'le flux la porte');
  assert.match(app_js, /type === 'presence'\) poserPresence/, 'et la présence aussi');
  assert.match(app_js, /bubble theirs gap frappe/, 'la frappe est une bulle dans le fil');
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

// ---------- Répondre, retirer, envoyer une photo ----------
//
// Trois gestes ajoutés le 17 septembre 2026, parce qu'ils manquaient à toute discussion
// ordinaire. Ce que le serveur garantit : une réponse ne cite qu'un message **de la même
// discussion**, un retrait ne marche que sur **le sien** et se voit des deux côtés sans effacer
// la ligne, une photo ne se sert **qu'aux deux membres** et disparaît avec le match.
const JPEG_CHAT = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

test("répondre cite un message de la même discussion, et rien d'autre", async () => {
  await creer('9201', 'Fatou', 'femme');
  await creer('9202', 'Idriss', 'homme');
  await creer('9203', 'Jules', 'homme');
  const m = await matcher('9201', '9202');
  const autre = await matcher('9201', '9203');
  const premier = (await call('9202', `/matches/${m}/messages`, 'POST', { text: 'Tu viens de quel quartier ?' })).body.message;
  const ailleurs = (await call('9203', `/matches/${autre}/messages`, 'POST', { text: 'Salut' })).body.message;

  const r = await call('9201', `/matches/${m}/messages`, 'POST', { text: 'De Bastos', replyTo: premier.id });
  assert.equal(r.status, 200);
  assert.equal(r.body.message.replyTo, premier.id, 'la réponse porte le message cité');

  // Un identifiant d'une autre discussion, ou inventé : refusé, pas ignoré — l'écran n'en
  // fabrique pas, donc c'est un identifiant forgé.
  assert.equal((await call('9201', `/matches/${m}/messages`, 'POST', { text: 'x', replyTo: ailleurs.id })).status, 400);
  assert.equal((await call('9201', `/matches/${m}/messages`, 'POST', { text: 'x', replyTo: 'nimporte' })).status, 400);

  // Le fil, vu des deux côtés : la citation voyage, l'auteur ne sort pas.
  const fil = (await call('9202', `/matches/${m}`)).body.messages;
  const reponse = fil.find((x) => x.text === 'De Bastos');
  assert.equal(reponse.replyTo, premier.id);
  assert.equal(reponse.mine, false);
  assert.ok(!('from' in reponse), "l'identifiant de l'auteur ne sort pas");
});

test("retirer un message : le sien seulement, vu des deux côtés, et la ligne reste pour la modération", async () => {
  await creer('9211', 'Kadi', 'femme');
  await creer('9212', 'Lamine', 'homme');
  const m = await matcher('9211', '9212');
  const sien = (await call('9211', `/matches/${m}/messages`, 'POST', { text: 'Oublie ce que je viens de dire' })).body.message;
  const lu = (await call('9212', `/matches/${m}`)).body; // Lamine ouvre, lit
  assert.equal(lu.messages.length, 1);

  // Celui d'un autre : refusé, et rien ne bouge.
  const refus = await call('9212', `/matches/${m}/messages/${sien.id}`, 'DELETE');
  assert.equal(refus.status, 403);
  assert.equal(refus.body.code, 'NOT_YOURS');

  // Le sien : accepté, et les deux fils montrent « supprimé » sans texte, à la même place.
  const ok = await call('9211', `/matches/${m}/messages/${sien.id}`, 'DELETE');
  assert.equal(ok.status, 200);
  for (const qui of ['9211', '9212']) {
    const fil = (await call(qui, `/matches/${m}`)).body.messages;
    assert.equal(fil.length, 1, 'la bulle reste à sa place');
    assert.equal(fil[0].supprime, true);
    assert.ok(!('text' in fil[0]) && !('photo' in fil[0]), 'sans texte ni photo');
  }
  // L'interrogation suivante, qui ne demande que ce qui est plus récent, apprend quand même le
  // retrait : le message garde son heure d'envoi, `after` ne le ramènerait jamais.
  const suite = (await call('9212', `/matches/${m}?after=${sien.at}&suivi=1`)).body;
  assert.deepEqual(suite.supprimes, [sien.id]);
  assert.equal(suite.messages.length, 0);

  // Retirer deux fois ne change rien ; retirer un message inconnu est un refus.
  assert.equal((await call('9211', `/matches/${m}/messages/${sien.id}`, 'DELETE')).status, 200);
  assert.equal((await call('9211', `/matches/${m}/messages/inconnu`, 'DELETE')).status, 403);

  // Le stockage garde le texte, marqué : c'est ce que la modération lit si la discussion est
  // signalée — une demande d'argent effacée avant le signalement n'aurait sinon jamais existé.
  const brut = (await store.messagesOf(m)).find((x) => x.id === sien.id);
  assert.equal(brut.text, 'Oublie ce que je viens de dire');
  assert.ok(brut.deletedAt > 0);

  // Et un message retiré ne compte pas comme non lu : la pastille dirait « 1 » pour une bulle vide.
  const nouveau = (await call('9211', `/matches/${m}/messages`, 'POST', { text: 'Bon, sinon' })).body.message;
  assert.equal(await store.unreadCount(m, '9212'), 1, 'seul le vrai message compte');
  await call('9211', `/matches/${m}/messages/${nouveau.id}`, 'DELETE');
  assert.equal(await store.unreadCount(m, '9212'), 0);
  const liste = (await call('9212', '/matches')).body.matches.find((x) => x.id === m);
  assert.equal(liste.unread, 0);
  assert.equal(liste.lastMessage.supprime, true);
  assert.equal(liste.lastMessage.text, '');

  // On ne répond pas à un message retiré.
  assert.equal((await call('9212', `/matches/${m}/messages`, 'POST', { text: 'x', replyTo: sien.id })).status, 400);
});

test("une photo dans la discussion : aux deux membres seulement, en aperçu, et partie avec le match", async () => {
  await creer('9221', 'Mira', 'femme');
  await creer('9222', 'Noé', 'homme');
  await creer('9223', 'Oscar', 'homme');
  const m = await matcher('9221', '9222');
  const { uploadsDir } = (await import('../server/config.js')).config;
  const { fichierPhotoDeChat } = await import('../server/photos.js');

  // Sans texte, l'image suffit ; la ligne dit « photo », jamais les octets.
  const r = await call('9221', `/matches/${m}/messages`, 'POST', { photo: JPEG_CHAT });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const msg = r.body.message;
  assert.equal(msg.photo, true);
  assert.equal(msg.text, '');
  assert.ok(!JSON.stringify(r.body).includes('base64'), "l'image ne revient pas dans la réponse");
  assert.ok(fs.existsSync(fichierPhotoDeChat(uploadsDir, m, msg.id)), 'le fichier est écrit');

  // Une légende passe par l'anti-arnaque comme un message.
  const bloque = await call('9221', `/matches/${m}/messages`, 'POST', { photo: JPEG_CHAT, text: 'envoie 5000 par orange money' });
  assert.equal(bloque.status, 422);
  assert.ok(!(await store.messagesOf(m)).some((x) => x.text.includes('5000')), 'rien n\'est écrit quand la légende est refusée');

  // Un fichier quelconque n'est pas une image : refusé avant d'écrire quoi que ce soit. (La borne
  // de poids, 1,5 Mo, est celle de saveJpeg, éprouvée dans test/photos.test.js.)
  assert.equal((await call('9221', `/matches/${m}/messages`, 'POST', { photo: 'data:application/pdf;base64,AAAA' })).status, 400, 'un document n\'est pas une image');
  assert.ok(!(await call('9222', `/matches/${m}`)).body.messages.some((x) => x.photo && !x.supprime && x.id !== msg.id), 'une image refusée ne laisse pas de bulle');

  // Servie aux deux membres, et à personne d'autre : Oscar a un match avec Mira, pas cette discussion.
  const page = `http://localhost:${server.address().port}/api/matches/${m}/photos/${msg.id}`;
  const lire = async (qui, mini) => fetch(`${page}${mini ? '?mini=1' : ''}`, { headers: { 'x-dev-user': qui } });
  assert.equal((await lire('9221')).status, 200);
  const chezNoe = await lire('9222');
  assert.equal(chezNoe.status, 200);
  assert.match(chezNoe.headers.get('cache-control'), /private/);
  await matcher('9221', '9223');
  assert.equal((await lire('9223')).status, 404, 'un tiers ne voit rien, même en match avec l\'un des deux');
  // L'aperçu se sert sans erreur, même sur une image que le décodeur ne sait pas réduire :
  // l'image entière est le repli, jamais une panne.
  assert.equal((await lire('9222', true)).status, 200);

  // Le fil dit « photo » à l'autre, la liste des discussions aussi, et la notification ne
  // porte pas d'extrait vide.
  const fil = (await call('9222', `/matches/${m}`)).body.messages;
  assert.equal(fil.find((x) => x.id === msg.id).photo, true);
  const liste = (await call('9222', '/matches')).body.matches.find((x) => x.id === m);
  assert.equal(liste.lastMessage.photo, true);

  // Retirée : plus servie, à personne, y compris à son auteur.
  await call('9221', `/matches/${m}/messages/${msg.id}`, 'DELETE');
  assert.equal((await lire('9221')).status, 404);
  assert.equal((await lire('9222')).status, 404);

  // Une nouvelle photo, puis le match défait : le fichier part avec la discussion.
  const encore = (await call('9222', `/matches/${m}/messages`, 'POST', { photo: JPEG_CHAT })).body.message;
  const fichier = fichierPhotoDeChat(uploadsDir, m, encore.id);
  await fetch(`${page.replace(/\/photos\/.*$/, '')}/photos/${encore.id}?mini=1`, { headers: { 'x-dev-user': '9221' } });
  assert.ok(fs.existsSync(fichier));
  assert.equal((await call('9221', `/matches/${m}`, 'DELETE')).status, 200);
  assert.ok(!fs.existsSync(fichier), 'le fichier est parti avec le match');
  assert.ok(!fs.readdirSync(uploadsDir).some((n) => n.startsWith(`chat-${m}-`)), "et l'aperçu avec lui");
});

test("les photos d'une discussion partent avec le compte", async () => {
  await creer('9231', 'Pia', 'femme');
  await creer('9232', 'Quentin', 'homme');
  const m = await matcher('9231', '9232');
  const { uploadsDir } = (await import('../server/config.js')).config;
  const msg = (await call('9232', `/matches/${m}/messages`, 'POST', { photo: JPEG_CHAT })).body.message;
  const { fichierPhotoDeChat } = await import('../server/photos.js');
  assert.ok(fs.existsSync(fichierPhotoDeChat(uploadsDir, m, msg.id)));
  // C'est Pia qui part : la photo de Quentin, envoyée dans leur discussion, part aussi — la
  // discussion n'existe plus, et rien de ce qu'elle portait ne doit rester.
  assert.equal((await call('9231', '/me', 'DELETE')).status, 200);
  assert.ok(!fs.readdirSync(uploadsDir).some((n) => n.startsWith(`chat-${m}-`)));
});

test("l'interface : appui long vers le menu, citation, photo voilée, et rien d'autre qu'une image", () => {
  const menu = entre('function armerLAppuiLong(', 'async function menuDuMessage(');
  assert.match(menu, /pointerdown/, "l'appui long part d'un appui");
  assert.match(menu, /contextmenu/, 'et le menu du navigateur est remplacé, pas ajouté');
  assert.match(entre('async function menuDuMessage(', 'function preparerLaReponse('), /m\.mine \? \[\{ id: 'supprimer'/, 'seuls ses propres messages se retirent');
  assert.match(entre('function chatBulles(', 'function citation('), /devoilees\.has\(m\.id\)\) classes\.push\('voile'\)/, "la photo de l'autre arrive voilée");
  assert.match(app_js, /accept="image\/\*"[^>]*hidden>/, 'le champ ne propose que des images');
  assert.ok(!/accept="[^"]*(\*\/\*|application|pdf)/.test(app_js), 'aucun fichier autre qu\'une image');
  // La réponse voyage avec l'envoi, et la citation se lit dans le fil.
  assert.match(entre('async function sendMessage(', 'async function envoyerLaPhoto('), /replyTo \? \{ replyTo \} : \{\}/);
  assert.match(app_js, /data-action="citation"/);
  // Le fil apprend les retraits par l'interrogation.
  assert.match(app_js, /data\.supprimes\?\.length\) marquerSupprimes/);
});
