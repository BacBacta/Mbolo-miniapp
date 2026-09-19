// Là où le pass n'est pas vendu, ce qu'il ouvre est offert — et le quota reste.
//
// Décision du propriétaire, 19 septembre 2026 : pas de monétisation dans les pays d'Afrique pour
// l'instant. Ce fichier est le seul qui pose PLUS_SANS_VENTE_PAYS, et il éprouve les deux régimes
// sur le même serveur : un membre au Cameroun (liste) et un membre en Belgique (vente).
//
// Ce qui compte, et qu'aucun autre test ne verrait :
//   1. Les portes s'ouvrent sans pass au Cameroun (liste, likes nommés, paliers, droits), et
//      restent fermées en Belgique — `droitsOuverts()` tranche, pas `estPlus()`.
//   2. Le quota de « J'aime » ne s'ouvre pas : c'est un frein anti-abus, pas une vente.
//   3. Le serveur refuse la vente, pas seulement l'écran : la facture répond 403, et le bot
//      refuse au pre_checkout une facture ouverte avant un changement de pays.
//   4. La page des conditions dit qu'il y a des pays sans pass, et aucun marqueur n'en fuit.
//   5. Sabotage vérifié : remplacer `droitsOuverts` par `estPlus` dans `requirePlus` fait tomber
//      le point 1 ; retirer le contrôle de la facture fait tomber le point 3.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-pass-pays-'));
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.WEBAPP_URL = 'https://exemple.test';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.SEED_DEMO = 'false';
process.env.AUTO_APPROVE = 'false';
process.env.ADMIN_CHAT_ID = '-100777';
process.env.RATE_LIMIT = 'false';
process.env.PLUS_PRIX_STARS = '7:99,30:299,90:699';
// « afrique », un code en minuscules, et une valeur illisible qui doit être ignorée sans casser.
process.env.PLUS_SANS_VENTE_PAYS = 'afrique, ma, Atlantide';

const express = (await import('express')).default;
const { store } = await import('../server/store.js');
const { config } = await import('../server/config.js');
const { AFRIQUE } = await import('../server/geo.js');
const { estPlus, passEnVente, droitsOuverts, PAYS_SANS_VENTE, prolonger, chargeUtile } = await import('../server/plus.js');
const { bot, setupBot } = await import('../server/bot.js');
const { api } = await import('../server/routes.js');

