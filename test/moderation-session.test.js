// Entrer dans l'espace de modération, et surtout ne pas y entrer.
//
// Cette porte donne accès aux signalements, donc à ce que des membres se sont dit. Elle ne
// s'ouvre qu'aux administrateurs du groupe de modération, et la qualité d'administrateur est
// demandée à Telegram, jamais lue dans une liste figée. Ces tests essaient les contournements :
// rejouer un lien, s'en fabriquer un, garder sa session après avoir perdu ses droits.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-modsession-'));
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.WEBAPP_URL = 'https://exemple.test';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.SEED_DEMO = 'false';
process.env.AUTO_APPROVE = 'false';
process.env.ADMIN_CHAT_ID = '-1001234567890';
process.env.WEB_SESSION_SECRET = 'secret-de-test-assez-long';

const express = (await import('express')).default;
const { config } = await import('../server/config.js');
const { store } = await import('../server/store.js');
// Les routes désignent les autres par leur identifiant public, jamais par l'identifiant Telegram.
const pid = async (id) => (await store.getUser(id))?.pid;
const { bot } = await import('../server/bot.js');
const { api } = await import('../server/routes.js');
const { modApi, creerPageModeration, creerLienModeration, oublierLesAdmins, commandesModeration } = await import('../server/moderation.js');
const { COOKIE_MODERATION, signer } = await import('../server/session.js');

// Qui Telegram considère comme administrateur. Chaque test le décide.
let admins = ['500'];
const versModeration = [];
const prives = [];
bot.api.config.use(async (prev, method, payload) => {
  if (method === 'getChatAdministrators') return { ok: true, result: admins.map((id) => ({ status: 'administrator', user: { id: Number(id), is_bot: false, first_name: `Admin ${id}` } })) };
  if (method === 'sendMessage') {
    (String(payload.chat_id) === String(config.adminChatId) ? versModeration : prives).push({ chatId: String(payload.chat_id), text: payload.text });
    return { ok: true, result: { message_id: 1 } };
  }
  return { ok: true, result: true };
});
bot.botInfo = { id: 1, is_bot: true, first_name: 'T', username: 't_bot', can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false };
commandesModeration();

const app = express();
app.use(express.json());
app.use('/api/mod', modApi);
app.use('/api', api);
app.get('/moderation', creerPageModeration('v1'));
const server = app.listen(0);
const base = `http://localhost:${server.address().port}`;
test.after(() => server.close());

const aller = (chemin, { cookie, method = 'GET' } = {}) =>
  fetch(base + chemin, { method, redirect: 'manual', headers: cookie ? { cookie } : {} });
// Le cookie tel que le navigateur le renverrait : nom=valeur, sans les attributs.
const cookieDe = (r) => (r.headers.get('set-cookie') || '').split(';')[0];

async function membre(id, name) {
  await fetch(`${base}/api/me`, { headers: { 'x-dev-user': id } });
  await fetch(`${base}/api/me/profile`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-dev-user': id }, body: JSON.stringify({ name, age: 25, gender: 'femme', intent: 'amitie', city: 'Yaoundé', promptA: 'Le poisson braisé' }) });
  await store.updateUser(id, { verification: 'approved' });
}

async function session(id) {
  oublierLesAdmins();
  const lien = await creerLienModeration(id);
  const r = await aller(`/moderation?jeton=${encodeURIComponent(new URL(lien).searchParams.get('jeton'))}`);
  return { r, cookie: cookieDe(r) };
}

test("un administrateur du groupe entre, et le lien passe en privé", async () => {
  await store.upsertTelegramUser({ id: '500', first_name: 'Modo', language_code: 'fr' });
  const { r, cookie } = await session('500');
  assert.equal(r.status, 303, 'le jeton est échangé puis on repart vers une adresse propre');
  assert.equal(r.headers.get('location'), '/moderation');
  assert.match(cookie, new RegExp(`^${COOKIE_MODERATION}=`));
  assert.match(r.headers.get('set-cookie'), /HttpOnly/i, 'le cookie reste hors de portée du JavaScript');
  assert.match(r.headers.get('set-cookie'), /SameSite=Lax/i);

  const me = await aller('/api/mod/me', { cookie });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).id, '500');
});

