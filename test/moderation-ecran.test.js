// L'écran de modération : ce qu'il montre, et surtout ce qu'il ne montre pas.
//
// Afficher le fil d'une discussion signalée, c'est donner à lire ce que deux personnes se sont
// dit. Trois choses doivent tenir : le fil est celui du signalement et d'aucun autre, chaque
// lecture laisse une trace, et une discussion défaite ne se relit pas. Le reste — files,
// compteurs — se vérifie aussi, mais c'est la partie facile.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-modecran-'));
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
const { bot } = await import('../server/bot.js');
const { api } = await import('../server/routes.js');
const { modApi, creerPageModeration, creerLienModeration, oublierLesAdmins } = await import('../server/moderation.js');

let admins = ['600'];
bot.api.config.use(async (prev, method) => {
  if (method === 'getChatAdministrators') return { ok: true, result: admins.map((id) => ({ status: 'administrator', user: { id: Number(id), is_bot: false, first_name: `Admin ${id}` } })) };
  return { ok: true, result: method === 'sendMessage' ? { message_id: 1 } : true };
});

const app = express();
app.use(express.json());
app.use('/api/mod', modApi);
app.use('/api', api);
app.get('/moderation', creerPageModeration('v1'));
const server = app.listen(0);
const base = `http://localhost:${server.address().port}`;
test.after(() => server.close());

const aller = (chemin, cookie) => fetch(base + chemin, { redirect: 'manual', headers: cookie ? { cookie } : {} });
const html = async (chemin, cookie) => {
  const r = await aller(chemin, cookie);
  return { status: r.status, texte: await r.text() };
};

async function membre(id, name, gender = 'femme') {
  await fetch(`${base}/api/me`, { headers: { 'x-dev-user': id } });
  await fetch(`${base}/api/me/profile`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-dev-user': id }, body: JSON.stringify({ name, age: 25, gender, intent: 'amitie', city: 'Yaoundé', promptA: 'Le poisson braisé' }) });
  await store.updateUser(id, { verification: 'approved' });
}
const ecrire = (de, matchId, text) => fetch(`${base}/api/matches/${matchId}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dev-user': de }, body: JSON.stringify({ text }) });

async function matcher(a, b) {
  await fetch(`${base}/api/swipes`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dev-user': a }, body: JSON.stringify({ targetId: b, action: 'like' }) });
  const r = await fetch(`${base}/api/swipes`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dev-user': b }, body: JSON.stringify({ targetId: a, action: 'like' }) });
  return (await r.json()).match;
}

let cookie = '';
test('ouvrir une session', async () => {
  await store.upsertTelegramUser({ id: '600', first_name: 'Modo' });
  oublierLesAdmins();
  const lien = await creerLienModeration('600');
  const r = await aller(`/moderation?jeton=${encodeURIComponent(new URL(lien).searchParams.get('jeton'))}`);
  cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  assert.ok(cookie, 'la session est ouverte');
});

test("l'accueil compte, et les onglets mènent quelque part", async () => {
  await membre('601', 'Awa');
  await store.updateUser('601', { verification: 'pending', verificationSentAt: Date.now(), pendingGesture: 'deux doigts levés' });

  const { status, texte } = await html('/moderation', cookie);
  assert.equal(status, 200);
  assert.match(texte, /Session ouverte au nom de Modo/);
  for (const vue of ['verifications', 'signalements', 'comptes']) {
    assert.ok(texte.includes(`/moderation?vue=${vue}`), `l'onglet ${vue} est là`);
  }
});

test('la file de vérification dit qui attend, sans montrer de selfie', async () => {
  const { texte } = await html('/moderation?vue=verifications', cookie);
  assert.match(texte, /Awa/);
  assert.match(texte, /deux doigts levés/);
  // La promesse : le selfie ne sort pas du groupe Telegram.
  assert.ok(!/<img|selfie\.jpg|base64/i.test(texte), "aucune image n'est servie");
  assert.match(texte, /dans le groupe Telegram/, 'la page dit où se prend la décision');
});

