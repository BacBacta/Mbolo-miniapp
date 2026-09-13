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
const { bot, startBot, poseWebhook, WEBHOOK_RETRY_DELAYS_MS } = await import('../server/bot.js');

// Telegram n'est jamais appelé : on remplace les méthodes utilisées au démarrage
const appels = { setWebhook: [], getMe: 0 };
let refusRestants = 0;
bot.api.getMe = async () => { appels.getMe += 1; return { username: 'odo_test_bot' }; };
bot.api.setChatMenuButton = async () => ({});
bot.api.setMyCommands = async () => ({});
bot.api.setWebhook = async (url) => {
  appels.setWebhook.push(url);
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
