// Pourquoi A ne voit pas B — et la preuve que l'explication ne ment pas.
//
// La question revient à chaque nouveau membre, et jusqu'ici la seule réponse était de deviner.
// L'outil qui y répond n'a de valeur que s'il dit **exactement** ce que fait le paquet : une
// explication qui aurait sa propre idée des règles serait pire que pas d'explication, parce qu'on
// la croirait. Le test qui compte est donc le premier : sur des paires tirées au hasard, « toutes
// les portes sont ouvertes » doit valoir exactement « B est dans le paquet que /discover rend à A ».
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-pourquoi-'));
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.WEBAPP_URL = 'https://exemple.test';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.SEED_DEMO = 'false';
process.env.AUTO_APPROVE = 'false';
process.env.ADMIN_CHAT_ID = '-1001234567890';

const express = (await import('express')).default;
const { store } = await import('../server/store.js');
const { config } = await import('../server/config.js');
const { bot, setupBot } = await import('../server/bot.js');
const { api, expliquerLaDecouverte } = await import('../server/routes.js');

const reponses = [];
bot.api.config.use(async (prev, method, payload) => {
  if (method === 'getChatAdministrators') return { ok: true, result: [{ status: 'administrator', user: { id: 42, is_bot: false, first_name: 'Modo' } }] };
  if (method === 'sendMessage') { reponses.push({ chatId: String(payload.chat_id), text: payload.text }); return { ok: true, result: { message_id: reponses.length } }; }
  return { ok: true, result: true };
});
bot.botInfo = { id: 123456, is_bot: true, first_name: 'Test', username: 'test_bot', can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business_account: false, has_main_web_app: false };
await setupBot();

let numero = 0;
// Rejoue une commande écrite dans un groupe, comme Telegram l'enverrait.
const commande = (texte, { chatId = config.adminChatId, de = 42 } = {}) => bot.handleUpdate({
  update_id: (numero += 1),
  message: {
    message_id: numero, date: 0, text: texte,
    chat: { id: Number(chatId), type: 'supergroup' },
    from: { id: de, is_bot: false, first_name: 'Modo' },
    entities: [{ type: 'bot_command', offset: 0, length: texte.split(' ')[0].length }],
  },
});
const derniereReponse = () => reponses.at(-1)?.text || '';

