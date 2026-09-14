// Reprise de la pose du webhook. Un échec passager laissait le bot muet jusqu'au prochain
// redémarrage — or seule l'arrivée d'un message par le webhook réveille une machine arrêtée.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-webhook-'));
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.WEBAPP_URL = 'https://exemple.test';
process.env.USE_WEBHOOK = 'true';
process.env.SEED_DEMO = 'false';

const express = (await import('express')).default;
const { bot, startBot, poseWebhook, WEBHOOK_RETRY_DELAYS_MS, routeWebhook, WEBHOOK_PATH } = await import('../server/bot.js');
const { config } = await import('../server/config.js');

// Telegram n'est jamais appelé : on remplace les méthodes utilisées au démarrage
const appels = { setWebhook: [], getMe: 0 };
let refusRestants = 0;
bot.api.getMe = async () => { appels.getMe += 1; return { username: 'odo_test_bot' }; };
bot.api.setChatMenuButton = async () => ({});
bot.api.setMyCommands = async () => ({});
bot.api.setWebhook = async (url, options) => {
  appels.setWebhook.push(url);
  appels.secret = options?.secret_token;
  if (refusRestants > 0) { refusRestants -= 1; throw new Error('Failed to resolve host: No address associated with hostname'); }
  return true;
};

const rapide = { delais: [1, 1, 1] };

test('les délais de reprise sont croissants et couvrent plusieurs minutes', () => {
  const total = WEBHOOK_RETRY_DELAYS_MS.reduce((a, b) => a + b, 0);
  assert.ok(WEBHOOK_RETRY_DELAYS_MS.every((d, i, t) => i === 0 || d > t[i - 1]), 'délais croissants');
  assert.ok(total >= 5 * 60e3, `la fenêtre de reprise doit dépasser 5 min, ici ${Math.round(total / 60e3)} min`);
});

test('une pose qui réussit du premier coup n\'attend pas', async () => {
  appels.setWebhook.length = 0; refusRestants = 0;
  assert.equal(await poseWebhook('https://exemple.test/telegram/x', rapide), true);
  assert.deepEqual(appels.setWebhook, ['https://exemple.test/telegram/x']);
});

test('un refus passager est rattrapé', async () => {
  appels.setWebhook.length = 0; refusRestants = 2;
  assert.equal(await poseWebhook('https://exemple.test/telegram/x', rapide), true);
  assert.equal(appels.setWebhook.length, 3, 'deux refus puis une réussite');
});

test('un refus persistant rend la main sans jeter', async () => {
  appels.setWebhook.length = 0; refusRestants = Infinity;
  assert.equal(await poseWebhook('https://exemple.test/telegram/x', rapide), false);
  assert.equal(appels.setWebhook.length, rapide.delais.length + 1, 'une tentative de plus que de délais');
  refusRestants = 0;
});

test('startBot ne jette pas quand Telegram refuse, et la route reste montée', async () => {
  appels.setWebhook.length = 0;
  refusRestants = Infinity;
  const app = express();
  await startBot(app, { delais: [1] }); // ne doit pas rejeter : la reprise continue en arrière-plan
  refusRestants = 0;

  // La route est montée malgré le refus : dès que Telegram accepte l'adresse, les messages arrivent.
  // On regarde la pile du routeur plutôt que d'envoyer une requête : grammY attendrait le
  // traitement d'une mise à jour par un bot que ce test n'initialise pas.
  const chemin = new URL(appels.setWebhook[0]).pathname;
  const montee = app._router.stack.some((c) => c.regexp?.test(chemin));
  assert.ok(montee, `la route ${chemin} doit être montée`);
  assert.ok(appels.setWebhook[0].startsWith('https://exemple.test/telegram/'), 'adresse construite depuis WEBAPP_URL');
});

