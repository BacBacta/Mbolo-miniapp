// Que se passe-t-il quand la modération est configurée mais injoignable.
//
// Tant qu'AUTO_APPROVE validait tout le monde, ce chemin ne servait jamais. Il est devenu le seul
// passage vers l'inscription : un bot absent du groupe, ou un identifiant mal recopié, fermerait
// l'app à tout le monde. Avant, la seule trace était un console.warn et la personne attendait sept
// jours une décision que personne ne pouvait prendre. Ce fichier fige le contraire.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-moderation-'));
process.env.DATA_DIR = DATA_DIR;
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.WEBAPP_URL = 'https://exemple.test';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.SEED_DEMO = 'false';
process.env.AUTO_APPROVE = 'false';
process.env.ADMIN_CHAT_ID = '-1001234567890';

const express = (await import('express')).default;
const { config } = await import('../server/config.js');
const { store } = await import('../server/store.js');
const { bot, startBot, verifierGroupeModeration } = await import('../server/bot.js');
const { api } = await import('../server/routes.js');

bot.api.sendMessage = async () => ({});
// Par défaut la modération répond ; chaque test qui veut une panne la provoque lui-même.
let envoiPhoto = async () => ({});
bot.api.sendPhoto = (...args) => envoiPhoto(...args);

const app = express();
app.use(express.json({ limit: '3mb' }));
app.use('/api', api);
const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api`;
const call = async (user, p, method = 'GET', body) => {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', 'x-dev-user': user }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
const selfieDe = (id) => path.join(DATA_DIR, 'uploads', `${id}-selfie.jpg`);

async function creer(id, name) {
  await call(id, '/me');
  await call(id, '/me/profile', 'PUT', { name, age: 25, gender: 'femme', intent: 'amitie', city: 'Yaoundé', promptA: 'Le poisson braisé' });
}
// Demande un geste puis envoie le selfie, comme le fait l'interface.
async function envoyerSelfie(id) {
  await call(id, '/me/verification/start', 'POST');
  return call(id, '/me/verification', 'POST', { selfie: JPEG });
}

test.after(() => server.close());

test('un selfie que la modération ne reçoit pas ne laisse personne en attente', async () => {
  await creer('9101', 'Awa');
  envoiPhoto = async () => { throw Object.assign(new Error('Forbidden'), { description: 'Bad Request: chat not found' }); };

  const r = await envoyerSelfie('9101');
  assert.equal(r.status, 503, 'la personne apprend que ça n\'a pas marché');
  assert.equal(r.body.code, 'SELFIE_NOT_SENT');
  // Le message dit quoi faire, pas seulement ce qui s'est passé (règle 11)
  assert.match(r.body.message, /[Rr]éessaie/);

  const u = await store.getUser('9101');
  assert.equal(u.verification, 'none', 'le compte revient à son état d\'avant, pas « en attente »');
  assert.equal(u.pendingGesture, null, 'le geste est rendu, un nouveau sera tiré');
  assert.ok(!fs.existsSync(selfieDe('9101')), 'le selfie ne traîne pas sur le disque');
});

test('et la personne peut recommencer tout de suite', async () => {
  envoiPhoto = async () => ({});
  const r = await envoyerSelfie('9101');
  assert.equal(r.status, 200);
  assert.equal(r.body.verification, 'pending');
  assert.equal((await store.getUser('9101')).verification, 'pending');
});

test('une photo que la modération ne reçoit pas ne reste pas en attente pour toujours', async () => {
  await creer('9102', 'Bana');
  envoiPhoto = async () => { throw new Error('Bad Request: chat not found'); };

  const r = await call('9102', '/me/photos/1', 'PUT', { photo: JPEG });
  assert.equal(r.status, 503);
  assert.equal(r.body.code, 'PHOTO_NOT_SENT');
  assert.deepEqual(r.body.photos ?? [], [], 'l\'emplacement est rendu');
  assert.deepEqual((await call('9102', '/me')).body.photos, [], 'et il l\'est aussi à la relecture');
});

test('quand la modération répond, rien ne change pour la photo', async () => {
  envoiPhoto = async () => ({});
  const r = await call('9102', '/me/photos/1', 'PUT', { photo: JPEG });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.photos, [{ n: 1, status: 'pending' }]);
});

// Sans ADMIN_CHAT_ID, on est sur un poste de développement : l'attente est normale, pas une panne.
test('sans modération configurée, le selfie reste en attente sans erreur', async () => {
  const vrai = config.adminChatId;
  config.adminChatId = '';
  try {
    await creer('9103', 'Carine');
    const r = await envoyerSelfie('9103');
    assert.equal(r.status, 200);
    assert.equal((await store.getUser('9103')).verification, 'pending');
  } finally {
    config.adminChatId = vrai;
  }
});

// Le contrôle au démarrage : c'est lui qui fait qu'un groupe mal configuré se voit au déploiement.
test('le groupe de modération est vérifié au démarrage', async () => {
  const vrai = bot.api.getChat;
  try {
    bot.api.getChat = async (id) => {
      assert.equal(String(id), config.adminChatId, 'c\'est bien le groupe configuré qui est interrogé');
      return { id, title: 'Modération Mbolo' };
    };
    assert.deepEqual(await verifierGroupeModeration(), { ok: true, titre: 'Modération Mbolo' });

    bot.api.getChat = async () => { throw Object.assign(new Error('x'), { description: 'Bad Request: chat not found' }); };
    const ko = await verifierGroupeModeration();
    assert.equal(ko.ok, false);
    assert.equal(ko.raison, 'INJOIGNABLE');
    assert.match(ko.detail, /chat not found/);
  } finally {
    bot.api.getChat = vrai;
  }
});

// Le contrôle ne sert à rien s'il n'est pas branché : sans ce test, on pouvait retirer l'appel
// de startBot sans qu'aucun autre test ne bronche.
test('le démarrage du bot interroge bien le groupe, sans s\'arrêter s\'il est injoignable', async () => {
  const vrais = { getChat: bot.api.getChat, getMe: bot.api.getMe, menu: bot.api.setChatMenuButton, cmd: bot.api.setMyCommands, hook: bot.api.deleteWebhook, start: bot.start };
  let interroge = 0;
  try {
    bot.api.getMe = async () => ({ username: 'mbolo_test_bot' });
    bot.api.setChatMenuButton = async () => ({});
    bot.api.setMyCommands = async () => ({});
    bot.api.deleteWebhook = async () => ({});
    bot.start = () => {};
    bot.api.getChat = async () => { interroge += 1; throw Object.assign(new Error('x'), { description: 'Bad Request: chat not found' }); };

    await startBot(express());
    assert.equal(interroge, 1, 'le groupe est interrogé une fois au démarrage');
  } finally {
    Object.assign(bot.api, { getChat: vrais.getChat, getMe: vrais.getMe, setChatMenuButton: vrais.menu, setMyCommands: vrais.cmd, deleteWebhook: vrais.hook });
    bot.start = vrais.start;
  }
});

test('sans ADMIN_CHAT_ID, le contrôle de démarrage ne reproche rien', async () => {
  const vrai = config.adminChatId;
  config.adminChatId = '';
  try {
    assert.deepEqual(await verifierGroupeModeration(), { ok: false, raison: 'NON_CONFIGURE' });
  } finally {
    config.adminChatId = vrai;
  }
});