// La porte la plus évidente : rejouer le lien reçu, ou le transmettre.
test('un lien ne sert qu\'une fois', async () => {
  await store.upsertTelegramUser({ id: '500', first_name: 'Modo' });
  oublierLesAdmins();
  const lien = await creerLienModeration('500');
  const jeton = new URL(lien).searchParams.get('jeton');
  assert.equal((await aller(`/moderation?jeton=${encodeURIComponent(jeton)}`)).status, 303, 'la première fois passe');
  const seconde = await aller(`/moderation?jeton=${encodeURIComponent(jeton)}`);
  assert.equal(seconde.status, 403);
  assert.match(await seconde.text(), /déjà servi/);
});

test('un jeton fabriqué sans le secret ne vaut rien', async () => {
  const faux = Buffer.from(JSON.stringify({ id: '500', u: 'x', exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url');
  for (const jeton of [`${faux}.${Buffer.from('nimportequoi').toString('base64url')}`, faux, 'bidon']) {
    const r = await aller(`/moderation?jeton=${encodeURIComponent(jeton)}`);
    assert.equal(r.status, 403, `${jeton.slice(0, 12)}… doit être refusé`);
  }
});

test('un lien expiré ne s\'ouvre pas', async () => {
  await store.upsertTelegramUser({ id: '500', first_name: 'Modo' });
  const usage = 'usage-perime';
  await store.updateUser('500', { modJeton: usage });
  const jeton = signer({ id: '500', u: usage }, -1, 'lien');
  const r = await aller(`/moderation?jeton=${encodeURIComponent(jeton)}`);
  assert.equal(r.status, 403);
  assert.match(await r.text(), /expiré/);
});

// Le cœur de l'arbitrage : ce sont les administrateurs du groupe, pas une liste à nous.
test('un membre du groupe qui n\'est pas administrateur reste dehors', async () => {
  await store.upsertTelegramUser({ id: '501', first_name: 'Simple' });
  const { r, cookie } = await session('501');
  assert.equal(r.status, 403);
  assert.match(await r.text(), /pas administrateur/);
  assert.equal(cookie, '', 'aucune session n\'est ouverte');
});

test('perdre ses droits ferme la session en cours', async () => {
  await store.upsertTelegramUser({ id: '500', first_name: 'Modo' });
  const { cookie } = await session('500');
  assert.equal((await aller('/api/mod/me', { cookie })).status, 200);

  admins = ['999']; // retiré des administrateurs du groupe
  oublierLesAdmins();
  const apres = await aller('/api/mod/me', { cookie });
  assert.equal(apres.status, 403, 'la session ne suffit pas : le droit est revérifié');
  assert.match((await apres.json()).message, /administrateur/);
  admins = ['500'];
  oublierLesAdmins();
});

test('sans cookie, rien ne sort', async () => {
  for (const route of ['/api/mod/me', '/api/mod/verifications', '/api/mod/signalements', '/api/mod/comptes-fermes']) {
    assert.equal((await aller(route)).status, 401, route);
  }
  assert.equal((await aller('/moderation')).status, 401);
});

// Un cookie signé pour quelqu'un d'autre, ou bricolé, ne doit pas passer.
test('un cookie forgé ne passe pas', async () => {
  for (const faux of [`${COOKIE_MODERATION}=500`, `${COOKIE_MODERATION}=eyJpZCI6IjUwMCJ9.zzzz`]) {
    assert.equal((await aller('/api/mod/me', { cookie: faux })).status, 401, faux);
  }
});

// « % » seul faisait jeter decodeURIComponent dans un gestionnaire sans filet : le processus
// s'arrêtait, sans compte ni limite de débit (audit/09-revue-code.md, C2).
test('un cookie malformé répond 401, et le serveur reste debout', async () => {
  const rejets = [];
  const ecoute = (r) => rejets.push(r);
  process.on('unhandledRejection', ecoute);
  try {
    for (const valeur of ['%', '%E0%A4%A']) {
      assert.equal((await aller('/api/mod/me', { cookie: `${COOKIE_MODERATION}=${valeur}` })).status, 401, valeur);
      assert.equal((await aller('/moderation', { cookie: `${COOKIE_MODERATION}=${valeur}` })).status, 401, valeur);
    }
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(rejets.length, 0, 'aucune promesse orpheline');
  } finally {
    process.off('unhandledRejection', ecoute);
  }
  assert.equal((await aller('/api/mod/me')).status, 401, 'toujours vivant');
});

// Le jeton du lien et le cookie de session avaient la même forme et le même secret : le lien,
// dix minutes à usage unique, valait comme cookie avant et après avoir été consommé
// (audit/09-revue-code.md, I1). Chaque jeton porte maintenant son usage.
test("le jeton du lien ne vaut pas comme cookie de session, ni avant ni après l'échange", async () => {
  oublierLesAdmins();
  const lien = await creerLienModeration('500');
  const jeton = new URL(lien).searchParams.get('jeton');
  assert.equal((await aller('/api/mod/me', { cookie: `${COOKIE_MODERATION}=${jeton}` })).status, 401, 'avant l\'échange');
  assert.equal((await aller('/moderation', { cookie: `${COOKIE_MODERATION}=${jeton}` })).status, 401);
  const r = await aller(`/moderation?jeton=${encodeURIComponent(jeton)}`);
  assert.equal(r.status, 303, 'le lien lui-même marche toujours');
  assert.equal((await aller('/api/mod/me', { cookie: `${COOKIE_MODERATION}=${jeton}` })).status, 401, 'après l\'échange');
  // Et l'inverse : un cookie de session n'ouvre pas la porte du lien.
  assert.equal((await aller(`/moderation?jeton=${encodeURIComponent(cookieDe(r).split('=')[1])}`)).status, 403);
});

test('la file de vérification ne montre aucun selfie', async () => {
  await membre('510', 'Awa');
  await store.updateUser('510', { verification: 'pending', verificationSentAt: Date.now(), pendingGesture: 'deux doigts levés' });
  const { cookie } = await session('500');
  const r = await aller('/api/mod/verifications', { cookie });
  const { verifications } = await r.json();
  const awa = verifications.find((v) => v.id === '510');
  assert.ok(awa, 'elle attend bien');
  assert.equal(awa.prenom, 'Awa');
  assert.ok(awa.depuis, 'on sait depuis quand');
  // La promesse tient à ce que le selfie ne sorte jamais du groupe Telegram.
  const brut = JSON.stringify(verifications);
  assert.ok(!/selfie|photo|jpeg|base64/i.test(brut), 'aucune image ne transite');
});

test('les signalements arrivent avec les prénoms, pas les identifiants seuls', async () => {
  await membre('511', 'Bana');
  await membre('512', 'Cyrille');
  await fetch(`${base}/api/reports`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dev-user': '511' }, body: JSON.stringify({ targetId: await pid('512'), reason: 'demande argent' }) });

  const { cookie } = await session('500');
  const { signalements } = await (await aller('/api/mod/signalements', { cookie })).json();
  const s = signalements.find((x) => x.targetId === '512');
  assert.ok(s, 'le signalement est là');
  assert.equal(s.nomCible, 'Cyrille');
  assert.equal(s.reason, 'demande argent');
});

test('fermer la session efface le cookie', async () => {
  const { cookie } = await session('500');
  const r = await aller('/api/mod/session', { cookie, method: 'DELETE' });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('set-cookie') || '', /mod_session=;|mod_session=;? ?Expires/i);
});

test("la commande /moderation refuse ailleurs que dans le groupe", async () => {
  prives.length = 0;
  versModeration.length = 0;
  const message = (chatId, from) => bot.handleUpdate({
    update_id: Math.floor(Math.random() * 1e9),
    message: { message_id: 1, date: 0, chat: { id: Number(chatId), type: chatId === config.adminChatId ? 'supergroup' : 'private' }, from: { id: Number(from), is_bot: false, first_name: 'Qui' }, text: '/moderation', entities: [{ offset: 0, length: 11, type: 'bot_command' }] },
  });

  const liens = () => [...prives, ...versModeration].filter((m) => m.text.includes('jeton='));

  // En privé, le bot répond — mais il répond « pas ici », pas un lien.
  await message('777', '500');
  assert.equal(liens().length, 0, 'aucun lien ne part depuis une discussion privée');
  assert.match(prives.at(-1).text, /groupe de modération/);

  admins = ['500'];
  oublierLesAdmins();
  await message(config.adminChatId, '500');
  assert.equal(liens().length, 1, 'un administrateur reçoit son lien');
  assert.equal(liens()[0].chatId, '500', 'et il arrive en privé, pas dans le groupe');
  assert.match(liens()[0].text, /\/moderation\?jeton=/);

  await message(config.adminChatId, '501');
  assert.equal(liens().length, 1, 'un membre simple du groupe n\'en reçoit pas');
  assert.match(versModeration.at(-1).text, /administrateurs du groupe/);
});

// Le choix assumé : sans secret, le serveur démarre quand même et l'app continue de tourner.
// Seule cette porte refuse — mais elle refuse en disant quoi faire, pas par un 500 muet.
// Fermer la session n'effaçait que le cookie du navigateur : un cookie copié valait douze heures.
test('fermer la session la révoque : le même cookie ne rentre plus', async () => {
  const { cookie } = await session('500');
  assert.equal((await aller('/api/mod/me', { cookie })).status, 200);
  assert.equal((await aller('/api/mod/session', { cookie, method: 'DELETE' })).status, 200);
  assert.equal((await aller('/api/mod/me', { cookie })).status, 401, 'révoquée côté serveur');
  assert.equal((await aller('/moderation', { cookie })).status, 401);
  // Un nouveau lien rouvre une session neuve, et l'ancienne reste morte.
  const neuve = await session('500');
  assert.equal((await aller('/api/mod/me', { cookie: neuve.cookie })).status, 200);
  assert.equal((await aller('/api/mod/me', { cookie })).status, 401);
});

// Lire puis effacer laissait passer deux requêtes simultanées avec le même lien.
test("deux requêtes simultanées avec le même lien : une seule passe", async () => {
  oublierLesAdmins();
  const lien = await creerLienModeration('500');
  const jeton = encodeURIComponent(new URL(lien).searchParams.get('jeton'));
  const reponses = await Promise.all([1, 2, 3].map(() => aller(`/moderation?jeton=${jeton}`)));
  assert.deepEqual(reponses.map((r) => r.status).sort(), [303, 403, 403]);
});

test("sans WEB_SESSION_SECRET, la modération refuse en expliquant", async () => {
  const vrai = config.webSessionSecret;
  config.webSessionSecret = '';
  try {
    const r = await aller('/api/mod/verifications');
    assert.equal(r.status, 503);
    assert.match((await r.json()).message, /WEB_SESSION_SECRET/);

    const p = await aller('/moderation');
    assert.equal(p.status, 503);
    assert.match(await p.text(), /WEB_SESSION_SECRET/);

    // Et surtout : aucune session ne s'ouvre avec un cookie signé avant la panne.
    assert.equal((await aller('/api/mod/me', { cookie: `${COOKIE_MODERATION}=peu-importe` })).status, 503);
  } finally {
    config.webSessionSecret = vrai;
  }
});

test("le reste de l'app ne dépend pas de la modération", async () => {
  await membre('520', 'Diane');
  const r = await fetch(`${base}/api/me`, { headers: { 'x-dev-user': '520' } });
  assert.equal(r.status, 200, 'la mini app tourne, secret ou pas');
});

// Être administrateur du groupe Telegram et avoir un compte fermé dans l'app sont deux choses
// indépendantes : rien n'empêche la seconde, donc il faut la refuser explicitement.
test('un compte fermé ne modère pas, même administrateur du groupe', async () => {
  await store.upsertTelegramUser({ id: '530', first_name: 'Deux-casquettes' });
  admins = ['500', '530'];
  oublierLesAdmins();
  const { cookie } = await session('530');
  assert.equal((await aller('/api/mod/me', { cookie })).status, 200, 'il entre tant que son compte est ouvert');

  await store.banUser('530', { motif: 'test', par: 'Modo' });
  const apres = await aller('/api/mod/me', { cookie });
  assert.equal(apres.status, 403);
  await store.unbanUser('530');
  admins = ['500'];
  oublierLesAdmins();
});

// Le lien est une adresse : sans adresse publique il ne mènerait nulle part, et la personne
// chercherait longtemps pourquoi.
test('sans WEBAPP_URL, la commande le dit au lieu d\'envoyer un lien mort', async () => {
  const vrai = config.webAppUrl;
  config.webAppUrl = '';
  versModeration.length = 0;
  try {
    admins = ['500'];
    oublierLesAdmins();
    await bot.handleUpdate({
      update_id: Math.floor(Math.random() * 1e9),
      message: { message_id: 1, date: 0, chat: { id: Number(config.adminChatId), type: 'supergroup' }, from: { id: 500, is_bot: false, first_name: 'Modo' }, text: '/moderation', entities: [{ offset: 0, length: 11, type: 'bot_command' }] },
    });
    assert.match(versModeration.at(-1).text, /WEBAPP_URL/);
  } finally {
    config.webAppUrl = vrai;
  }
});