const reponsesPreCheckout = [];
const factures = [];
bot.api.config.use(async (prev, method, payload) => {
  if (method === 'createInvoiceLink') { factures.push(payload); return { ok: true, result: `https://t.me/$facture${factures.length}` }; }
  if (method === 'answerPreCheckoutQuery') { reponsesPreCheckout.push({ ok: payload.ok, error_message: payload.error_message }); return { ok: true, result: true }; }
  if (method === 'getChatAdministrators') return { ok: true, result: [] };
  return { ok: true, result: { message_id: 1 } };
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
async function membre(id, name, country, gender = 'femme') {
  await call(id, '/me');
  const r = await call(id, '/me/profile', 'PUT', { name, age: 25, gender, intent: 'amitie', country, city: country === 'BE' ? 'Bruxelles' : 'Douala', promptA: 'Le poisson braisé' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  await store.updateUser(id, { verification: 'approved' });
}
let updateId = 1;
const preCheckout = (de, payload) => bot.handleUpdate({
  update_id: updateId++,
  pre_checkout_query: { id: `q${updateId}`, from: { id: Number(de), is_bot: false, first_name: 'P' }, currency: 'XTR', total_amount: 299, invoice_payload: payload },
});

test.after(() => server.close());

test('la liste se lit : « afrique » se déplie, un code se range, l\'illisible est ignoré', () => {
  assert.equal(AFRIQUE.length, 55, 'les 54 États et le Sahara occidental');
  assert.ok(AFRIQUE.includes('CM') && AFRIQUE.includes('ZA') && AFRIQUE.includes('EH'));
  assert.ok(!AFRIQUE.includes('RE') && !AFRIQUE.includes('YT'), 'pas les territoires européens');
  for (const c of AFRIQUE) assert.ok(PAYS_SANS_VENTE.has(c), c);
  assert.ok(PAYS_SANS_VENTE.has('MA'), 'un code en minuscules est accepté');
  assert.ok(!PAYS_SANS_VENTE.has('BE') && !PAYS_SANS_VENTE.has('FR'));
  assert.equal(PAYS_SANS_VENTE.size, 55, 'Atlantide n\'a rien ajouté, MA était déjà dans afrique');
});

test('passEnVente() lit le pays déclaré, et le pays par défaut avant le profil', () => {
  assert.equal(passEnVente({ profile: { country: 'CM' } }), false);
  assert.equal(passEnVente({ profile: { country: 'BE' } }), true);
  assert.equal(passEnVente({}), config.defaultCountry === 'CM' ? false : true, 'sans profil : le pays par défaut du serveur');
  // droitsOuverts : un pass, ou pas de vente. Ni l'un ni l'autre : fermé.
  const t0 = 1_700_000_000_000;
  assert.equal(droitsOuverts({ profile: { country: 'BE' } }, t0), false);
  assert.equal(droitsOuverts({ profile: { country: 'CM' } }, t0), true);
  assert.equal(droitsOuverts({ profile: { country: 'BE' }, plus: { finLe: t0 + 1000 } }, t0), true);
  assert.equal(estPlus({ profile: { country: 'CM' } }, t0), false, 'offert n\'est pas « a un pass » : le quota lit celle-ci');
});

test('au Cameroun, les portes sont ouvertes sans pass ; en Belgique, elles restent fermées', async () => {
  await membre('9101', 'Awa', 'CM');
  await membre('9102', 'Lise', 'BE');
  const cm = (await call('9101', '/me')).body;
  const be = (await call('9102', '/me')).body;
  assert.equal(cm.options.passEnVente, false);
  assert.equal(be.options.passEnVente, true);
  assert.equal(cm.plus.actif, false, 'offert n\'est pas un pass');
  assert.deepEqual(cm.plus.offres, [], 'aucun prix ne part vers un pays sans vente');
  assert.equal(cm.plus.conseillee, null);
  assert.ok(be.plus.offres.length >= 3, 'la grille part là où le pass se vend');
  for (const d of ['liste', 'paysEntier', 'filtreLangue', 'ordreDuPaquet']) {
    assert.equal(cm.limites[d], true, `${d} ouvert au Cameroun`);
    assert.equal(be.limites[d], false, `${d} fermé en Belgique`);
  }
  assert.equal(cm.limites.photos, 6); assert.equal(be.limites.photos, 2);
  assert.equal(cm.limites.voixSecondes, 30); assert.equal(be.limites.voixSecondes, 15);
  assert.equal(cm.limites.questions, 3); assert.equal(be.limites.questions, 1);
  // La vue Liste : la route elle-même, pas seulement le drapeau.
  assert.equal((await call('9101', '/profiles')).status, 200, 'la Liste s\'ouvre au Cameroun');
  const refus = await call('9102', '/profiles');
  assert.equal(refus.status, 403); assert.equal(refus.body.code, 'PASS_REQUIS');
  // Qui t'a aimé : nommé au Cameroun, flouté en Belgique.
  await membre('9103', 'Bilé', 'CM', 'homme');
  await membre('9104', 'Jan', 'BE', 'homme');
  await call('9103', '/swipes', 'POST', { targetId: (await store.getUser('9101')).pid, action: 'like' });
  await call('9104', '/swipes', 'POST', { targetId: (await store.getUser('9102')).pid, action: 'like' });
  const likesCm = (await call('9101', '/likes')).body;
  const likesBe = (await call('9102', '/likes')).body;
  assert.equal(likesCm.flou, false); assert.equal(likesCm.profiles[0]?.name, 'Bilé');
  assert.equal(likesBe.flou, true); assert.deepEqual(likesBe.profiles, []);
});

test("le quota de « J'aime » garde ses marches là où le pass est offert : c'est un frein, pas une vente", async () => {
  await membre('9111', 'Nadia', 'CM');
  // Le quota se lit sur /me, que la personne ait ou non le droit d'entrer (sous « gate », la
  // découverte refuse un compte sans badge — c'est justement lui qu'on veut lire).
  assert.equal((await call('9111', '/me')).body.quota, config.dailyProfiles, 'vérifiée : la marche haute, pas « sans limite »');
  await store.updateUser('9111', { verification: 'none' });
  assert.equal((await call('9111', '/me')).body.quota, config.dailyProfilesNonVerifie, 'sans badge : la marche basse');
  // Un vrai pass, lui, enlève le compteur, au Cameroun comme ailleurs.
  await store.updateUser('9111', { plus: prolonger(await store.getUser('9111'), { jours: 30, source: 'gift' }) });
  assert.equal((await call('9111', '/me')).body.quota, null);
});

test('le serveur refuse la vente : la facture, puis le pre_checkout d\'une facture ancienne', async () => {
  await membre('9121', 'Fatou', 'CM');
  await membre('9122', 'Emma', 'BE');
  const r = await call('9121', '/plus/facture', 'POST', { jours: 30 });
  assert.equal(r.status, 403); assert.equal(r.body.code, 'PASS_INDISPONIBLE');
  assert.equal(factures.length, 0, 'aucune facture n\'a été demandée à Telegram');
  const ok = await call('9122', '/plus/facture', 'POST', { jours: 30 });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(factures.length, 1, 'la Belgique, elle, est facturée');
  // Emma déménage au Cameroun entre la facture et le paiement : Telegram demande « toujours bon ? »
  await call('9122', '/me/profile', 'PUT', { name: 'Emma', age: 25, gender: 'femme', intent: 'amitie', country: 'CM', city: 'Douala', promptA: 'Le poisson braisé' });
  reponsesPreCheckout.length = 0;
  await preCheckout('9122', chargeUtile(30, '9122'));
  assert.equal(reponsesPreCheckout.length, 1);
  assert.equal(reponsesPreCheckout[0].ok, false, 'on ne débite pas ce qu\'on n\'aurait pas vendu');
  assert.match(reponsesPreCheckout[0].error_message, /pas proposé dans ton pays/);
  // Et l'écran du pass ne reçoit aucune offre.
  assert.deepEqual((await call('9121', '/plus')).body.offres, []);
});

test('les conditions disent qu\'il y a des pays sans pass, sans laisser fuir un marqueur', async () => {
  const port = await new Promise((resolve) => { const s = net.createServer(); s.listen(0, () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
  const lire = async (sansVente) => {
    const serveur = spawn(process.execPath, ['server/index.js'], {
      stdio: 'ignore',
      env: { ...process.env, DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-pass-pages-')), USE_WEBHOOK: 'false', NODE_ENV: 'development', ADMIN_CHAT_ID: '', DATABASE_URL: '', PORT: String(port), PLUS_SANS_VENTE_PAYS: sansVente },
    });
    try {
      for (let i = 0; i < 100; i += 1) { try { if ((await fetch(`http://localhost:${port}/health`)).ok) break; } catch { /* pas prêt */ } await new Promise((r) => setTimeout(r, 100)); }
      return await (await fetch(`http://localhost:${port}/conditions`)).text();
    } finally { serveur.kill(); await new Promise((r) => setTimeout(r, 200)); }
  };
  const avec = await lire('afrique');
  assert.match(avec, /Dans certains pays, le pass n'est pas proposé/);
  assert.ok(!/SI_PASS/.test(avec), 'aucun marqueur ne doit fuir dans la page');
  const sans = await lire('');
  assert.ok(!/Dans certains pays, le pass n'est pas proposé/.test(sans), 'vendu partout : la phrase ne part pas');
  assert.ok(!/SI_PASS/.test(sans));
});
