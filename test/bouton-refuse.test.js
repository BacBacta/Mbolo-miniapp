// Quand Telegram refuse le bouton, le message part quand même.
//
// **Ce que ce fichier empêche de revenir.** Le 16 septembre 2026, le bot a cessé de répondre à
// tout le monde. Un bouton `web_app` n'est accepté que si le domaine de la mini app est déclaré
// dans BotFather ; il ne l'était pas, Telegram refusait le bouton — `400: BUTTON_TYPE_INVALID` —
// et **refusait le message entier avec lui**. `/start` répondait le silence, et chaque
// notification mourait pareil.
//
// Le pire n'était pas la panne, c'est qu'elle était invisible : vu de Telegram, le webhook était
// en parfaite santé — aucune erreur de livraison, aucune mise à jour en attente. Seuls les
// journaux de la machine portaient la ligne.
//
// Ces tests utilisent le message d'erreur **réel** de Telegram, pas une approximation.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-bouton-'));
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.WEBAPP_URL = 'https://exemple.test';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.SEED_DEMO = 'false';
process.env.AUTO_APPROVE = 'false';
process.env.ADMIN_CHAT_ID = '-1001234567890';

const { store } = await import('../server/store.js');
const { config } = await import('../server/config.js');
const { bot, setupBot, notify } = await import('../server/bot.js');

// Le refus tel que Telegram l'écrit. grammY pose `description` sur l'erreur.
const refusDeTelegram = () => Object.assign(new Error('Call to \'sendMessage\' failed! (400: Bad Request: BUTTON_TYPE_INVALID)'), {
  description: 'Bad Request: BUTTON_TYPE_INVALID',
});

const envois = [];
let refuserLesBoutons = true;
let autreErreur = null;
bot.api.config.use(async (prev, method, payload) => {
  if (method === 'getChatAdministrators') return { ok: true, result: [{ status: 'administrator', user: { id: 42, is_bot: false, first_name: 'Modo' } }] };
  if (method === 'sendMessage') {
    if (autreErreur) throw autreErreur;
    if (refuserLesBoutons && payload.reply_markup) throw refusDeTelegram();
    envois.push({ chatId: String(payload.chat_id), text: payload.text, avecBouton: !!payload.reply_markup });
    return { ok: true, result: { message_id: envois.length } };
  }
  return { ok: true, result: true };
});
bot.botInfo = { id: 123456, is_bot: true, first_name: 'Test', username: 'test_bot', can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business_account: false, has_main_web_app: false };
await setupBot();

let numero = 0;
const commande = (texte, de = 555001) => bot.handleUpdate({
  update_id: (numero += 1),
  message: {
    message_id: numero, date: 0, text: texte,
    chat: { id: de, type: 'private' },
    from: { id: de, is_bot: false, first_name: 'Awa' },
    entities: [{ type: 'bot_command', offset: 0, length: texte.split(' ')[0].length }],
  },
});
const versLeGroupe = () => envois.filter((e) => e.chatId === String(config.adminChatId));
const vers = (id) => envois.filter((e) => e.chatId === String(id));

test('/start répond quand même, sans le bouton', async () => {
  await commande('/start');
  const recus = vers(555001);
  assert.equal(recus.length, 1, 'le silence est exactement la panne qu\'on corrige');
  assert.equal(recus[0].avecBouton, false, 'le bouton est tombé, le texte est passé');
  assert.match(recus[0].text, /Salut/);
});

test('une notification part aussi, sans son bouton', async () => {
  await store.upsertTelegramUser({ id: '555002', first_name: 'Bea' });
  const r = await notify('555002', 'Écrire', {}, { label: 'Ouvrir {app}', params: { screen: 'matches' } });
  assert.equal(r.sent, true, 'sent: false aurait fait croire à un compte qui a bloqué le bot');
  assert.equal(r.sansBouton, true);
  assert.equal(vers('555002').at(-1).avecBouton, false);
});

test('la modération est prévenue, avec la marche à suivre', async () => {
  const alerte = versLeGroupe().map((e) => e.text).find((x) => /refuse les boutons/i.test(x));
  assert.ok(alerte, 'sans alerte, la panne ne se voit que dans un journal que personne n\'ouvre');
  assert.match(alerte, /BUTTON_TYPE_INVALID/);
  assert.match(alerte, /Configure Mini App/);
  assert.match(alerte, /exemple\.test/, "l'adresse à déclarer doit être dans le message");
});

test('une seule alerte par heure, quel que soit le nombre de refus', async () => {
  const avant = versLeGroupe().filter((e) => /refuse les boutons/i.test(e.text)).length;
  for (let i = 0; i < 5; i++) await commande('/start');
  const apres = versLeGroupe().filter((e) => /refuse les boutons/i.test(e.text)).length;
  assert.equal(apres, avant, 'la panne touche tous les envois : une alerte par message inonderait le groupe');
});

test('une erreur qui n\'est pas le bouton remonte telle quelle', async () => {
  // Un compte qui a bloqué le bot n'est pas un bouton invalide : on ne doit pas réessayer sans
  // bouton, ni prétendre que c'est parti.
  autreErreur = Object.assign(new Error('Forbidden: bot was blocked by the user'), { description: 'Forbidden: bot was blocked by the user' });
  await store.upsertTelegramUser({ id: '555003', first_name: 'Coco' });
  const r = await notify('555003', 'Écrire', {}, { label: 'Ouvrir {app}', params: {} });
  autreErreur = null;
  assert.equal(r.sent, false);
  assert.equal(r.reason, 'TELEGRAM_ERROR');
  assert.match(r.detail, /blocked/);
});

test('quand Telegram accepte les boutons, le bouton est bien là', async () => {
  refuserLesBoutons = false;
  await store.upsertTelegramUser({ id: '555004', first_name: 'Dina' });
  const r = await notify('555004', 'Écrire', {}, { label: 'Ouvrir {app}', params: { screen: 'matches' } });
  assert.equal(r.sent, true);
  assert.equal(r.sansBouton, undefined, 'le repli ne doit pas se déclencher quand rien ne le demande');
  assert.equal(vers('555004').at(-1).avecBouton, true);
});

test.after(() => {});
