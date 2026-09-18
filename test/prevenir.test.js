// Audit 16, lot B : le bot ne peut écrire qu'à qui l'a autorisé. Quand l'app envoie quelqu'un
// vers le bot par `?start=prevenir` (la ligne « Le bot ne peut pas te prévenir » de l'onglet
// Profil), le bot doit répondre qu'il peut écrire — dans la langue de la personne — et non le
// message d'accueil générique, pour que le geste se comprenne.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-prevenir-'));
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.WEBAPP_URL = 'https://exemple.test';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.SEED_DEMO = 'false';

const { runtime } = await import('../server/config.js');
const { store } = await import('../server/store.js');
const { bot, setupBot } = await import('../server/bot.js');

const envoyes = [];
bot.api.config.use(async (prev, method, payload) => {
  if (method === 'sendMessage') {
    envoyes.push({ a: String(payload.chat_id), texte: payload.text, bouton: !!payload.reply_markup });
    return { ok: true, result: { message_id: envoyes.length } };
  }
  return { ok: true, result: true };
});
bot.botInfo = { id: 1, is_bot: true, first_name: 'T', username: 'odo_bot', can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false };
runtime.botUsername = 'odo_bot';
await setupBot();

let numero = 0;
const start = (param, de, language_code = 'fr') => bot.handleUpdate({
  update_id: (numero += 1),
  message: { message_id: numero, date: 0, chat: { id: de, type: 'private' }, from: { id: de, is_bot: false, first_name: 'Awa', language_code }, text: `/start${param ? ` ${param}` : ''}`, entities: [{ offset: 0, length: 6, type: 'bot_command' }] },
});

test("/start prevenir dit que le bot peut écrire, avec le bouton pour revenir", async () => {
  await start('prevenir', 501);
  const m = envoyes.find((e) => e.a === '501');
  assert.ok(m, 'le bot répond');
  assert.match(m.texte, /peut t'écrire ici/);
  assert.doesNotMatch(m.texte, /Salut Awa/, "pas le message d'accueil générique");
  assert.equal(m.bouton, true, "le bouton d'ouverture de l'app est là");
});

test('dans la langue de la personne', async () => {
  await store.updateUser(502, { lang: 'en' }).catch(() => {});
  await start('prevenir', 502, 'en');
  const m = envoyes.find((e) => e.a === '502');
  assert.match(m.texte, /can write to you here/);
});

test("/start sans paramètre garde l'accueil", async () => {
  await start('', 503);
  const m = envoyes.find((e) => e.a === '503');
  assert.match(m.texte, /Salut Awa/);
});

// Audit 16, n° 13 : l'écran d'un compte fermé ouvre le bot par `?start=aide` — la même réponse
// que /aide, pas l'accueil.
test("/start aide répond comme /aide", async () => {
  await start('aide', 504);
  const m = envoyes.find((e) => e.a === '504');
  assert.match(m.texte, /ne te demandera jamais d'argent par message/);
});
