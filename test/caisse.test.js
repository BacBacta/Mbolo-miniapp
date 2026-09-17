// La caisse du pass : Telegram Stars, dans Telegram, et rien d'autre.
//
// Ce que ce fichier fige, dans l'ordre où l'argent circule :
//   1. la grille vient de la configuration, et une ligne illisible est ignorée, pas devinée ;
//   2. une facture ne se fabrique que pour une durée vendue, à son prix, avec une charge utile
//      que le serveur sait relire ;
//   3. avant de débiter, le bot revérifie **le prix du moment** : une facture faite hier à
//      l'ancien prix est refusée, pas honorée à un tarif qui n'existe plus ;
//   4. un paiement reçu pose le pass **sur qui a payé**, s'empile, laisse une ligne de paiement,
//      et une livraison rejouée (le même identifiant Telegram deux fois) ne crédite qu'une fois ;
//   5. un remboursement rend les Stars, retire les jours, jamais en dessous d'aujourd'hui ;
//   6. supprimer le compte garde la pièce comptable, sans personne derrière.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-caisse-'));
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.WEBAPP_URL = 'https://exemple.test';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.SEED_DEMO = 'false';
process.env.AUTO_APPROVE = 'false';
process.env.ADMIN_CHAT_ID = '-100777';
process.env.RATE_LIMIT = 'false';
// Une grille volontairement tordue : une ligne illisible, une hors bornes, un doublon.
process.env.PLUS_PRIX_STARS = '7:99, 30:299, trente:3, 90:699, 30:1, 500:10';

const express = (await import('express')).default;
const { store } = await import('../server/store.js');
const { estPlus, OFFRES, OFFRE_CONSEILLEE, offre, chargeUtile, lireChargeUtile, retirer, prolonger } = await import('../server/plus.js');
const { bot, setupBot } = await import('../server/bot.js');
const { api } = await import('../server/routes.js');

// Le bot ne parle pas à Telegram : chaque appel d'API est capturé par un transformateur, le
// seul chemin qui voie aussi les appels faits depuis un contexte (ctx.reply, ctx.answer…).
const envoyes = [];
const factures = [];
const reponsesPreCheckout = [];
const remboursements = [];
bot.api.config.use(async (prev, method, payload) => {
  if (method === 'sendMessage') { envoyes.push({ chatId: String(payload.chat_id), text: payload.text, opts: payload }); return { ok: true, result: { message_id: envoyes.length } }; }
  if (method === 'createInvoiceLink') { factures.push(payload); return { ok: true, result: `https://t.me/$facture${factures.length}` }; }
  if (method === 'answerPreCheckoutQuery') { reponsesPreCheckout.push({ id: payload.pre_checkout_query_id, ok: payload.ok, error_message: payload.error_message }); return { ok: true, result: true }; }
  if (method === 'refundStarPayment') { remboursements.push({ userId: payload.user_id, chargeId: payload.telegram_payment_charge_id }); return { ok: true, result: true }; }
  if (method === 'getChatAdministrators') return { ok: true, result: [{ status: 'administrator', user: { id: 555001, is_bot: false, first_name: 'Modo' } }] };
  return { ok: true, result: true };
});
await setupBot();
bot.botInfo = { id: 123456, is_bot: true, first_name: 'Test', username: 'test_bot', can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false, can_connect_to_business_account: false, has_main_web_app: false };

