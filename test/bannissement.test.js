// Bannir quelqu'un, et que ça tienne.
//
// Les conditions d'utilisation promettent deux choses : qu'un compte peut être fermé sans préavis
// en cas de danger, et qu'un compte fermé pour arnaque ne peut pas être recréé. La seconde est ce
// qui interdit de tout effacer : il faut garder de quoi reconnaître la personne.
//
// Un bannissement qui laisse une porte ouverte ne sert à rien. Ces tests essaient les portes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-ban-'));
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.WEBAPP_URL = 'https://exemple.test';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.SEED_DEMO = 'false';
process.env.AUTO_APPROVE = 'false';
process.env.ADMIN_CHAT_ID = '-1001234567890';

const express = (await import('express')).default;
const { store } = await import('../server/store.js');
// Les routes désignent les autres par leur identifiant public, jamais par l'identifiant Telegram.
const pid = async (id) => (await store.getUser(id))?.pid;
const { config } = await import('../server/config.js');
const { bot, setupBot } = await import('../server/bot.js');
const { api } = await import('../server/routes.js');

// grammY fabrique une API neuve à chaque update : remplacer bot.api.sendMessage ne suffirait pas,
// les gestionnaires de boutons garderaient la vraie. Un transformeur, lui, est recopié sur chacune.
const versModeration = [];
let appels = 0;
bot.api.config.use(async (prev, method, payload) => {
  if (method === 'getChatAdministrators') return { ok: true, result: [{ status: 'administrator', user: { id: 42, is_bot: false, first_name: 'Modo' } }] };
  appels += 1;
  if (method === 'sendMessage') {
    versModeration.push({ chatId: String(payload.chat_id), text: payload.text, reply_markup: payload.reply_markup });
    return { ok: true, result: { message_id: versModeration.length } };
  }
  return { ok: true, result: true };
});
bot.botInfo = { id: 123456, is_bot: true, first_name: 'Test', username: 'test_bot', can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business_account: false, has_main_web_app: false };
await setupBot();

let numero = 0;
// Rejoue un clic sur un bouton du groupe de modération, comme Telegram l'enverrait.
const cliquer = (data, chatId = config.adminChatId) => bot.handleUpdate({
  update_id: (numero += 1),
  callback_query: {
    id: String(numero),
    from: { id: 42, is_bot: false, first_name: 'Modo' },
    chat_instance: '1',
    data,
    message: { message_id: numero, date: 0, chat: { id: Number(chatId), type: 'supergroup' } },
  },
});
const dernier = (motif) => versModeration.filter((m) => m.text.includes(motif)).pop();

