// La personne de confiance : ce qu'elle reçoit, et ce qu'elle ne recevra jamais.
//
// Cette fonction fait sortir de l'app des informations vers quelqu'un qui n'en est pas membre.
// Deux règles la tiennent, et ce fichier les éprouve avant tout le reste :
//
// 1. Rien n'est enregistré sans son accord. Un bot ne peut de toute façon pas écrire à quelqu'un
//    qui ne lui a jamais parlé — mais surtout, garder l'identité d'un tiers qui n'a rien demandé
//    serait une donnée personnelle sans consentement.
// 2. Le prénom de l'autre membre ne part jamais. Celui qui organise consent pour lui-même ;
//    l'autre n'a jamais accepté que son prénom parte chez quelqu'un qu'il ne connaît pas.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-confiance-'));
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.WEBAPP_URL = 'https://exemple.test';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.SEED_DEMO = 'false';
process.env.AUTO_APPROVE = 'false';

const express = (await import('express')).default;
const { config, runtime, venues, VENUES_DEMO } = await import('../server/config.js');
const { codeDuLieu } = await import('../server/lieux.js');
venues.push(...VENUES_DEMO);
const { store } = await import('../server/store.js');
const { bot, setupBot } = await import('../server/bot.js');
const { api } = await import('../server/routes.js');
const { PREFIXE, porteurDuCode } = await import('../server/confiance.js');