const app = express();
app.use(express.json());
app.use('/api', api);
const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api`;
const call = async (user, p, method = 'GET', body) => {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', 'x-dev-user': user }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
async function membre(id, name) {
  await call(id, '/me');
  await call(id, '/me/profile', 'PUT', { name, age: 25, gender: 'femme', intent: 'amitie', city: 'Douala', promptA: 'Le poisson braisé' });
  await store.updateUser(id, { verification: 'approved' });
}
let updateId = 1;
const preCheckout = (de, { payload, amount = 299, currency = 'XTR', id = 'q1' }) => bot.handleUpdate({
  update_id: updateId++,
  pre_checkout_query: { id, from: { id: Number(de), is_bot: false, first_name: 'P' }, currency, total_amount: amount, invoice_payload: payload },
});
const paiement = (de, { payload, amount = 299, charge }) => bot.handleUpdate({
  update_id: updateId++,
  message: {
    message_id: updateId, date: Math.floor(Date.now() / 1000), chat: { id: Number(de), type: 'private' }, from: { id: Number(de), is_bot: false, first_name: 'P' },
    successful_payment: { currency: 'XTR', total_amount: amount, invoice_payload: payload, telegram_payment_charge_id: charge, provider_payment_charge_id: `p-${charge}` },
  },
});
const commande = (texte, de = 555001) => bot.handleUpdate({
  update_id: updateId++,
  message: { message_id: updateId, date: Math.floor(Date.now() / 1000), chat: { id: -100777, type: 'supergroup' }, from: { id: de, is_bot: false, first_name: 'Modo' }, text: texte, entities: [{ type: 'bot_command', offset: 0, length: texte.split(' ')[0].length }] },
});
const attendre = (ms = 60) => new Promise((r) => setTimeout(r, ms));
const JOUR = 24 * 3600 * 1000;

test.after(() => server.close());

test('la grille vient de la configuration : trois durées lisibles, le reste ignoré', () => {
  assert.deepEqual(OFFRES, [{ jours: 7, stars: 99 }, { jours: 30, stars: 299 }, { jours: 90, stars: 699 }], 'illisible, hors bornes et doublon sont écartés');
  assert.equal(OFFRE_CONSEILLEE, 30, 'celle du milieu est mise en avant');
  assert.deepEqual(offre(30), { jours: 30, stars: 299 });
  assert.equal(offre(15), null);
  assert.deepEqual(lireChargeUtile(chargeUtile(30, '42')), { jours: 30, userId: '42' });
  assert.equal(lireChargeUtile('plus:1:30'), null, 'une charge utile tronquée ne se lit pas');
  assert.equal(lireChargeUtile('autre:1:30:42'), null);
});

test("une facture ne se fabrique que pour une durée vendue, à son prix, pour un membre", async () => {
  await membre('8801', 'Awa');
  assert.equal((await call('8801', '/plus/facture', 'POST', { jours: 15 })).status, 400, 'quinze jours ne sont pas vendus');
  assert.equal((await call('8801', '/plus/facture', 'POST', { jours: '30' })).status, 200);
  const f = factures.at(-1);
  assert.equal(f.currency, 'XTR', 'des Stars, jamais une autre devise dans la mini app');
  assert.deepEqual(f.prices, [{ label: '30 jours', amount: 299 }]);
  assert.deepEqual(lireChargeUtile(f.payload), { jours: 30, userId: '8801' });
  assert.match(f.title, /Plus · 30 jours/);
  // Quelqu'un sans profil n'a rien à acheter.
  await call('8802', '/me');
  assert.equal((await call('8802', '/plus/facture', 'POST', { jours: 30 })).status, 403);
});

test('avant de débiter, le bot revérifie le prix du moment', async () => {
  await preCheckout('8801', { payload: chargeUtile(30, '8801'), amount: 299 });
  assert.equal(reponsesPreCheckout.at(-1).ok, true);
  await preCheckout('8801', { payload: chargeUtile(30, '8801'), amount: 199, id: 'q2' });
  assert.equal(reponsesPreCheckout.at(-1).ok, false, 'un montant qui n\'est plus celui de la grille est refusé');
  assert.match(reponsesPreCheckout.at(-1).error_message, /prix a changé/);
  await preCheckout('8801', { payload: chargeUtile(30, '8801'), amount: 299, currency: 'EUR', id: 'q3' });
  assert.equal(reponsesPreCheckout.at(-1).ok, false, 'une autre devise que XTR est refusée');
  await preCheckout('8801', { payload: 'plus:1:15:8801', amount: 299, id: 'q4' });
  assert.equal(reponsesPreCheckout.at(-1).ok, false, 'une durée qui n\'est plus vendue est refusée');
  await store.updateUser('8801', { banned: { at: Date.now(), by: 'test', reason: 'test' } });
  await preCheckout('8801', { payload: chargeUtile(30, '8801'), amount: 299, id: 'q5' });
  assert.equal(reponsesPreCheckout.at(-1).ok, false, 'un compte fermé ne prend pas de pass');
  await store.updateUser('8801', { banned: null });
});

test('un paiement reçu pose le pass sur qui a payé, s\'empile, et ne se compte qu\'une fois', async () => {
  const avant = envoyes.length;
  await paiement('8801', { payload: chargeUtile(30, '8801'), charge: 'ch_001' });
  let u = await store.getUser('8801');
  assert.ok(estPlus(u), 'le pass est posé');
  assert.equal(u.plus.source, 'stars');
  const fin1 = u.plus.finLe;
  assert.ok(Math.abs(fin1 - (Date.now() + 30 * JOUR)) < 5000);
  const ligne = (await store.paiementsDe('8801'))[0];
  assert.equal(ligne.chargeId, 'ch_001');
  assert.equal(ligne.jours, 30);
  assert.equal(ligne.stars, 299);
  assert.equal(ligne.statut, 'paye');
  // Le reçu part à la personne, dans sa langue, avec la fin des six caractères de la référence ;
  // et la modération voit la ligne.
  const recu = envoyes.slice(avant).find((m) => m.chatId === '8801');
  assert.ok(recu, 'un reçu est envoyé');
  assert.match(recu.text, /Merci.*actif jusqu.*Reçu : ch_001/s);
  assert.ok(envoyes.slice(avant).some((m) => m.chatId === '-100777' && /Pass 30 j acheté \(299 Stars\) par 8801/.test(m.text)), 'la modération voit la vente');

  // Le même paiement livré deux fois : une seule ligne, aucun jour de plus.
  await paiement('8801', { payload: chargeUtile(30, '8801'), charge: 'ch_001' });
  u = await store.getUser('8801');
  assert.equal(u.plus.finLe, fin1, 'un webhook rejoué ne crédite pas deux fois');
  assert.equal((await store.paiementsDe('8801')).length, 1);

  // Un second achat, pendant que le premier court : les jours s'ajoutent à la fin.
  await paiement('8801', { payload: chargeUtile(7, '8801'), amount: 99, charge: 'ch_002' });
  u = await store.getUser('8801');
  assert.equal(u.plus.finLe, fin1 + 7 * JOUR, 'il s\'empile');
  assert.equal((await store.paiementsDe('8801')).length, 2);

  // Une facture demandée par 8801 mais payée par 8803 : le pass va à qui a payé.
  await membre('8803', 'Bea');
  await paiement('8803', { payload: chargeUtile(7, '8801'), amount: 99, charge: 'ch_003' });
  assert.ok(estPlus(await store.getUser('8803')), 'qui paie reçoit');
  assert.equal((await store.getUser('8801')).plus.finLe, fin1 + 7 * JOUR, 'et pas l\'autre');
});

test('un paiement sans pass possible est signalé à la modération, jamais avalé', async () => {
  const avant = envoyes.length;
  await paiement('8801', { payload: 'plus:1:15:8801', amount: 299, charge: 'ch_bizarre' });
  const alerte = envoyes.slice(avant).find((m) => m.chatId === '-100777');
  assert.ok(alerte && /sans pass possible/.test(alerte.text) && /ch_bizarre/.test(alerte.text), 'la référence est dans le groupe, prête pour /rembourser');
  assert.equal(await store.paiementParCharge('ch_bizarre'), null, 'et rien n\'est crédité');
});

test('rembourser rend les Stars et retire les jours, jamais en dessous d\'aujourd\'hui', async () => {
  // La règle pure d'abord.
  const t0 = 1_700_000_000_000;
  const u = { plus: prolonger({}, { jours: 30 }, t0) };
  assert.equal(retirer(u, 7, t0).finLe, t0 + 23 * JOUR);
  assert.equal(retirer(u, 30, t0), null, 'plus aucun jour devant : le pass disparaît');
  assert.equal(retirer(u, 90, t0 + 10 * JOUR), null, 'et jamais une dette');
  assert.equal(retirer({}, 7, t0), null);

  // Puis la commande, depuis le groupe.
  const finAvant = (await store.getUser('8801')).plus.finLe;
  await commande('/rembourser ch_002');
  await attendre();
  assert.deepEqual(remboursements.at(-1), { userId: 8801, chargeId: 'ch_002' }, 'Telegram est appelé avec le compte et la référence');
  assert.equal((await store.paiementParCharge('ch_002')).statut, 'rembourse');
  assert.equal((await store.getUser('8801')).plus.finLe, finAvant - 7 * JOUR, 'les sept jours remboursés sont retirés');
  assert.ok(envoyes.some((m) => m.chatId === '8801' && /remboursé/.test(m.text)), 'la personne est prévenue');
  // Deux fois : refusé, sans second appel à Telegram.
  const n = remboursements.length;
  await commande('/rembourser ch_002');
  await attendre();
  assert.equal(remboursements.length, n);
  assert.ok(envoyes.at(-1).text.includes('déjà été remboursé'));
  await commande('/rembourser ch_inconnu');
  await attendre();
  assert.match(envoyes.at(-1).text, /Aucun paiement/);
});

test('/paysupport montre ses reçus, et /aidepaiement transmet à l\'équipe', async () => {
  const avant = envoyes.length;
  await bot.handleUpdate({ update_id: updateId++, message: { message_id: updateId, date: 1, chat: { id: 8801, type: 'private' }, from: { id: 8801, is_bot: false, first_name: 'A' }, text: '/paysupport', entities: [{ type: 'bot_command', offset: 0, length: 11 }] } });
  await attendre();
  const recus = envoyes.slice(avant).find((m) => m.chatId === '8801');
  assert.ok(recus && /ch_001/.test(recus.text) && /remboursé/.test(recus.text), 'le reçu payé et le remboursé se lisent');
  await bot.handleUpdate({ update_id: updateId++, message: { message_id: updateId, date: 1, chat: { id: 8801, type: 'private' }, from: { id: 8801, is_bot: false, first_name: 'A' }, text: '/aidepaiement je n\'ai pas reçu mon pass', entities: [{ type: 'bot_command', offset: 0, length: 13 }] } });
  await attendre();
  assert.ok(envoyes.some((m) => m.chatId === '-100777' && /Aide paiement demandée par 8801 : je n'ai pas reçu mon pass/.test(m.text)));
});

test('l\'écran du pass laisse une trace de sa porte, et rend les reçus sans la référence entière', async () => {
  const r = await call('8801', '/plus?quoi=likes');
  assert.equal(r.status, 200);
  assert.equal(r.body.actif, true);
  assert.deepEqual(r.body.offres.map((o) => o.jours), [7, 30, 90]);
  assert.ok(r.body.achats.length >= 2);
  assert.ok(r.body.achats.every((a) => a.ref.length === 6 && !('chargeId' in a)), 'six caractères, pas la référence entière');
  const vus = (await store.events({ k: 'pass_vu' })).filter((e) => e.u === '8801');
  assert.equal(vus.length, 1);
  assert.deepEqual(vus[0].p, { quoi: 'likes' });
  await call('8801', '/plus?quoi=likes');
  assert.equal((await store.events({ k: 'pass_vu' })).filter((e) => e.u === '8801').length, 1, 'ralenti par porte : la même porte deux fois ne compte qu\'une');
  await call('8801', '/plus?quoi=<script>');
  const tous = (await store.events({ k: 'pass_vu' })).filter((e) => e.u === '8801');
  assert.equal(tous.length, 2, 'une autre porte compte à part');
  assert.deepEqual(tous[1].p, { quoi: 'profil' }, 'et une porte inconnue devient la porte par défaut, jamais le texte reçu');
});

test('supprimer le compte garde la pièce comptable, sans personne derrière', async () => {
  const avant = (await store.paiements()).filter((p) => p.chargeId === 'ch_001');
  assert.equal(avant.length, 1);
  await call('8801', '/me', 'DELETE');
  const apres = (await store.paiements()).find((p) => p.chargeId === 'ch_001');
  assert.ok(apres, 'la ligne reste');
  assert.equal(apres.userId, null, 'mais ne désigne plus personne');
  assert.deepEqual(await store.paiementsDe('8801'), []);
});
