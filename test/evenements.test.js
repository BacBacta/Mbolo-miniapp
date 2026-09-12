// Les événements de mesure : ce qu'ils enregistrent, et ce qu'ils n'enregistreront jamais.
//
// audit/05-mesure-produit.md en liste onze, et interdit explicitement trois choses : un événement
// par sondage, un par carte, et un événement d'erreur envoyé au moment de l'erreur. La moitié de
// ce fichier vérifie les interdits, parce que c'est là qu'une mesure dérape — pas dans ce qu'elle
// compte, mais dans ce qu'elle se met à compter sans qu'on l'ait décidé.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-evts-'));
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.WEBAPP_URL = 'https://exemple.test';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.SEED_DEMO = 'false';
process.env.AUTO_APPROVE = 'false';
process.env.ADMIN_CHAT_ID = '-1001234567890';

const express = (await import('express')).default;
const { config } = await import('../server/config.js');
const { store } = await import('../server/store.js');
const { bot, decideVerification } = await import('../server/bot.js');
const { api } = await import('../server/routes.js');
const { chargeValide, semaineIso } = await import('../server/mesure.js');
bot.api.config.use(async () => ({ ok: true, result: { message_id: 1 } }));

const app = express();
app.use(express.json({ limit: '3mb' }));
app.use('/api', api);
const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api`;
test.after(() => server.close());

const call = async (user, p, method = 'GET', body) => {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', 'x-dev-user': user }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
const profil = (name, gender = 'femme') => ({ name, age: 25, gender, intent: 'amitie', city: 'Yaoundé', promptA: 'Le poisson braisé' });
async function membre(id, name, gender) {
  await call(id, '/me');
  await call(id, '/me/profile', 'PUT', profil(name, gender));
  await store.updateUser(id, { verification: 'approved' });
}
const de = async (id, k) => (await store.events({ k })).filter((e) => e.u === String(id));
const attendre = async (f, quoi) => {
  for (let i = 0; i < 60; i += 1) {
    if (await f()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.fail(`jamais arrivé : ${quoi}`);
};

// ---------- L'entonnoir ----------

test('ouvrir, enregistrer un profil, envoyer un selfie : chaque étape laisse sa ligne', async () => {
  await call('800', '/me');
  await attendre(async () => (await de('800', 'app_opened')).length === 1, 'app_opened');

  await call('800', '/me/profile', 'PUT', profil('Awa'));
  await attendre(async () => (await de('800', 'profile_saved')).length === 1, 'profile_saved');

  await call('800', '/me/verification/start', 'POST');
  await call('800', '/me/verification', 'POST', { selfie: JPEG });
  await attendre(async () => (await de('800', 'selfie_sent')).length === 1, 'selfie_sent');
});

// Le plan est formel : une ligne par heure, sinon la discussion qui interroge toutes les quatre
// secondes écrirait des centaines de lignes par heure et par personne, pour une information nulle.
test('app_opened est ralenti : ouvrir dix fois ne fait pas dix lignes', async () => {
  await call('801', '/me');
  await attendre(async () => (await de('801', 'app_opened')).length === 1, 'la première');
  for (let i = 0; i < 10; i += 1) await call('801', '/me');
  assert.equal((await de('801', 'app_opened')).length, 1, 'les dix suivantes ne comptent pas');

  // On recule le dernier passage d'une heure : la ligne suivante repart.
  const u = await store.getUser('801');
  await store.updateUser('801', { lastEventAt: { ...u.lastEventAt, app_opened: Date.now() - 3700e3 } });
  await call('801', '/me');
  await attendre(async () => (await de('801', 'app_opened')).length === 2, 'la seconde, une heure plus tard');
});

test("l'étape du formulaire arrive par l'ouverture, sans requête à elle", async () => {
  await fetch(`${base}/me?tz=Africa/Douala&form_step=2`, { headers: { 'x-dev-user': '802' } });
  await attendre(async () => (await de('802', 'form_step')).length === 1, 'form_step');
  assert.deepEqual((await de('802', 'form_step'))[0].p, { step: 2 });
});

test("une étape hors des trois du formulaire n'est pas enregistrée", async () => {
  for (const v of ['0', '4', '-1', 'deux', '2.5', '']) {
    await fetch(`${base}/me?form_step=${encodeURIComponent(v)}`, { headers: { 'x-dev-user': '803' } });
  }
  assert.equal((await de('803', 'form_step')).length, 0, 'aucune valeur farfelue ne passe');
});

// Le chiffre que le plan dit le plus manquant, et le champ sans lequel il mentirait.
test('la décision de modération porte son délai, et dit si un humain a tranché', async () => {
  await call('810', '/me');
  await call('810', '/me/profile', 'PUT', profil('Bana'));
  await store.updateUser('810', { verification: 'pending', verificationSentAt: Date.now() - 4000 });

  await decideVerification('810', true);
  await attendre(async () => (await de('810', 'verif_decided')).length === 1, 'verif_decided');
  const e = (await de('810', 'verif_decided'))[0];
  assert.equal(e.p.ok, true);
  assert.equal(e.p.auto, false, "AUTO_APPROVE est éteint dans ce fichier : un humain a tranché");
  assert.ok(e.p.ms >= 4000, 'le délai est celui du départ à la décision');
});

test('revenir après un refus laisse une trace', async () => {
  await store.updateUser('810', { verification: 'rejected' });
  await call('810', '/me/verification/start', 'POST');
  await attendre(async () => (await de('810', 'verif_retried')).length === 1, 'verif_retried');
});

// ---------- La découverte ----------

test('un paquet vide dit pourquoi il est vide', async () => {
  await membre('820', 'Carine');
  const r = await call('820', '/discover');
  assert.equal(r.body.profiles.length, 0, 'personne à montrer dans ce fichier');
  await attendre(async () => (await de('820', 'deck_empty')).length >= 1, 'deck_empty');
  assert.equal((await de('820', 'deck_empty'))[0].p.why, 'vide');
});

test('quota épuisé : le paquet vide le dit autrement', async () => {
  await membre('821', 'Diane');
  const faux = Array.from({ length: config.dailyProfiles }, (_, i) => `swipe-${i}`);
  for (const t of faux) await store.addSwipe('821', t, 'like');

  await call('821', '/discover');
  await attendre(async () => (await de('821', 'deck_empty')).some((e) => e.p.why === 'quota'), 'deck_empty quota');
});

test('un paquet servi compte une ligne par paquet, pas une par carte', async () => {
  await membre('830', 'Élise');
  await membre('831', 'Fabrice', 'homme');
  const r = await call('830', '/discover');
  assert.ok(r.body.profiles.length >= 1, 'au moins une carte');

  await attendre(async () => (await de('830', 'deck_served')).length === 1, 'deck_served');
  const e = (await de('830', 'deck_served'))[0];
  assert.equal(e.p.n, r.body.profiles.length, 'le nombre de cartes tient dans la ligne');
  assert.ok(e.p.r > 0, 'et ce qui reste du quota');

  // L'interdit du plan : pas une ligne par carte, et pas une ligne par rechargement d'écran.
  for (let i = 0; i < 5; i += 1) await call('830', '/discover');
  assert.equal((await de('830', 'deck_served')).length, 1, 'cinq rechargements ne font pas cinq lignes');
});

test('le quota atteint laisse une ligne, avec l\'action tentée', async () => {
  await call('821', '/swipes', 'POST', { targetId: '831', action: 'like' });
  await attendre(async () => (await de('821', 'quota_hit')).length === 1, 'quota_hit');
  assert.equal((await de('821', 'quota_hit'))[0].p.action, 'like');
});

// ---------- Ce qui ne doit jamais entrer ----------

// Le plus important du fichier : le filtre anti-arnaque enregistre qu'il a bloqué, jamais quoi.
test("un blocage anti-arnaque enregistre sa catégorie, jamais le message", async () => {
  await membre('840', 'Gaëlle');
  await membre('841', 'Hervé', 'homme');
  await call('840', '/swipes', 'POST', { targetId: '841', action: 'like' });
  const m = (await call('841', '/swipes', 'POST', { targetId: '840', action: 'like' })).body.match;

  const secret = 'envoie-moi 50000 par orange money stp';
  const r = await call('841', `/matches/${m.id}/messages`, 'POST', { text: secret });
  assert.equal(r.status, 422, 'le message est bien bloqué');

  await attendre(async () => (await de('841', 'antiscam_block')).length === 1, 'antiscam_block');
  const e = (await de('841', 'antiscam_block'))[0];
  // Un mot-clé fermé, pas le libellé montré à la personne : celui-ci est de la prose, et il
  // nomme la règle déclenchée — deux choses que le plan interdit d'enregistrer.
  assert.ok(['MONEY_BLOCKED', 'CONTACT_TOO_EARLY'].includes(e.p.c), `code fermé attendu, reçu « ${e.p.c} »`);

  // Le texte ne doit se retrouver nulle part dans la table, sous aucune forme.
  const tout = JSON.stringify(await store.events());
  for (const mot of ['envoie', '50000', 'orange', 'money', secret]) {
    assert.ok(!tout.includes(mot), `« ${mot} » ne doit jamais entrer dans les événements`);
  }
});

test("aucun événement ne porte de prénom, de ville ni de quartier", async () => {
  const tout = JSON.stringify(await store.events());
  for (const mot of ['Awa', 'Bana', 'Carine', 'Diane', 'Élise', 'Fabrice', 'Gaëlle', 'Hervé', 'Yaoundé', 'poisson']) {
    assert.ok(!tout.includes(mot), `« ${mot} » ne doit jamais entrer dans les événements`);
  }
});

// La barrière est dans le code, pas seulement dans la discipline de celui qui appelle.
test('une charge utile qui contient du texte libre est refusée', async () => {
  assert.equal(chargeValide({ c: 'MONEY' }), true);
  assert.equal(chargeValide({ n: 3, r: 12, ok: false }), true);
  assert.equal(chargeValide({ t: 'un message entier avec des espaces' }), false, 'le texte libre est refusé');
  assert.equal(chargeValide({ t: 'a'.repeat(50) }), false, 'une longue chaîne aussi');
  assert.equal(chargeValide({ Majuscule: 1 }), false, 'une clé hors du format est refusée');
  assert.equal(chargeValide([1, 2]), false, 'un tableau est refusé');
});

test('une charge utile refusée ne casse pas la requête qui la portait', async () => {
  const { mesurer } = await import('../server/mesure.js');
  assert.equal(await mesurer('bidon', '850', { t: 'du texte libre interdit' }), null);
  assert.equal((await de('850', 'bidon')).length, 0, 'rien n\'est écrit');
});

// ---------- La suppression du compte ----------

test('supprimer son compte pose une ligne sans identifiant, qui situe une cohorte', async () => {
  await membre('860', 'Ingrid');
  await store.updateUser('860', { createdAt: Date.now() - 30 * 86400e3 });
  const avant = (await store.events({ k: 'account_deleted' })).length;

  await call('860', '/me', 'DELETE');
  const lignes = await store.events({ k: 'account_deleted' });
  assert.equal(lignes.length, avant + 1);
  const e = lignes.at(-1);
  assert.ok(e.u === undefined || e.u === null, 'aucun identifiant');
  assert.equal(e.p.d, 30, 'le nombre de jours vécus');
  assert.match(e.p.c, /^\d{4}-W\d{2}$/, 'la semaine de la cohorte');
  assert.deepEqual((await store.events()).filter((x) => x.u === '860'), [], 'et le reste est parti');
});

test('la semaine ISO tient aux bords de l\'année', () => {
  assert.equal(semaineIso(Date.parse('2027-01-01T12:00:00Z')), '2026-W53');
  assert.equal(semaineIso(Date.parse('2026-01-01T12:00:00Z')), '2026-W01');
  assert.equal(semaineIso(Date.parse('2026-09-12T12:00:00Z')), '2026-W37');
});

// ---------- Le réglage qui éteint tout ----------

test("EVENTS_RETENTION_DAYS à 0 n'écrit rien du tout", async () => {
  const vrai = config.eventsRetentionDays;
  config.eventsRetentionDays = 0;
  try {
    const avant = (await store.events()).length;
    await call('870', '/me');
    await call('870', '/me/profile', 'PUT', profil('Jeanne'));
    await new Promise((r) => setTimeout(r, 50));
    assert.equal((await store.events()).length, avant, 'pas une ligne de plus');
  } finally {
    config.eventsRetentionDays = vrai;
  }
});
