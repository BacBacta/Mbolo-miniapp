// Vérifie les notifications du bot avec un faux Telegram : aucune connexion réseau nécessaire.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-test-'));
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.WEBAPP_URL = 'https://exemple.test';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.SEED_DEMO = 'true';
process.env.AUTO_APPROVE = 'false';
process.env.DEMO_REPLY_DELAY_MS = '300';
process.env.DEMO_LIKE_DELAY_MS = '300';

const express = (await import('express')).default;
const { store } = await import('../server/store.js');
// Les routes désignent les autres par leur identifiant public, jamais par l'identifiant Telegram.
const pid = async (id) => (await store.getUser(id))?.pid;
const { bot, decideVerification } = await import('../server/bot.js');
const { seedDemo } = await import('../server/seed.js');
const { api } = await import('../server/routes.js');
const { DEMO_REPLIES } = await import('../server/seed.js');

const sent = [];
bot.api.sendMessage = async (chatId, text, opts) => { sent.push({ chatId: String(chatId), text, url: opts?.reply_markup?.inline_keyboard?.[0]?.[0]?.web_app?.url }); return {}; };
seedDemo();

const app = express();
app.use(express.json());
app.use('/api', api);
const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api`;
const call = async (user, p, method = 'GET', body) => {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', 'x-dev-user': user }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const to = (id) => sent.filter((m) => m.chatId === id);
// Les notifications partent sans retenir la réponse HTTP : prévenir Telegram ne doit pas faire
// attendre celui qui a cliqué. Un test qui regarde la boîte juste après l'appel peut donc la
// trouver vide ; on attend la notification qu'on cherche, avec un délai de garde.
async function attendue(id, motif) {
  for (let i = 0; i < 200; i += 1) {
    const dernier = to(id).at(-1);
    if (dernier && motif.test(dernier.text)) return dernier;
    await wait(5);
  }
  return to(id).at(-1) || { text: '(aucune notification)', url: '' };
}

async function makeUser(id, name, gender) {
  await call(id, '/me');
  const r = await call(id, '/me/profile', 'PUT', { name, age: 25, gender, intent: 'amitie', city: 'Douala', promptA: 'Le poisson braisé' });
  assert.equal(r.status, 200);
  await store.updateUser(id, { verification: 'approved' });
}

test.after(() => server.close());

test('like, match, messages et présence', async () => {
  await makeUser('5001', 'Aline', 'femme');
  await makeUser('5002', 'Paul', 'homme');

  await call('5001', '/swipes', 'POST', { targetId: await pid('5002'), action: 'like' });
  assert.match((await attendue('5002', /Tu as plu à quelqu'un/)).text, /Tu as plu à quelqu'un/);

  const m = await call('5002', '/swipes', 'POST', { targetId: await pid('5001'), action: 'like' });
  assert.ok(m.body.match);
  const annonce = await attendue('5001', /Nouveau match/);
  assert.match(annonce.text, /Nouveau match/);
  assert.match(annonce.url, /screen=chat&match=/);
  const matchId = m.body.match.id;

  // Paul lit la discussion : pas de notification
  await call('5002', `/matches/${matchId}`);
  const before = to('5002').length;
  await call('5001', `/matches/${matchId}/messages`, 'POST', { text: 'Salut Paul' });
  // Ici on attend l'absence de notification : il faut laisser passer le temps qu'elle mettrait.
  await wait(100);
  assert.equal(to('5002').length, before, 'pas de notification pendant la lecture');

  let sum = await call('5002', '/summary');
  assert.equal(sum.body.unread, 1);

  // Paul ferme l'app : notification immédiate
  await call('5002', '/presence/leave', 'POST');
  await call('5001', `/matches/${matchId}/messages`, 'POST', { text: 'Tu es là ?' });
  assert.match((await attendue('5002', /Tu es là/)).text, /Aline t'a écrit : « Tu es là \? »/);

  sum = await call('5002', '/summary');
  assert.equal(sum.body.unread, 2);
  await call('5002', `/matches/${matchId}`);
  sum = await call('5002', '/summary');
  assert.equal(sum.body.unread, 0, 'ouvrir la discussion marque comme lu');
});


test('profil de démo : like pendant l\'absence puis réponse notifiée', async () => {
  await call('6001', '/me');
  await call('6001', '/me/profile', 'PUT', { name: 'Awa', age: 24, gender: 'femme', intent: 'amitie', city: 'Yaoundé', promptA: 'Le marché le samedi' });
  await store.updateUser('6001', { verification: 'pending' });
  await decideVerification('6001', true);
  await wait(500);
  assert.ok(to('6001').some((x) => /Tu as plu à quelqu'un/.test(x.text)), 'alerte de like de démo');

  const d = await call('6001', '/discover');
  // La notification promet « continue à découvrir : tu le croiseras dans ton paquet ». C'est
  // cette ligne qui la tient : la personne qui a aimé est bien la première carte. L'étiquette,
  // elle, demande un pass — mais la **place** n'en dépend pas, et c'est tout l'équilibre.
  const quiMAAime = (await store.swipesTo('6001')).filter((x) => x.action === 'like').map((x) => x.from);
  assert.equal((await store.userByPid(d.body.profiles[0].id)).id, quiMAAime[0], 'la personne qui a aimé est la première carte');
  assert.equal(d.body.profiles[0].likedYou, false, "sans pass, rien ne dit que cette personne m'a aimé");
  const m = await call('6001', '/swipes', 'POST', { targetId: d.body.profiles[0].id, action: 'like' });
  assert.ok(m.body.match);
  await call('6001', `/matches/${m.body.match.id}/messages`, 'POST', { text: 'Coucou' });
  await wait(600);
  assert.ok(to('6001').some((x) => /t'a écrit/.test(x.text)), 'réponse de démo notifiée');
});

test('bouton de test des notifications', async () => {
  const a = await call('5001', '/me/test-notification', 'POST');
  assert.equal(a.body.sent, true);
  const b = await call('5001', '/me/test-notification', 'POST');
  assert.equal(b.body.sent, false);
  assert.match(b.body.message, /30 secondes/);
});

test('le profil de démo ne répond pas à chaque message envoyé rapidement', async () => {
  await call('7001', '/me');
  await call('7001', '/me/profile', 'PUT', { name: 'Eve', age: 22, gender: 'femme', intent: 'amitie', city: 'Yaoundé', promptA: 'Karaoké le vendredi' });
  await store.updateUser('7001', { verification: 'approved' });
  // Certains profils de démonstration ne rendent jamais les « J'aime » (demoLikeBack: false) :
  // prendre le premier du paquet faisait dépendre ce test de l'ordre de seed.js, qui n'a rien à
  // voir avec ce qu'il mesure. On aime jusqu'à obtenir un match.
  const d = await call('7001', '/discover');
  let match = null;
  for (const profil of d.body.profiles) {
    const r = await call('7001', '/swipes', 'POST', { targetId: profil.id, action: 'like' });
    if (r.body.match) { match = r.body.match; break; }
  }
  assert.ok(match, 'aucun profil de démonstration ne rend les « J\'aime »');
  const m = { body: { match } };
  for (let i = 0; i < 6; i++) await call('7001', `/matches/${m.body.match.id}/messages`, 'POST', { text: `Message ${i}` });
  await wait(800);
  const r = await call('7001', `/matches/${m.body.match.id}`);
  // Six messages envoyés, mais pas plus de réponses que le script de démonstration n'en prévoit
  const reponses = r.body.messages.filter((x) => !x.mine).length;
  assert.equal(reponses, DEMO_REPLIES.length);
  assert.ok(reponses < 6, 'le profil de démo ne répond pas à chaque message');
});
