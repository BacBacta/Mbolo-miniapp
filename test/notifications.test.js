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
const { bot, decideVerification } = await import('../server/bot.js');
const { seedDemo } = await import('../server/seed.js');
const { api } = await import('../server/routes.js');

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

async function makeUser(id, name, gender) {
  await call(id, '/me');
  const r = await call(id, '/me/profile', 'PUT', { name, age: 25, gender, intent: 'amitie', city: 'Douala', promptA: 'Le poisson braisé' });
  assert.equal(r.status, 200);
  store.updateUser(id, { verification: 'approved' });
}

test.after(() => server.close());

test('like, match, messages et présence', async () => {
  await makeUser('5001', 'Aline', 'femme');
  await makeUser('5002', 'Paul', 'homme');

  await call('5001', '/swipes', 'POST', { targetId: '5002', action: 'like' });
  assert.match(to('5002').at(-1).text, /Tu as plu à quelqu'un/);

  const m = await call('5002', '/swipes', 'POST', { targetId: '5001', action: 'like' });
  assert.ok(m.body.match);
  assert.match(to('5001').at(-1).text, /Nouveau match/);
  assert.match(to('5001').at(-1).url, /screen=chat&match=/);
  const matchId = m.body.match.id;

  // Paul lit la discussion : pas de notification
  await call('5002', `/matches/${matchId}`);
  const before = to('5002').length;
  await call('5001', `/matches/${matchId}/messages`, 'POST', { text: 'Salut Paul' });
  assert.equal(to('5002').length, before, 'pas de notification pendant la lecture');

  let sum = await call('5002', '/summary');
  assert.equal(sum.body.unread, 1);

  // Paul ferme l'app : notification immédiate
  await call('5002', '/presence/leave', 'POST');
  await call('5001', `/matches/${matchId}/messages`, 'POST', { text: 'Tu es là ?' });
  assert.match(to('5002').at(-1).text, /Aline t'a écrit : « Tu es là \? »/);

  sum = await call('5002', '/summary');
  assert.equal(sum.body.unread, 2);
  await call('5002', `/matches/${matchId}`);
  sum = await call('5002', '/summary');
  assert.equal(sum.body.unread, 0, 'ouvrir la discussion marque comme lu');
});


test('profil de démo : like pendant l\'absence puis réponse notifiée', async () => {
  await call('6001', '/me');
  await call('6001', '/me/profile', 'PUT', { name: 'Awa', age: 24, gender: 'femme', intent: 'amitie', city: 'Yaoundé', promptA: 'Le marché le samedi' });
  store.updateUser('6001', { verification: 'pending' });
  await decideVerification('6001', true);
  await wait(500);
  assert.ok(to('6001').some((x) => /Tu as plu à quelqu'un/.test(x.text)), 'alerte de like de démo');

  const d = await call('6001', '/discover');
  assert.equal(d.body.profiles[0].likedYou, true, 'le profil qui a liké apparaît en premier');
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
  await call('7001', '/me/profile', 'PUT', { name: 'Eve', age: 22, gender: 'femme', intent: 'duo', city: 'Yaoundé', promptA: 'Karaoké le vendredi' });
  store.updateUser('7001', { verification: 'approved' });
  const d = await call('7001', '/discover');
  const m = await call('7001', '/swipes', 'POST', { targetId: d.body.profiles[0].id, action: 'like' });
  for (let i = 0; i < 6; i++) await call('7001', `/matches/${m.body.match.id}/messages`, 'POST', { text: `Message ${i}` });
  await wait(800);
  const r = await call('7001', `/matches/${m.body.match.id}`);
  assert.equal(r.body.messages.filter((x) => !x.mine).length, 2);
});
