// « Supprimer mon compte » doit tout emporter, et ne rien laisser revenir. La revue du
// 14 septembre 2026 (audit/09-revue-code.md, I3, I4, I5) a trouvé trois restes : le compte
// recréé par le signal de fermeture, les signalements et la personne de confiance qui survivaient,
// et le selfie encore dans le groupe de modération avec son bouton « Valider ».
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-suppression-'));
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.WEBAPP_URL = 'https://exemple.test';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.SEED_DEMO = 'false';
process.env.AUTO_APPROVE = 'false';
process.env.ADMIN_CHAT_ID = '-1001234567890';

const express = (await import('express')).default;
const { store } = await import('../server/store.js');
const { config } = await import('../server/config.js');
const { bot, setupBot, decideVerification, retirerSelfieDuGroupe } = await import('../server/bot.js');
const { api } = await import('../server/routes.js');
const { accepter } = await import('../server/confiance.js');

// Ce que Telegram reçoit : photos envoyées (avec un numéro de message), messages, suppressions.
const telegram = { photos: [], messages: [], supprimes: [], legendes: [] };
let prochainMessage = 100;
bot.api.config.use(async (prev, method, payload) => {
  if (method === 'getChatAdministrators') return { ok: true, result: [{ status: 'administrator', user: { id: 42, is_bot: false, first_name: 'Modo' } }] };
  if (method === 'sendPhoto') { prochainMessage += 1; telegram.photos.push({ message_id: prochainMessage, caption: payload.caption }); return { ok: true, result: { message_id: prochainMessage } }; }
  if (method === 'sendMessage') { telegram.messages.push({ chatId: String(payload.chat_id), text: payload.text }); return { ok: true, result: { message_id: 1 } }; }
  if (method === 'deleteMessage') { telegram.supprimes.push(payload.message_id); return { ok: true, result: true }; }
  if (method === 'editMessageCaption') { telegram.legendes.push(payload); return { ok: true, result: true }; }
  return { ok: true, result: true };
});
bot.botInfo = { id: 123456, is_bot: true, first_name: 'T', username: 'odo_test_bot', can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false };
await setupBot();