// En mode webhook, grammY relance l'erreur d'un gestionnaire au lieu de la passer à bot.catch,
// et Express 4 ignore la promesse rejetée : un ctx.reply refusé par Telegram arrêtait le
// processus (audit/09-revue-code.md, C5). Ici un gestionnaire jette exprès, et le serveur doit
// répondre 200 — sinon Telegram renvoie la même mise à jour jusqu'à ce qu'on l'accepte.
test("un gestionnaire du bot qui jette ne couche pas le serveur, et Telegram reçoit 200", async () => {
  bot.botInfo = { id: 123456, is_bot: true, first_name: 'T', username: 'odo_test_bot', can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false };
  bot.command('boum', async () => { throw new Error('Telegram a refusé la réponse'); });
  bot.catch((e) => { throw e; }); // bot.catch ne doit même pas être nécessaire ici
  const { webhookCallback } = await import('grammy');
  const app = express();
  app.use(express.json());
  app.use('/hook', routeWebhook(webhookCallback));
  const server = app.listen(0);
  const rejets = [];
  const ecoute = (r) => rejets.push(r);
  process.on('unhandledRejection', ecoute);
  const journal = [];
  const vrai = console.error;
  console.error = (...m) => journal.push(m.join(' '));
  try {
    const update = { update_id: 1, message: { message_id: 1, date: 1, chat: { id: 7, type: 'private' }, from: { id: 7, is_bot: false, first_name: 'X' }, text: '/boum', entities: [{ type: 'bot_command', offset: 0, length: 5 }] } };
    const r = await fetch(`http://localhost:${server.address().port}/hook`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': config.webhookSecret }, body: JSON.stringify(update) });
    assert.equal(r.status, 200);
    await new Promise((res) => setTimeout(res, 50));
    assert.equal(rejets.length, 0, 'aucune promesse orpheline');
    assert.ok(journal.some((l) => /Erreur du bot.*refusé/.test(l)), `l'erreur doit être journalisée : ${journal.join(' | ')}`);
  } finally {
    console.error = vrai;
    process.off('unhandledRejection', ecoute);
    server.close();
  }
});

// Le chemin ne prouve rien : il voyage dans les journaux, et il portait ADMIN_KEY. C'est l'en-tête
// X-Telegram-Bot-Api-Secret-Token, posé par setWebhook et renvoyé par Telegram à chaque appel, qui
// authentifie. Sans lui, une mise à jour forgée validait un selfie (audit/09-revue-code.md, C4).
test("un appel du webhook sans le secret de l'en-tête est refusé, et jamais traité", async () => {
  assert.ok(config.webhookSecret.length >= 32, 'un secret existe toujours, posé ou tiré au hasard');
  assert.equal(WEBHOOK_PATH, '/telegram/webhook', 'le chemin ne porte plus de secret : ni ADMIN_KEY, ni l\'identifiant du bot');
  appels.setWebhook.length = 0; refusRestants = 0;
  await poseWebhook('https://exemple.test/telegram/webhook', rapide);
  assert.equal(appels.secret, config.webhookSecret, 'setWebhook pose le même secret que celui que la route exige');

  let traites = 0;
  bot.command('compte', async () => { traites += 1; });
  const { webhookCallback } = await import('grammy');
  const app = express();
  app.use(express.json());
  app.use('/hook', routeWebhook(webhookCallback));
  const server = app.listen(0);
  try {
    const update = { update_id: 2, message: { message_id: 2, date: 1, chat: { id: 7, type: 'private' }, from: { id: 7, is_bot: false, first_name: 'X' }, text: '/compte', entities: [{ type: 'bot_command', offset: 0, length: 7 }] } };
    const envoyer = (headers) => fetch(`http://localhost:${server.address().port}/hook`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(update) });
    assert.equal((await envoyer({})).status, 401, 'sans en-tête');
    assert.equal((await envoyer({ 'X-Telegram-Bot-Api-Secret-Token': 'faux' })).status, 401, 'mauvais secret');
    await new Promise((res) => setTimeout(res, 30));
    assert.equal(traites, 0, 'rien n\'a été traité');
    assert.equal((await envoyer({ 'X-Telegram-Bot-Api-Secret-Token': config.webhookSecret })).status, 200, 'bon secret');
    await new Promise((res) => setTimeout(res, 30));
    assert.equal(traites, 1);
  } finally {
    server.close();
  }
});