// Tout ce que le bot envoie passe par là. grammY fabrique une API neuve à chaque update : seul
// un transformeur est recopié sur chacune (voir test/bannissement.test.js).
const envoyes = [];
bot.api.config.use(async (prev, method, payload) => {
  if (method === 'sendMessage') {
    envoyes.push({ a: String(payload.chat_id), texte: payload.text });
    return { ok: true, result: { message_id: envoyes.length } };
  }
  if (method === 'editMessageText') {
    envoyes.push({ a: 'edition', texte: payload.text });
    return { ok: true, result: true };
  }
  return { ok: true, result: true };
});
bot.botInfo = { id: 1, is_bot: true, first_name: 'T', username: 'odo_bot', can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false };
runtime.botUsername = 'odo_bot';
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
async function membre(id, name, gender = 'femme') {
  await call(id, '/me');
  await call(id, '/me/profile', 'PUT', { name, age: 25, gender, intent: 'amitie', city: 'Yaoundé', promptA: 'Le poisson braisé' });
  await store.updateUser(id, { verification: 'approved' });
}
let numero = 0;
const ouvrirLien = (code, de) => bot.handleUpdate({
  update_id: (numero += 1),
  message: { message_id: numero, date: 0, chat: { id: Number(de), type: 'private' }, from: { id: Number(de), is_bot: false, first_name: `Ami ${de}` }, text: `/start ${PREFIXE}${code}`, entities: [{ offset: 0, length: 6, type: 'bot_command' }] },
});
const toucher = (data, de) => bot.handleUpdate({
  update_id: (numero += 1),
  callback_query: { id: String(numero), from: { id: Number(de), is_bot: false, first_name: `Ami ${de}` }, chat_instance: '1', data, message: { message_id: numero, date: 0, chat: { id: Number(de), type: 'private' } } },
});
const commande = (texte, de) => bot.handleUpdate({
  update_id: (numero += 1),
  message: { message_id: numero, date: 0, chat: { id: Number(de), type: 'private' }, from: { id: Number(de), is_bot: false, first_name: `Ami ${de}` }, text: texte, entities: [{ offset: 0, length: texte.length, type: 'bot_command' }] },
});
const recus = (id) => envoyes.filter((m) => m.a === String(id));
const codeDe = async (id) => (await store.getUser(id)).confianceCode?.code;
const attendre = async (f, quoi) => {
  for (let i = 0; i < 60; i += 1) {
    if (await f()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.fail(`jamais arrivé : ${quoi}`);
};

// ---------- Rien avant l'accord ----------

test("demander une invitation n'enregistre personne", async () => {
  await membre('400', 'Awa');
  const r = await call('400', '/me/confiance/invitation', 'POST');
  assert.equal(r.status, 200);
  assert.match(r.body.lien, /^https:\/\/t\.me\/odo_bot\?start=confiance-/);
  assert.equal((await store.getUser('400')).confiance, undefined, 'aucune personne de confiance tant que personne n\'a accepté');
});

test("ouvrir le lien n'enregistre rien non plus : on explique, puis on demande", async () => {
  await ouvrirLien(await codeDe('400'), '401');
  await attendre(async () => recus('401').length > 0, "l'explication");
  const texte = recus('401').at(-1).texte;
  // Ce qu'elle recevra, et ce qu'on garde d'elle : les deux doivent être dits avant qu'elle décide.
  assert.match(texte, /Awa/);
  assert.match(texte, /lieu et l'heure/);
  assert.match(texte, /ton prénom et ton compte Telegram/);
  assert.match(texte, /\/retirer/);
  assert.equal((await store.getUser('400')).confiance, undefined, 'toujours rien enregistré');
});

test('elle accepte : c\'est là, et seulement là, qu\'on enregistre', async () => {
  await toucher('conf:oui:400', '401');
  await attendre(async () => !!(await store.getUser('400')).confiance, "l'accord");
  const c = (await store.getUser('400')).confiance;
  assert.equal(c.id, '401');
  assert.equal(c.prenom, 'Ami 401');
  assert.ok(c.at, 'et quand');
  // Le membre apprend que son filet existe, sinon il ne le saurait jamais.
  await attendre(async () => recus('400').some((m) => /accepté d'être ta personne de confiance/.test(m.texte)), 'le membre prévenu');
});

test("refuser n'enregistre rien, et consomme le lien", async () => {
  await membre('410', 'Bana');
  await call('410', '/me/confiance/invitation', 'POST');
  await ouvrirLien(await codeDe('410'), '411');
  await toucher('conf:non:410', '411');
  await attendre(async () => (await store.getUser('410')).confianceCode === null, 'le code consommé');
  assert.ok(!(await store.getUser('410')).confiance, 'rien enregistré');
});

// ---------- Les portes ----------

test('un lien transféré à plusieurs : le premier qui répond gagne', async () => {
  await membre('420', 'Carine');
  await call('420', '/me/confiance/invitation', 'POST');
  const code = await codeDe('420');
  await ouvrirLien(code, '421');
  await ouvrirLien(code, '422'); // le lien a été transféré

  await toucher('conf:oui:420', '421');
  await attendre(async () => !!(await store.getUser('420')).confiance, 'le premier accord');
  await toucher('conf:oui:420', '422');
  await new Promise((r) => setTimeout(r, 100));
  assert.equal((await store.getUser('420')).confiance.id, '421', 'le second bouton ne remplace pas le premier en silence');
});

test('on ne peut pas se désigner soi-même', async () => {
  await membre('430', 'Diane');
  await call('430', '/me/confiance/invitation', 'POST');
  await toucher('conf:oui:430', '430');
  await new Promise((r) => setTimeout(r, 100));
  assert.ok(!(await store.getUser('430')).confiance, "se désigner soi-même ne protège de rien");
});

test('un lien périmé ne vaut plus rien', async () => {
  await membre('440', 'Élise');
  await call('440', '/me/confiance/invitation', 'POST');
  const u = await store.getUser('440');
  await store.updateUser('440', { confianceCode: { ...u.confianceCode, exp: Date.now() - 1000 } });
  assert.equal(await porteurDuCode(u.confianceCode.code), null);

  await ouvrirLien(u.confianceCode.code, '441');
  await attendre(async () => recus('441').some((m) => /n'est plus valable/.test(m.texte)), 'le refus');
  assert.ok(!(await store.getUser('440')).confiance);
});

// ---------- Ce qui part, et ce qui ne part pas ----------

test("prévenir maintenant ne nomme jamais l'autre personne", async () => {
  await membre('450', 'Fanta');
  await membre('451', 'Gaston', 'homme');
  await call('450', '/me/confiance/invitation', 'POST');
  await ouvrirLien(await codeDe('450'), '452');
  await toucher('conf:oui:450', '452');
  await attendre(async () => !!(await store.getUser('450')).confiance, "l'accord");

  await call('450', '/swipes', 'POST', { targetId: '451', action: 'like' });
  const m = (await call('451', '/swipes', 'POST', { targetId: '450', action: 'like' })).body.match;

  const avant = recus('452').length;
  const r = await call('450', `/matches/${m.id}/prevenir`, 'POST');
  assert.equal(r.status, 200);
  await attendre(async () => recus('452').length > avant, 'le message');

  const texte = recus('452').at(-1).texte;
  assert.match(texte, /Fanta/, 'elle sait de qui il s\'agit');
  assert.ok(!texte.includes('Gaston'), "mais jamais avec qui : Gaston n'a pas consenti à ça");
});

test("sans personne de confiance, prévenir dit quoi faire plutôt que d'échouer", async () => {
  await membre('460', 'Hawa');
  await membre('461', 'Ibrahim', 'homme');
  await call('460', '/swipes', 'POST', { targetId: '461', action: 'like' });
  const m = (await call('461', '/swipes', 'POST', { targetId: '460', action: 'like' })).body.match;

  const r = await call('460', `/matches/${m.id}/prevenir`, 'POST');
  assert.equal(r.status, 409);
  assert.match(r.body.message, /depuis ton profil/);
});

test('un rendez-vous accepté prévient les deux personnes de confiance, sans dire avec qui', async () => {
  const lieu = venues.find((v) => v.city === 'Yaoundé');
  await membre('470', 'Joséphine');
  await membre('471', 'Kevin', 'homme');
  for (const [membreId, amiId] of [['470', '472'], ['471', '473']]) {
    await call(membreId, '/me/confiance/invitation', 'POST');
    await ouvrirLien(await codeDe(membreId), amiId);
    await toucher(`conf:oui:${membreId}`, amiId);
    await attendre(async () => !!(await store.getUser(membreId)).confiance, `accord de ${amiId}`);
  }
  await call('470', '/swipes', 'POST', { targetId: '471', action: 'like' });
  const m = (await call('471', '/swipes', 'POST', { targetId: '470', action: 'like' })).body.match;
  const d = (await call('470', `/matches/${m.id}/dates`, 'POST', { venueId: lieu.id, slot: 'samedi 15h' })).body.date;
  await call('471', `/dates/${d.id}`, 'PUT', { status: 'accepted' });

  for (const [amiId, prenom, autre] of [['472', 'Joséphine', 'Kevin'], ['473', 'Kevin', 'Joséphine']]) {
    await attendre(async () => recus(amiId).some((x) => x.texte.includes('a un rendez-vous')), `le message à ${amiId}`);
    const texte = recus(amiId).filter((x) => x.texte.includes('a un rendez-vous')).at(-1).texte;
    assert.match(texte, new RegExp(prenom), 'le prénom de celle ou celui qui a choisi');
    assert.match(texte, new RegExp(lieu.name), 'le lieu');
    assert.match(texte, /samedi 15h/, "l'heure");
    assert.ok(!texte.includes(autre), `${autre} n'a pas consenti à ce que son prénom parte`);
  }
});

test("l'arrivée sur place est annoncée à la personne de confiance", async () => {
  const lieu = venues.find((v) => v.city === 'Yaoundé');
  const m = (await store.matchesOf('470'))[0];
  const d = (await store.datesOfMatch(m.id))[0];
  const avant = recus('472').length;
  const r = await call('470', `/dates/${d.id}/checkin`, 'POST', { code: codeDuLieu(lieu.id) });
  assert.equal(r.status, 200);
  await attendre(async () => recus('472').some((x) => x.texte.includes('est bien arrivé')), "l'arrivée");
  assert.ok(recus('472').length > avant);
});

// ---------- Se retirer, des deux côtés ----------

test('le membre retire : la personne est prévenue que ça s\'arrête', async () => {
  const avant = recus('452').length;
  const r = await call('450', '/me/confiance', 'DELETE');
  assert.equal(r.status, 200);
  assert.ok(!(await store.getUser('450')).confiance);
  await attendre(async () => recus('452').length > avant, 'le message de fin');
  assert.match(recus('452').at(-1).texte, /plus comme personne de confiance/);
});

test('la personne se retire elle-même depuis le bot', async () => {
  await attendre(async () => !!(await store.getUser('470')).confiance, 'elle est bien en place');
  await commande('/retirer', '472');
  await attendre(async () => !(await store.getUser('470')).confiance, 'le retrait');
  // Le membre l'apprend : son filet a disparu, il doit pouvoir en désigner un autre.
  await attendre(async () => recus('470').some((x) => /ne souhaite plus être ta personne de confiance/.test(x.texte)), 'le membre prévenu');
});

test("/retirer sans rien à retirer le dit, plutôt que de ne rien faire", async () => {
  const avant = recus('999').length;
  await commande('/retirer', '999');
  await attendre(async () => recus('999').length > avant, 'la réponse');
  assert.match(recus('999').at(-1).texte, /Personne ne t'a choisi/);
});

// ---------- L'effacement ----------

test('supprimer son compte emporte la personne de confiance', async () => {
  await membre('480', 'Larissa');
  await call('480', '/me/confiance/invitation', 'POST');
  await ouvrirLien(await codeDe('480'), '481');
  await toucher('conf:oui:480', '481');
  await attendre(async () => !!(await store.getUser('480')).confiance, "l'accord");

  await call('480', '/me', 'DELETE');
  assert.equal(await store.getUser('480'), null, 'le compte est parti, et la personne de confiance avec');
});

test("l'identifiant Telegram de la personne de confiance ne sort jamais du serveur", async () => {
  await membre('490', 'Modeste', 'homme');
  await call('490', '/me/confiance/invitation', 'POST');
  await ouvrirLien(await codeDe('490'), '491');
  await toucher('conf:oui:490', '491');
  await attendre(async () => !!(await store.getUser('490')).confiance, "l'accord");

  const me = (await call('490', '/me')).body;
  assert.equal(me.confiance.prenom, 'Ami 491', 'le prénom suffit à l\'afficher');
  assert.equal(me.confiance.id, undefined, "l'identifiant Telegram reste au serveur, comme celui de n'importe qui");
  assert.ok(!JSON.stringify(me).includes('"491"'), "et il n'apparaît nulle part ailleurs dans la réponse");
});