const app = express();
app.use(express.json());
app.use('/api', api);
const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api`;
test.after(() => server.close());
const call = async (user, p, method = 'GET', body) => {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', 'x-dev-user': user }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
async function creer(id, name, gender = 'femme') {
  await call(id, '/me');
  await call(id, '/me/profile', 'PUT', { name, age: 25, gender, intent: 'amitie', city: 'Yaoundé', promptA: 'Le poisson braisé' });
  await store.updateUser(id, { verification: 'approved' });
}
const jpeg = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64');
async function envoyerSelfie(id) {
  await call(id, '/me/verification/start', 'POST');
  const r = await call(id, '/me/verification', 'POST', { selfie: jpeg });
  assert.equal(r.status, 200, JSON.stringify(r.body));
}
let numero = 0;
const cliquer = (data) => bot.handleUpdate({
  update_id: (numero += 1),
  callback_query: { id: String(numero), from: { id: 42, is_bot: false, first_name: 'Modo' }, chat_instance: '1', data, message: { message_id: numero, date: 0, chat: { id: Number(config.adminChatId), type: 'supergroup' } } },
});
const respirer = (ms = 60) => new Promise((r) => setTimeout(r, ms));

// ---------- I3 : le signal de fermeture recréait le compte ----------

test("le signal de fermeture n'a pas besoin d'un compte, et n'en crée pas", async () => {
  await creer('s1', 'Awa');
  assert.equal((await call('s1', '/me', 'DELETE')).status, 200);
  assert.equal(await store.getUser('s1'), null);
  // C'est exactement ce que l'app envoie en se fermant, juste après la suppression.
  const r = await fetch(`${base}/presence/leave`, { method: 'POST', headers: { 'x-dev-user': 's1' } });
  assert.equal(r.status, 200);
  await respirer();
  assert.equal(await store.getUser('s1'), null, 'toujours rien : le compte ne revient pas par la porte de derrière');
  // Et sans identité, la route refuse au lieu de créer quoi que ce soit.
  assert.equal((await fetch(`${base}/presence/leave`, { method: 'POST' })).status, 401);
});

// ---------- I4 : signalements et personne de confiance ----------

test('les signalements émis et reçus partent avec le compte', async () => {
  await creer('s2', 'Bana'); await creer('s3', 'Cyrille', 'homme'); await creer('s4', 'Dieudonné', 'homme');
  assert.equal((await call('s2', '/reports', 'POST', { targetId: 's3', reason: 'argent' })).status, 200);
  assert.equal((await call('s4', '/reports', 'POST', { targetId: 's2', reason: 'autre' })).status, 200);
  assert.equal((await store.reports()).filter((r) => r.from === 's2' || r.targetId === 's2').length, 2);
  await call('s2', '/me', 'DELETE');
  const restants = await store.reports();
  assert.equal(restants.filter((r) => r.from === 's2' || r.targetId === 's2').length, 0, 'plus aucun signalement ne porte cet identifiant');
});

test("être la personne de confiance de quelqu'un ne survit pas non plus, et le membre est prévenu", async () => {
  await creer('s5', 'Estelle'); await call('s6', '/me');
  // s6 a accepté d'être la personne de confiance d'Estelle
  await accepter(await store.getUser('s5'), { id: 's6', first_name: 'Fadi', language_code: 'fr' });
  assert.equal((await store.getUser('s5')).confiance.id, 's6');
  telegram.messages.length = 0;
  assert.equal((await call('s6', '/me', 'DELETE')).status, 200);
  assert.equal((await store.getUser('s5')).confiance, null, "Estelle n'a plus de personne de confiance fantôme");
  await respirer();
  const avis = telegram.messages.find((m) => m.chatId === 's5');
  assert.ok(avis, 'Estelle est prévenue');
  assert.match(avis.text, /personne de confiance a supprimé son compte/);
  assert.ok(!avis.text.includes('Fadi'), 'sans nommer qui : ce compte n\'existe plus');
});

// ---------- I5 : le selfie dans le groupe ----------

test("le numéro du message du groupe est retenu à l'envoi, et le selfie est retiré à la suppression du compte", async () => {
  await call('s7', '/me');
  await call('s7', '/me/profile', 'PUT', { name: 'Gaëlle', age: 25, gender: 'femme', intent: 'amitie', city: 'Yaoundé', promptA: 'Le poisson braisé' });
  await envoyerSelfie('s7');
  const u = await store.getUser('s7');
  assert.equal(u.verification, 'pending');
  const messageId = telegram.photos.at(-1).message_id;
  assert.equal(u.verifMessageId, messageId, 'le message du groupe est connu du compte');

  telegram.supprimes.length = 0;
  await call('s7', '/me', 'DELETE');
  assert.deepEqual(telegram.supprimes, [messageId], 'la photo est retirée du groupe');
});

test("un bouton « Valider » sous un selfie qui n'est plus en attente ne valide rien", async () => {
  await call('s8', '/me');
  await call('s8', '/me/profile', 'PUT', { name: 'Hortense', age: 25, gender: 'femme', intent: 'amitie', city: 'Yaoundé', promptA: 'Le poisson braisé' });
  await envoyerSelfie('s8');
  // Le selfie A est purgé (sept jours sans décision) : le compte repart de zéro.
  await store.updateUser('s8', { verificationSentAt: Date.now() - 8 * 86400 * 1000 });
  const purges = await store.purgerVerificationsOubliees(7 * 86400 * 1000);
  assert.equal(purges.length, 1);
  assert.ok(purges[0].verifMessageId, 'la purge dit quel message retirer du groupe');
  assert.equal((await store.getUser('s8')).verification, 'none');

  // Un modérateur clique sur le vieux bouton : rien ne doit changer.
  await cliquer('approve:s8');
  await respirer();
  assert.equal((await store.getUser('s8')).verification, 'none', 'pas validée sur un selfie que personne n\'a vu');
  assert.deepEqual(await decideVerification('s8', true), { ok: false, raison: 'PAS_EN_ATTENTE' });

  // Le selfie B, lui, se tranche normalement.
  await envoyerSelfie('s8');
  await cliquer('approve:s8');
  await respirer();
  assert.equal((await store.getUser('s8')).verification, 'approved');
  assert.equal((await store.getUser('s8')).verifMessageId, null, 'plus de message à retirer');
});

test("retirer un selfie du groupe : supprimé, ou légende remplacée si Telegram refuse", async () => {
  telegram.supprimes.length = 0; telegram.legendes.length = 0;
  assert.equal(await retirerSelfieDuGroupe(555, 'trace'), true);
  assert.deepEqual(telegram.supprimes, [555]);
  assert.equal(await retirerSelfieDuGroupe(null, 'trace'), false, 'sans numéro, rien à faire');
  // Telegram refuse la suppression (message trop ancien) : la légende prend la place, sans clavier.
  const vrai = bot.api.config.use;
  bot.api.config.use(async (prev, method, payload) => {
    if (method === 'deleteMessage') return { ok: false, error_code: 400, description: "Bad Request: message can't be deleted" };
    return prev(method, payload);
  });
  assert.equal(await retirerSelfieDuGroupe(556, 'trace de repli'), false);
  assert.equal(telegram.legendes.at(-1)?.message_id, 556);
  assert.equal(telegram.legendes.at(-1)?.caption, 'trace de repli');
  assert.ok(!('reply_markup' in telegram.legendes.at(-1)), 'et les boutons partent avec');
});
