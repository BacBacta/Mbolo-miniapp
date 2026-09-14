// Brèches fermées par l'audit du parcours : blocage et rendez-vous, filtre sur tous les champs
// libres, déblocage des contacts, geste de vérification, horodatage d'arrivée.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-securite-'));
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.WEBAPP_URL = 'https://exemple.test';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.SEED_DEMO = 'false';
process.env.AUTO_APPROVE = 'false';

const express = (await import('express')).default;
const { store } = await import('../server/store.js');
// Les routes désignent les autres par leur identifiant public, jamais par l'identifiant Telegram.
const pid = async (id) => (await store.getUser(id))?.pid;
const { bot } = await import('../server/bot.js');
const { api } = await import('../server/routes.js');
const { venues, VENUES_DEMO } = await import('../server/config.js');
const { codeDuLieu } = await import('../server/lieux.js');
// La liste des lieux est vide par défaut : aucun n'entre en production sans partenariat signé.
// Un test qui éprouve le rendez-vous dit donc de quels lieux il a besoin.
venues.push(...VENUES_DEMO);

bot.api.sendMessage = async () => ({});
bot.api.sendPhoto = async () => ({});

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

test('un compte bloqué ne peut plus déclencher de notification d\'arrivée', async () => {
  await creer('8201', 'Awa', 'femme');
  await creer('8202', 'Éric', 'homme');
  const matchId = await matcher('8201', '8202');
  const lieu = venues.find((v) => v.city === 'Yaoundé');
  const d = await call('8202', `/matches/${matchId}/dates`, 'POST', { venueId: lieu.id, slot: 'samedi 15h' });
  assert.equal(d.status, 200);

  // Awa signale Éric, ce qui le bloque
  const s = await call('8201', '/reports', 'POST', { targetId: await pid('8202'), reason: 'argent' });
  assert.equal(s.status, 200);

  const c = await call('8202', `/dates/${d.body.date.id}/checkin`, 'POST', { code: codeDuLieu(lieu.id) });
  assert.equal(c.status, 403, 'le check-in est refusé après un blocage');
  assert.equal(c.body.code, 'BLOCKED');
});

test('la question du profil passe par le filtre anti-arnaque', async () => {
  await call('8203', '/me');
  const r = await call('8203', '/me/profile', 'PUT', {
    name: 'Léa', age: 24, gender: 'femme', intent: 'amitie', city: 'Yaoundé',
    promptQ: 'Envoie-moi 5000 par MoMo', promptA: 'Le ndolé',
  });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, 'PROFILE_CONTACT');
});

test('le déblocage des contacts exige un échange, pas un monologue', async () => {
  await creer('8204', 'Bertrand', 'homme');
  await creer('8205', 'Chantal', 'femme');
  const matchId = await matcher('8204', '8205');
  // Bertrand envoie seul douze messages : le seuil de déblocage ne doit pas tomber
  for (let i = 0; i < 12; i++) {
    const r = await call('8204', `/matches/${matchId}/messages`, 'POST', { text: `Message numéro ${i} pour toi` });
    assert.equal(r.status, 200);
  }
  const bloque = await call('8204', `/matches/${matchId}/messages`, 'POST', { text: 'Rejoins-moi sur WhatsApp' });
  assert.equal(bloque.status, 422, 'un monologue ne débloque pas les contacts');
  assert.equal(bloque.body.code, 'CONTACT_TOO_EARLY');

  // Chantal répond douze fois : l'échange existe, le déblocage s'applique
  for (let i = 0; i < 12; i++) await call('8205', `/matches/${matchId}/messages`, 'POST', { text: `Réponse numéro ${i}` });
  const ok = await call('8204', `/matches/${matchId}/messages`, 'POST', { text: 'Rejoins-moi sur WhatsApp' });
  assert.equal(ok.status, 200, 'après un vrai échange, le contact passe');
});

test('le créneau de rendez-vous est filtré comme un message', async () => {
  await creer('8206', 'Diane', 'femme');
  await creer('8207', 'Franck', 'homme');
  const matchId = await matcher('8206', '8207');
  const lieu = venues.find((v) => v.city === 'Yaoundé');
  const r = await call('8206', `/matches/${matchId}/dates`, 'POST', { venueId: lieu.id, slot: 'appelle 677889900' });
  assert.equal(r.status, 422, 'un numéro glissé dans le créneau est refusé');
});

test('l\'heure d\'arrivée de l\'autre personne n\'est jamais renvoyée', async () => {
  await creer('8208', 'Grâce', 'femme');
  await creer('8209', 'Hervé', 'homme');
  const matchId = await matcher('8208', '8209');
  const lieu = venues.find((v) => v.city === 'Yaoundé');
  const d = await call('8208', `/matches/${matchId}/dates`, 'POST', { venueId: lieu.id, slot: 'dimanche 16h' });
  // Depuis P0-4, le check-in exige un rendez-vous accepté : Hervé accepte celui que Grâce propose
  assert.equal((await call('8209', `/dates/${d.body.date.id}`, 'PUT', { status: 'accepted' })).status, 200);
  await call('8209', `/dates/${d.body.date.id}/checkin`, 'POST', { code: codeDuLieu(lieu.id) });

  const vu = await call('8208', `/matches/${matchId}`);
  const rdv = vu.body.dates[0];
  assert.equal(rdv.arrivals, undefined, 'aucun horodatage brut ne sort du serveur');
  assert.equal(rdv.arrivedOther, true, 'on sait seulement que la personne est arrivée');
  assert.equal(rdv.arrivedMe, false);
});