const app = express();
app.use(express.json());
app.use('/api', api);
const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api`;
const call = async (user, p, method = 'GET', body) => {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', 'x-dev-user': user }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
async function creer(id, name, gender = 'femme') {
  await call(id, '/me');
  await call(id, '/me/profile', 'PUT', { name, age: 25, gender, intent: 'amitie', city: 'Yaoundé', promptA: 'Le poisson braisé' });
  await store.updateUser(id, { verification: 'approved' });
}
const profilsVusPar = async (id) => (await call(id, '/profiles')).body.profiles?.map((p) => p.id) ?? [];

test.after(() => server.close());

// Filet : si un jour un appel échappe au transformeur, il partirait vers la vraie API Telegram.
test.after(() => assert.ok(appels > 0, 'le transformeur a bien intercepté les appels Telegram'));

test('un compte banni ne peut plus entrer, et on lui dit quoi faire', async () => {
  await creer('8001', 'Awa');
  assert.equal((await call('8001', '/me')).status, 200, 'avant, tout va bien');

  await store.banUser('8001', { motif: 'arnaque', par: '42' });

  const r = await call('8001', '/me');
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'BANNED');
  // Règle 11 : dire ce qui se passe et quoi faire, pas seulement refuser.
  assert.match(r.body.message, /fermé/);
  assert.match(r.body.message, /\/aide/);
});

// La porte la plus sournoise : revenir avec le même compte Telegram recrée la ligne à l'identique
// si rien ne la retient. C'est exactement ce que les conditions interdisent.
test('revenir avec le même compte Telegram ne le ressuscite pas', async () => {
  const avant = await store.getUser('8001');
  assert.ok(avant.banned, 'le compte porte bien la marque');

  // upsertTelegramUser est appelé à chaque requête : il ne doit pas effacer le bannissement.
  await store.upsertTelegramUser({ id: '8001', first_name: 'Awa', language_code: 'fr' });
  const apres = await store.getUser('8001');
  assert.ok(apres.banned, 'la marque survit à une nouvelle ouverture');
  assert.equal((await call('8001', '/me')).status, 403);
});

test('un compte banni disparaît de la découverte et des listes', async () => {
  await creer('8002', 'Bana');
  await creer('8003', 'Cyrille', 'homme');
  const p8003 = await pid('8003');
  assert.ok((await profilsVusPar('8002')).includes(p8003), 'ils se voient avant');

  await store.banUser('8003', { motif: 'harcèlement', par: '42' });
  assert.ok(!(await profilsVusPar('8002')).includes(p8003), 'et plus après');

  const d = await call('8002', '/discover');
  assert.ok(!d.body.profiles.some((p) => p.id === p8003), 'ni dans les cartes');
});

test('ses matchs sont défaits : personne ne reste en discussion avec lui', async () => {
  await creer('8004', 'Diane');
  await creer('8005', 'Éric', 'homme');
  await call('8004', '/swipes', 'POST', { targetId: await pid('8005'), action: 'like' });
  const m = (await call('8005', '/swipes', 'POST', { targetId: await pid('8004'), action: 'like' })).body.match;
  assert.ok(m, 'le match existe');

  await store.banUser('8005', { motif: 'arnaque', par: '42' });
  assert.equal(await store.getMatch(m.id), null, 'le match est défait');
  assert.deepEqual(await store.matchesOf('8004'), [], 'et la personne d\'en face n\'a plus rien');
});

test('la marque dit qui a décidé, quand, et pourquoi', async () => {
  await creer('8006', 'Fanta');
  const avant = Date.now();
  await store.banUser('8006', { motif: 'faux profil', par: '99' });
  const { banned } = await store.getUser('8006');
  assert.equal(banned.motif, 'faux profil');
  assert.equal(banned.par, '99');
  assert.ok(banned.at >= avant, 'la date est celle de la décision');
});

// Se tromper arrive. La décision doit pouvoir être défaite sans laisser de trace vide.
test('débannir rend le compte tel qu\'il était', async () => {
  await creer('8007', 'Gaëlle');
  await store.banUser('8007', { motif: 'erreur', par: '42' });
  assert.equal((await call('8007', '/me')).status, 403);

  await store.unbanUser('8007');
  const u = await store.getUser('8007');
  assert.ok(!('banned' in u) || !u.banned, 'aucune trace vide ne reste');
  assert.equal((await call('8007', '/me')).status, 200);
  assert.equal(u.profile.name, 'Gaëlle', 'le profil n\'a pas été touché');
});

test('la liste des bannis se relit', async () => {
  const bannis = (await store.bannis()).map((u) => u.id);
  for (const id of ['8001', '8003', '8005', '8006']) assert.ok(bannis.includes(id), `${id} doit y être`);
  assert.ok(!bannis.includes('8007'), 'un compte débanni n\'y est plus');
  assert.ok(!bannis.includes('8002'), 'ni un compte qui n\'a jamais été banni');
});

test('bannir un compte qui n\'existe pas ne fait rien exploser', async () => {
  assert.equal(await store.banUser('inconnu-9999', { motif: 'x', par: '42' }), null);
  assert.equal(await store.unbanUser('inconnu-9999'), null);
});

// Le bannissement doit avoir un chemin réel, sinon c'est du code qui ne sert jamais.
// Ce chemin, c'est le groupe de modération, là où se prennent déjà les décisions sur les selfies.
test('un signalement arrive dans le groupe avec un bouton pour fermer le compte', async () => {
  await creer('8010', 'Hawa');
  await creer('8011', 'Ibrahim', 'homme');
  await call('8010', '/reports', 'POST', { targetId: await pid('8011'), reason: 'demande argent' });

  const msg = dernier('Signalement');
  assert.ok(msg, 'la modération est prévenue');
  assert.equal(msg.chatId, String(config.adminChatId));
  const bouton = msg.reply_markup?.inline_keyboard?.[0]?.[0];
  assert.equal(bouton?.callback_data, 'ban:8011', 'le bouton vise bien la personne signalée');
});

test('un message bloqué par l\'anti-arnaque porte le même bouton', async () => {
  await creer('8012', 'Joséphine');
  await creer('8013', 'Kevin', 'homme');
  await call('8012', '/swipes', 'POST', { targetId: await pid('8013'), action: 'like' });
  const m = (await call('8013', '/swipes', 'POST', { targetId: await pid('8012'), action: 'like' })).body.match;
  await call('8013', `/matches/${m.id}/messages`, 'POST', { text: 'envoie-moi 5000 f par orange money' });

  const msg = dernier('Message bloqué');
  assert.ok(msg, 'la modération voit le message bloqué');
  assert.equal(msg.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data, 'ban:8013');
});

test('le clic ferme le compte, et le compte fermé ne peut plus entrer', async () => {
  await creer('8014', 'Larissa');
  assert.equal((await call('8014', '/me')).status, 200);

  await cliquer('ban:8014');

  const u = await store.getUser('8014');
  assert.ok(u.banned, 'la marque est posée');
  assert.equal(u.banned.par, 'Modo', 'et elle dit qui a décidé');
  assert.equal((await call('8014', '/me')).status, 403);
  assert.ok(dernier('Compte fermé'), 'la trace reste dans le groupe');
});

test('un clic venu d\'ailleurs que du groupe de modération ne ferme rien', async () => {
  await creer('8015', 'Modeste', 'homme');
  await cliquer('ban:8015', '999999');
  assert.ok(!(await store.getUser('8015')).banned, 'le compte est intact');
  assert.equal((await call('8015', '/me')).status, 200);
});

test('rouvrir depuis le groupe rend l\'accès', async () => {
  await cliquer('unban:8014');
  const u = await store.getUser('8014');
  assert.ok(!u.banned, 'la marque est retirée');
  assert.equal((await call('8014', '/me')).status, 200);
  assert.ok(dernier('Compte rouvert'), 'la trace reste dans le groupe');
});