const app = express();
app.use(express.json());
app.use('/api', api);
const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api`;
const call = async (user, p, method = 'GET', body) => {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', 'x-dev-user': user }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
const pid = async (id) => (await store.getUser(id))?.pid;

async function membre(id, { name, age = 25, gender = 'femme', intent = 'amitie', city = 'Yaoundé', country = 'CM', verified = true, filters = null }) {
  await call(id, '/me');
  const r = await call(id, '/me/profile', 'PUT', { name, age, gender, intent, city, country, promptA: 'Le ndolé' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  if (verified) await store.updateUser(id, { verification: 'approved' });
  if (filters) await store.updateUser(id, { filters });
}

// ---------- Le cas qui a motivé l'outil ----------

test('le cas du 16 septembre : elle est vérifiée à Yaoundé, et il ne la voit pas', async () => {
  await membre('700001', { name: 'Proprio', gender: 'homme', intent: 'serieux' });
  await membre('700002', { name: 'Nouvelle', gender: 'femme', intent: 'amitie' });
  const r = await expliquerLaDecouverte('700001', '700002');
  assert.equal(r.verrait, false);
  const intention = r.portes.find((p) => p.porte === 'intention');
  assert.equal(intention.ok, false);
  // Le détail nomme les deux valeurs : un « non » sans elles renverrait à deviner.
  assert.match(intention.detail, /Relation sérieuse/);
  assert.match(intention.detail, /Amitié/);
  // Et c'est la seule porte fermée : la zone, le genre, l'âge sont ouverts.
  assert.deepEqual(r.portes.filter((p) => !p.ok).map((p) => p.porte), ['intention']);
});

test('« Yaoundé, Cameroun » n\'est pas « Yaoundé » : la zone le dit avec les deux clés', async () => {
  await membre('700003', { name: 'Ailleurs', gender: 'femme', intent: 'serieux', city: 'Yaoundé, Cameroun' });
  const r = await expliquerLaDecouverte('700001', '700003');
  const zone = r.portes.find((p) => p.porte === 'zone');
  assert.equal(zone.ok, false);
  assert.match(zone.detail, /CM·yaounde/);
  assert.match(zone.detail, /CM·yaounde cameroun/);
});

test('déjà balayée : une carte ne revient pas, et l\'explication le dit', async () => {
  await membre('700004', { name: 'Vue', gender: 'femme', intent: 'serieux' });
  assert.equal((await expliquerLaDecouverte('700001', '700004')).verrait, true, 'avant le balayage, visible');
  await call('700001', '/swipes', 'POST', { targetId: await pid('700004'), action: 'pass' });
  const r = await expliquerLaDecouverte('700001', '700004');
  assert.equal(r.verrait, false);
  assert.match(r.portes.find((p) => p.porte === 'déjà balayé').detail, /déjà passé/);
});

test('un blocage ferme la porte dans les deux sens', async () => {
  await membre('700005', { name: 'Bloquée', gender: 'femme', intent: 'serieux' });
  await call('700005', '/blocks', 'POST', { targetId: await pid('700001') });
  const r = await expliquerLaDecouverte('700001', '700005');
  assert.equal(r.portes.find((p) => p.porte === 'bloqué').ok, false);
});

test('soi-même, compte inconnu, compte sans profil', async () => {
  assert.equal((await expliquerLaDecouverte('700001', '700001')).portes.find((p) => p.porte === 'soi-même').ok, false);
  assert.equal((await expliquerLaDecouverte('700001', '799999')).manque, '799999');
  await call('700006', '/me');
  assert.equal((await expliquerLaDecouverte('700006', '700001')).sansProfil, '700006');
});

// ---------- Le test qui compte : l'égalité avec la vraie route ----------

test('sur des paires au hasard, « toutes les portes ouvertes » vaut exactement « dans le paquet de /discover »', async () => {
  // Un générateur à graine : le même tirage à chaque exécution, pour qu'un échec se rejoue.
  let graine = 20260916;
  const alea = () => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine / 2147483648; };
  const parmi = (xs) => xs[Math.floor(alea() * xs.length)];

  // Trois villes, deux intentions, deux genres : assez de variété pour fermer chaque porte,
  // et des villes assez petites pour qu'aucun paquet ne dépasse dix cartes — /discover les coupe.
  const villes = ['Douala', 'Bafoussam', 'Kribi'];
  const ids = [];
  for (let i = 0; i < 24; i++) {
    const id = String(710000 + i);
    ids.push(id);
    await membre(id, {
      name: `P${i}`, age: 18 + Math.floor(alea() * 30), gender: parmi(['femme', 'homme']),
      intent: parmi(['amitie', 'serieux']), city: parmi(villes), verified: alea() < 0.8,
      filters: alea() < 0.5 ? { ageMin: 18 + Math.floor(alea() * 10), ageMax: 30 + Math.floor(alea() * 20), gender: parmi(['', 'femme', 'homme']), verifiesSeulement: alea() < 0.3 } : null,
    });
  }
  // Quelques balayages et blocages, pour que ces portes-là se ferment aussi parfois.
  for (let i = 0; i < 12; i++) {
    const a = parmi(ids), b = parmi(ids);
    if (a === b) continue;
    if (alea() < 0.7) await call(a, '/swipes', 'POST', { targetId: await pid(b), action: parmi(['like', 'pass']) });
    else await call(a, '/blocks', 'POST', { targetId: await pid(b) });
  }

  let paires = 0, visibles = 0;
  for (const a of ids) {
    const paquet = (await call(a, '/discover')).body;
    if (paquet.profiles === undefined) continue; // compte sans place ici (non membre sous « gate »)
    assert.ok(paquet.profiles.length < 10, 'un paquet coupé à dix fausserait la comparaison');
    const dansLePaquet = new Set(paquet.profiles.map((p) => p.id));
    for (const b of ids) {
      if (a === b) continue;
      const r = await expliquerLaDecouverte(a, b);
      if (r.manque || r.sansProfil) continue;
      const attendu = dansLePaquet.has(await pid(b));
      assert.equal(r.verrait, attendu, `${a} → ${b} : la route dit ${attendu}, l'explication dit ${r.verrait}\n${r.portes.map((p) => `${p.ok ? '✓' : '✗'} ${p.porte} ${p.detail}`).join('\n')}`);
      paires += 1;
      if (attendu) visibles += 1;
    }
  }
  // Le test ne vaut que s'il a vu les deux issues, et en nombre.
  assert.ok(paires > 300, `${paires} paires comparées`);
  assert.ok(visibles > 20 && visibles < paires - 20, `${visibles} visibles sur ${paires} : il faut des deux`);
});

// ---------- La commande du groupe ----------

test('/pourquoi répond dans le groupe, porte par porte, avec un verdict', async () => {
  await commande('/pourquoi 700001 700002');
  const texte = derniereReponse();
  assert.match(texte, /^700001 ne voit pas 700002 : intention\./);
  assert.match(texte, /✗ intention — A cherche « Relation sérieuse », B « Amitié »/);
  assert.match(texte, /✓ zone/);
  assert.match(texte, /✓ âge — B a 25 ans, A cherche 18–99/);
});

test('/pourquoi dit quand A verrait B', async () => {
  await membre('700007', { name: 'Visible', gender: 'femme', intent: 'serieux' });
  await commande('/pourquoi 700001 700007');
  assert.match(derniereReponse(), /^700001 verrait 700007 dans son paquet\./);
});

test('/pourquoi refuse hors du groupe, et refuse un non-administrateur', async () => {
  await commande('/pourquoi 700001 700002', { chatId: 12345 });
  assert.match(derniereReponse(), /groupe de modération/);
  await commande('/pourquoi 700001 700002', { de: 99 });
  assert.match(derniereReponse(), /réservée aux administrateurs/);
  // Et surtout : aucune des deux réponses ne porte la ville ou l'intention de qui que ce soit.
  for (const r of reponses.slice(-2)) assert.ok(!/Yaoundé|Relation sérieuse|Amitié/.test(r.text));
});

test('/pourquoi dit son usage, et nomme un compte inconnu', async () => {
  await commande('/pourquoi');
  assert.match(derniereReponse(), /Usage : \/pourquoi/);
  await commande('/pourquoi 700001 799999');
  assert.match(derniereReponse(), /Aucun compte avec l'identifiant 799999/);
});

test.after(() => server.close());
