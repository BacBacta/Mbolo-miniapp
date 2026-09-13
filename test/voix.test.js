// La présentation vocale (P1-3) : quinze secondes, enregistrées dans Telegram, écoutées par la
// modération avant que quiconque les entende.
//
// Le point que ces tests doivent tenir : **la voix échappe à antiscam.js**, qui ne lit que du
// texte. Rien n'empêche quelqu'un de dire son numéro à haute voix. La seule barrière est humaine,
// donc rien ne doit pouvoir être entendu sans être passé par la modération — et une modération
// injoignable ne doit pas laisser derrière elle une présentation en attente que personne ne
// tranchera jamais.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mbolo-voix-'));
process.env.DATA_DIR = DATA_DIR;
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.WEBAPP_URL = 'https://exemple.test';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.SEED_DEMO = 'false';
process.env.AUTO_APPROVE = 'false';
process.env.ADMIN_CHAT_ID = '-100999';

const express = (await import('express')).default;
const { config, runtime } = await import('../server/config.js');
const { store } = await import('../server/store.js');
const { bot, setupBot } = await import('../server/bot.js');
const { api } = await import('../server/routes.js');
const { refusDuree, fichierVoix, DUREE_MAX_S, DUREE_MIN_S } = await import('../server/voix.js');
const { reinitialiser } = await import('../server/limites.js');

// Le téléchargement du fichier passe par api.telegram.org : on l'intercepte, et on laisse
// passer tout le reste — les appels du test à sa propre API en dépendent.
const vraiFetch = globalThis.fetch;
let telechargementOk = true;
globalThis.fetch = async (url, opts) => {
  if (String(url).includes('api.telegram.org/file/')) {
    // L'adresse porte le jeton du bot. Un test qui la laisserait filer dans un journal serait
    // le premier endroit où le chercher.
    assert.ok(!String(url).includes('\n'), 'adresse de téléchargement malformée');
    return telechargementOk
      ? { ok: true, arrayBuffer: async () => new TextEncoder().encode('OGG-FICTIF').buffer }
      : { ok: false, status: 502 };
  }
  return vraiFetch(url, opts);
};

const envoyes = [];
let modérationJoignable = true;
bot.api.config.use(async (prev, method, payload) => {
  if (method === 'getFile') return { ok: true, result: { file_id: payload.file_id, file_path: 'voice/file_1.oga' } };
  if (method === 'sendVoice') {
    if (!modérationJoignable) throw new Error('Bad Request: chat not found');
    envoyes.push({ methode: 'sendVoice', a: String(payload.chat_id), legende: payload.caption });
    return { ok: true, result: { message_id: envoyes.length } };
  }
  if (method === 'sendMessage') {
    envoyes.push({ methode: 'sendMessage', a: String(payload.chat_id), texte: payload.text });
    return { ok: true, result: { message_id: envoyes.length } };
  }
  return { ok: true, result: true };
});
bot.botInfo = { id: 1, is_bot: true, first_name: 'T', username: 'mbolo_bot', can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false };
runtime.botUsername = 'mbolo_bot';
await setupBot();