test('le geste de vérification expire et ne sert qu\'une fois', async () => {
  await call('8210', '/me');
  await call('8210', '/me/profile', 'PUT', { name: 'Ida', age: 23, gender: 'femme', intent: 'amitie', city: 'Yaoundé', promptA: 'Le ndolé' });
  const g = await call('8210', '/me/verification/start', 'POST');
  assert.equal(g.status, 200);
  assert.ok(g.body.gesture);

  // Geste demandé il y a onze minutes : périmé
  await store.updateUser('8210', { pendingGestureAt: Date.now() - 11 * 60 * 1000 });
  const jpeg = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
  const perime = await call('8210', '/me/verification', 'POST', { selfie: jpeg });
  assert.equal(perime.status, 400);
  assert.equal(perime.body.code, 'GESTURE_EXPIRED');
  assert.equal((await store.getUser('8210')).pendingGesture, null, 'le geste périmé est effacé');
});

test('un compte vérifié ne peut pas se rétrograder', async () => {
  await creer('8211', 'Joseph', 'homme');
  const r = await call('8211', '/me/verification/start', 'POST');
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'ALREADY_VERIFIED');
  assert.equal((await store.getUser('8211')).verification, 'approved', 'le badge est conservé');
});

test('défaire un match fait disparaître la discussion des deux côtés', async () => {
  await creer('8301', 'Karine', 'femme');
  await creer('8302', 'Landry', 'homme');
  const matchId = await matcher('8301', '8302');
  await call('8301', `/matches/${matchId}/messages`, 'POST', { text: 'Bonjour, ça va ?' });

  const r = await call('8302', `/matches/${matchId}`, 'DELETE');
  assert.equal(r.status, 200);
  assert.equal((await call('8302', '/matches')).body.matches.length, 0, 'la discussion a disparu chez celui qui retire');
  assert.equal((await call('8301', '/matches')).body.matches.length, 0, "et chez l'autre aussi");
  assert.equal((await call('8301', `/matches/${matchId}`)).status, 404, 'la discussion n\'est plus atteignable');
});

test('on peut bloquer sans accuser, et le blocage ferme la discussion', async () => {
  await creer('8303', 'Mireille', 'femme');
  await creer('8304', 'Norbert', 'homme');
  const matchId = await matcher('8303', '8304');

  const avant = (await store.allUsers()).length;
  const r = await call('8303', '/blocks', 'POST', { targetId: await pid('8304') });
  assert.equal(r.status, 200);
  assert.equal(await store.isBlocked('8303', '8304'), true);
  assert.equal((await call('8304', `/matches/${matchId}/messages`, 'POST', { text: 'Tu es là ?' })).status, 404, 'plus aucun message ne passe');
  assert.equal((await store.allUsers()).length, avant, 'personne n\'est supprimé');
  // Aucun signalement n'est créé : bloquer n'est pas accuser
  assert.equal((await call('8303', '/matches')).body.matches.length, 0);
});

test('un match d\'un autre ne peut pas être retiré', async () => {
  await creer('8305', 'Odile', 'femme');
  await creer('8306', 'Pascal', 'homme');
  await creer('8307', 'Quentin', 'homme');
  const matchId = await matcher('8305', '8306');
  assert.equal((await call('8307', `/matches/${matchId}`, 'DELETE')).status, 404);
  assert.ok(await store.getMatch(matchId), 'le match est intact');
});

test('un selfie que personne n\'a tranché est purgé, et le compte peut recommencer', async () => {
  await call('8401', '/me');
  await call('8401', '/me/profile', 'PUT', { name: 'Rosine', age: 27, gender: 'femme', intent: 'amitie', city: 'Yaoundé', promptA: 'Le poisson braisé' });
  await call('8401', '/me/verification/start', 'POST');
  const jpeg = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
  await call('8401', '/me/verification', 'POST', { selfie: jpeg });
  assert.equal((await store.getUser('8401')).verification, 'pending');

  const fichier = path.join(process.env.DATA_DIR, 'uploads', '8401-selfie.jpg');
  assert.ok(fs.existsSync(fichier), 'le selfie est bien sur le disque');

  // Rien ne se passe tant que le délai n'est pas dépassé
  assert.equal((await store.purgerVerificationsOubliees(7 * 86400 * 1000)).length, 0);
  assert.ok(fs.existsSync(fichier), 'le selfie est conservé pendant le délai');

  // Une fois le délai dépassé, il disparaît et le compte repart de zéro
  await store.updateUser('8401', { verificationSentAt: Date.now() - 8 * 86400 * 1000 });
  assert.equal((await store.purgerVerificationsOubliees(7 * 86400 * 1000)).length, 1);
  assert.equal(fs.existsSync(fichier), false, 'le selfie est supprimé');
  const u = await store.getUser('8401');
  assert.equal(u.verification, 'none', 'la personne peut recommencer');
  assert.equal(u.pendingGesture, null);
});