// Le cœur de l'écran, et ce qui justifie la réécriture de la politique de confidentialité.
test('le fil signalé se lit, et lui seul', async () => {
  await membre('610', 'Bana');
  await membre('611', 'Cyrille', 'homme');
  const m = await matcher('610', '611');
  await ecrire('611', m.id, 'Salut, tu viens de Yaoundé');
  await ecrire('610', m.id, 'Oui, quartier Bastos');

  // Une seconde discussion, sans rapport : elle ne doit pas apparaître.
  await membre('612', 'Diane');
  const autre = await matcher('612', '611');
  await ecrire('611', autre.id, 'Message qui ne regarde personne');

  await fetch(`${base}/api/reports`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dev-user': '610' }, body: JSON.stringify({ targetId: '611', reason: 'comportement déplacé', matchId: m.id }) });
  const signalement = (await store.reports()).at(-1);

  const { status, texte } = await html(`/moderation?signalement=${signalement.id}`, cookie);
  assert.equal(status, 200);
  assert.match(texte, /Salut, tu viens de Yaoundé/);
  assert.match(texte, /Oui, quartier Bastos/);
  assert.ok(!texte.includes('Message qui ne regarde personne'), "l'autre discussion reste fermée");
});

test('chaque lecture du fil laisse une trace', async () => {
  const avant = (await store.reports()).at(-1);
  const dejaLu = avant.lectures?.length || 0;

  await html(`/moderation?signalement=${avant.id}`, cookie);
  const apres = (await store.reports()).at(-1);
  assert.equal(apres.lectures.length, dejaLu + 1, 'une lecture de plus');
  assert.equal(apres.lectures.at(-1).par, '600', 'et on sait qui');
  assert.ok(apres.lectures.at(-1).at, 'et quand');

  const { texte } = await html('/moderation?vue=signalements', cookie);
  assert.match(texte, /lu \d+ fois/, 'la liste le montre');
});

// Une discussion défaite emporte ses messages. La page doit le dire au lieu d'afficher du vide.
test("un fil défait ne se relit pas, et la page l'explique", async () => {
  const signalement = (await store.reports()).at(-1);
  await store.removeMatch(signalement.matchId);

  const { status, texte } = await html(`/moderation?signalement=${signalement.id}`, cookie);
  assert.equal(status, 200);
  assert.ok(!texte.includes('quartier Bastos'), 'les messages sont partis');
  assert.match(texte, /n'existe plus/);
  assert.match(texte, /aucune copie/);
});

test('un signalement sans discussion ne propose pas de fil', async () => {
  await membre('620', 'Élise');
  await membre('621', 'Fabrice', 'homme');
  await fetch(`${base}/api/reports`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dev-user': '620' }, body: JSON.stringify({ targetId: '621', reason: 'usurpation' }) });

  const { texte } = await html('/moderation?vue=signalements', cookie);
  assert.match(texte, /Aucune discussion rattachée/);
});

test('les comptes fermés disent qui a décidé, quand et pourquoi', async () => {
  await membre('630', 'Gaston', 'homme');
  await store.banUser('630', { motif: 'demande argent', par: 'Modo' });

  const { texte } = await html('/moderation?vue=comptes', cookie);
  assert.match(texte, /Gaston/);
  assert.match(texte, /demande argent/);
  assert.match(texte, /par Modo/);
});

// Toute la porte de la PR précédente doit tenir sur les nouvelles vues, pas seulement l'accueil.
test('sans session, aucune vue ne s\'ouvre', async () => {
  for (const chemin of ['/moderation', '/moderation?vue=verifications', '/moderation?vue=signalements', '/moderation?vue=comptes']) {
    assert.equal((await html(chemin)).status, 401, chemin);
  }
  const signalement = (await store.reports()).at(-1);
  assert.equal((await html(`/moderation?signalement=${signalement.id}`)).status, 401, 'le fil non plus');
});

test('perdre ses droits ferme aussi le fil', async () => {
  const signalement = (await store.reports()).at(0);
  admins = ['999'];
  oublierLesAdmins();
  assert.equal((await html(`/moderation?signalement=${signalement.id}`, cookie)).status, 401);
  admins = ['600'];
  oublierLesAdmins();
});

// Les prénoms et les messages viennent des membres : ils finissent dans du HTML.
test('un prénom ou un message qui contient du HTML ne s\'exécute pas', async () => {
  await membre('640', 'Hack');
  await membre('641', 'Cible', 'homme');
  await store.updateUser('640', { profile: { ...(await store.getUser('640')).profile, name: '<script>alert(1)</script>' } });
  const m = await matcher('640', '641');
  await ecrire('640', m.id, 'regarde <img src=x onerror=alert(2)>');
  await fetch(`${base}/api/reports`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-dev-user': '641' }, body: JSON.stringify({ targetId: '640', reason: 'autre', matchId: m.id }) });
  const signalement = (await store.reports()).at(-1);

  const { texte } = await html(`/moderation?signalement=${signalement.id}`, cookie);
  assert.ok(texte.includes('&lt;script&gt;'), 'le prénom est échappé');
  assert.ok(!texte.includes('<script>alert(1)</script>'), 'et jamais rendu tel quel');
  assert.ok(texte.includes('&lt;img src=x onerror=alert(2)&gt;'), 'le message aussi');

  const liste = await html('/moderation?vue=signalements', cookie);
  assert.ok(!liste.texte.includes('<script>alert(1)</script>'), 'ni dans la liste');
});

test('l\'API du fil refuse un signalement inconnu, et un fil sans discussion', async () => {
  const r = await fetch(`${base}/api/mod/signalements/inconnu/fil`, { headers: { cookie } });
  assert.equal(r.status, 404);

  const sansFil = (await store.reports()).find((x) => !x.matchId);
  const r2 = await fetch(`${base}/api/mod/signalements/${sansFil.id}/fil`, { headers: { cookie } });
  assert.equal(r2.status, 404);
  assert.equal((await r2.json()).code, 'SANS_FIL');
});

// Express 4 ne rattrape pas le rejet d'un gestionnaire asynchrone : sans filet, une panne de la
// base ne renvoie rien du tout et l'onglet tourne indéfiniment. Vu en sabotant la page pendant
// l'écriture de ces tests — la requête ne revenait jamais, au lieu d'échouer franchement.
test('une panne du stockage répond au lieu de faire pendre la requête', async () => {
  const vrai = store.allUsers;
  store.allUsers = async () => { throw new Error('base injoignable'); };
  try {
    const r = await Promise.race([
      html('/moderation', cookie),
      new Promise((_, ko) => setTimeout(() => ko(new Error('la requête ne revient jamais')), 3000)),
    ]);
    assert.equal(r.status, 500);
    assert.match(r.texte, /Réessaie dans un instant/);
  } finally {
    store.allUsers = vrai;
  }
});