const app = express();
app.use(express.json());
app.use('/api', api);
const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api`;
test.after(() => { server.close(); globalThis.fetch = vraiFetch; });

const call = async (user, p, method = 'GET', body) => {
  const r = await vraiFetch(base + p, { method, headers: { 'Content-Type': 'application/json', 'x-dev-user': user }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
async function membre(id, name = 'Aline') {
  await call(id, '/me');
  await call(id, '/me/profile', 'PUT', { name, age: 25, gender: 'femme', intent: 'amitie', city: 'Yaoundé', promptA: 'Le poisson braisé' });
  await store.updateUser(id, { verification: 'approved' });
}

let numero = 0;
const envoyerVocal = (de, duration = 10) => bot.handleUpdate({
  update_id: (numero += 1),
  message: {
    message_id: numero, date: 0,
    chat: { id: Number(de), type: 'private' },
    from: { id: Number(de), is_bot: false, first_name: 'Aline' },
    voice: { file_id: `AA${numero}`, file_unique_id: `U${numero}`, duration, mime_type: 'audio/ogg' },
  },
});
const toucher = (data) => bot.handleUpdate({
  update_id: (numero += 1),
  callback_query: {
    id: String(numero), from: { id: 42, is_bot: false, first_name: 'Modo' }, chat_instance: '1', data,
    message: { message_id: numero, date: 0, chat: { id: Number(config.adminChatId), type: 'supergroup' } },
  },
});
const commande = (texte, de) => bot.handleUpdate({
  update_id: (numero += 1),
  message: { message_id: numero, date: 0, chat: { id: Number(de), type: 'private' }, from: { id: Number(de), is_bot: false, first_name: 'Aline' }, text: texte, entities: [{ offset: 0, length: texte.length, type: 'bot_command' }] },
});
const recus = (id) => envoyes.filter((m) => m.a === String(id) && m.methode === 'sendMessage');
const fichier = (id) => path.join(DATA_DIR, 'uploads', fichierVoix(id));

// ---------- La durée, sans rien allumer ----------

test('quinze secondes au plus, deux au moins', () => {
  assert.equal(refusDuree(10), null, 'une présentation normale passe');
  assert.equal(refusDuree(DUREE_MAX_S), null, 'la limite exacte passe');
  assert.equal(refusDuree(DUREE_MIN_S), null);

  const trop = refusDuree(DUREE_MAX_S + 1);
  assert.match(trop.cle, /Réenregistre plus court/, 'et dit quoi faire, pas seulement que c\'est non');
  assert.equal(trop.vars.max, DUREE_MAX_S, 'en donnant la limite, pas un nombre magique');

  assert.match(refusDuree(1).cle, /trop court/);
  assert.ok(refusDuree(undefined), 'un message sans durée lisible est refusé');
  assert.ok(refusDuree(0), 'et une durée nulle aussi');
});

// ---------- Le parcours complet ----------

test('un vocal reçu attend la modération, et personne ne peut l\'entendre avant', async () => {
  reinitialiser();
  await membre('8001');
  await envoyerVocal('8001', 12);

  const u = await store.getUser('8001');
  assert.equal(u.voix.status, 'pending', 'en attente, jamais validé tout seul');
  assert.equal(u.voix.duree, 12);
  assert.ok(fs.existsSync(fichier('8001')), 'le son est bien sur le disque');

  const versModeration = envoyes.filter((m) => m.methode === 'sendVoice' && m.a === String(config.adminChatId));
  assert.equal(versModeration.length, 1, 'et il est parti à la modération');
  assert.match(versModeration[0].legende, /Écoute-la/, 'la légende doit dire qu\'il faut écouter : aucune règle ne lit la voix');

  // Ce que la personne voit pour elle-même.
  const moi = (await call('8001', '/me')).body;
  assert.equal(moi.voix.status, 'pending');
});

test('validée, elle devient écoutable ; refusée, elle est supprimée du disque', async () => {
  reinitialiser();
  await membre('8002');
  await envoyerVocal('8002', 8);
  await toucher('voix:approve:8002');
  assert.equal((await store.getUser('8002')).voix.status, 'approved');
  assert.match(recus('8002').at(-1).texte, /validée/);

  reinitialiser();
  await membre('8003');
  await envoyerVocal('8003', 8);
  assert.ok(fs.existsSync(fichier('8003')));
  await toucher('voix:reject:8003');
  assert.ok(!(await store.getUser('8003')).voix, 'plus rien en base');
  assert.ok(!fs.existsSync(fichier('8003')), 'ni sur le disque : on ne garde pas ce qu\'on ne fera pas entendre');
  assert.match(recus('8003').at(-1).texte, /refusée/);
});

// Le même raisonnement que pour le selfie : une présentation « en attente » que personne ne peut
// trancher laisserait quelqu'un attendre une décision qui ne viendra jamais.
test('si la modération est injoignable, l\'envoi est défait', async () => {
  reinitialiser();
  await membre('8004');
  modérationJoignable = false;
  await envoyerVocal('8004', 9);
  modérationJoignable = true;

  assert.ok(!(await store.getUser('8004')).voix, 'rien ne reste en attente');
  assert.match(recus('8004').at(-1).texte, /réessaie plus tard/i, 'et la personne sait qu\'elle doit réessayer');
});

test('un son qui n\'arrive pas ne laisse ni fichier ni ligne', async () => {
  reinitialiser();
  await membre('8005');
  telechargementOk = false;
  await envoyerVocal('8005', 9);
  telechargementOk = true;

  assert.ok(!(await store.getUser('8005')).voix);
  assert.ok(!fs.existsSync(fichier('8005')));
  assert.match(recus('8005').at(-1).texte, /Réessaie/i);
});

test('un vocal trop long est refusé avant tout téléchargement', async () => {
  reinitialiser();
  await membre('8006');
  await envoyerVocal('8006', DUREE_MAX_S + 20);

  assert.ok(!(await store.getUser('8006')).voix);
  assert.ok(!fs.existsSync(fichier('8006')), 'rien ne doit toucher le disque');
  assert.match(recus('8006').at(-1).texte, /secondes/);
});

test('sans profil, on est renvoyé vers l\'app au lieu d\'enregistrer', async () => {
  reinitialiser();
  await call('8007', '/me'); // le compte existe, le profil non
  await envoyerVocal('8007', 9);
  assert.ok(!(await store.getUser('8007')).voix);
  assert.match(recus('8007').at(-1).texte, /profil/);
});

// ---------- La retirer, des deux côtés ----------

test('la présentation se retire depuis le bot comme depuis l\'app', async () => {
  reinitialiser();
  await membre('8008');
  await envoyerVocal('8008', 9);
  await toucher('voix:approve:8008');
  await commande('/sansvoix', '8008');
  assert.ok(!(await store.getUser('8008')).voix);
  assert.ok(!fs.existsSync(fichier('8008')));

  reinitialiser();
  await membre('8009');
  await envoyerVocal('8009', 9);
  await toucher('voix:approve:8009');
  assert.equal((await call('8009', '/me/voix', 'DELETE')).status, 200);
  assert.ok(!(await store.getUser('8009')).voix);
  assert.ok(!fs.existsSync(fichier('8009')), 'le fichier part avec');
});

// Règle 5.4 : toute donnée personnelle disparaît avec DELETE /api/me. La voix n'est pas un .jpg,
// et l'effacement des fichiers ne regardait que les .jpg : sans ligne dédiée, elle survivait.
test('supprimer son compte emporte la présentation vocale', async () => {
  reinitialiser();
  await membre('8010');
  await envoyerVocal('8010', 9);
  await toucher('voix:approve:8010');
  assert.ok(fs.existsSync(fichier('8010')));

  assert.equal((await call('8010', '/me', 'DELETE')).status, 200);
  assert.ok(!fs.existsSync(fichier('8010')), 'le son doit partir avec le compte');
});

test('on ne peut pas envoyer des présentations en boucle', async () => {
  reinitialiser();
  await membre('8011');
  for (let i = 0; i < 8; i += 1) await envoyerVocal('8011', 9);
  assert.match(recus('8011').at(-1).texte, /Trop de présentations/);
});

// La décision appartient au groupe de modération, pas à qui connaît la forme du bouton.
test('un clic venu d\'ailleurs que du groupe ne décide rien', async () => {
  reinitialiser();
  await membre('8012');
  await envoyerVocal('8012', 9);
  await bot.handleUpdate({
    update_id: (numero += 1),
    callback_query: {
      id: String(numero), from: { id: 777, is_bot: false, first_name: 'Curieux' }, chat_instance: '1', data: 'voix:approve:8012',
      message: { message_id: numero, date: 0, chat: { id: 777, type: 'private' } },
    },
  });
  assert.equal((await store.getUser('8012')).voix.status, 'pending', 'toujours en attente');
});
