// « Quelqu'un vient d'arriver » : qui l'apprend, qui ne l'apprend pas, et ce que ça ne dit pas.
//
// Une notification d'arrivée est la fonction la plus facile à transformer en envoi de masse : elle
// se déclenche toute seule, elle vise tout le monde, et rien dans l'app ne la montre à celui qui
// l'écrit. Ces tests éprouvent donc surtout ses **freins** — l'inactivité, le ralentisseur, le
// plafond, l'unicité — parce que ce sont eux qui décident si l'app reste installée.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-nouveaux-'));
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.WEBAPP_URL = 'https://exemple.test';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.SEED_DEMO = 'false';
process.env.AUTO_APPROVE = 'false';

const express = (await import('express')).default;
const { store } = await import('../server/store.js');
const { quiPrevenir, ACTIF_RECENT_MS, RALENTI_MS, MAX_PREVENUS } = await import('../server/nouveaux.js');
const { bot, decideVerification } = await import('../server/bot.js');
const { api } = await import('../server/routes.js');

const sent = [];
bot.api.sendMessage = async (chatId, text) => { sent.push({ chatId: String(chatId), text }); return {}; };

const app = express();
app.use(express.json());
app.use('/api', api);
const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api`;
const call = async (user, p, method = 'GET', body) => {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', 'x-dev-user': user }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const to = (id) => sent.filter((m) => m.chatId === id);
// Seulement les annonces d'arrivée : la vérification envoie aussi « Ton profil est vérifié » à
// l'intéressé, et compter toute sa boîte ferait échouer des tests qui n'ont rien à voir.
const arrivees = (id) => to(id).filter((m) => /vient d'arriver|just joined/.test(m.text));
// Les notifications partent sans retenir la réponse HTTP : on attend celle qu'on cherche.
async function attendue(id, motif, essais = 120) {
  for (let i = 0; i < essais; i += 1) {
    if (to(id).some((m) => motif.test(m.text))) return true;
    await wait(5);
  }
  return false;
}
// Un membre visible : profil enregistré puis vérifié. La politique par défaut est « gate », donc
// c'est la vérification qui rend visible — et donc elle qui déclenche l'annonce.
async function membre(id, name, gender, champs = {}) {
  await call(id, '/me');
  const r = await call(id, '/me/profile', 'PUT', { name, age: 25, gender, intent: 'amitie', city: 'Douala', promptA: 'Le poisson braisé', ...champs });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  // **Le vrai chemin**, pas un raccourci dans le stockage : sous « gate » c'est la décision de
  // modération qui rend visible, donc c'est elle qui déclenche l'annonce. Écrire
  // `verification: 'approved'` à la main sautait le crochet — et le test passait à côté de tout
  // ce qu'il prétendait éprouver.
  await store.updateUser(id, { verification: 'pending' });
  await decideVerification(id, true);
}
// Quelqu'un qui n'a pas ouvert l'app depuis un moment : c'est la condition pour être prévenu.
const absentDepuis = (id, ms) => store.updateUser(id, { lastActiveAt: Date.now() - ms });

test.after(() => server.close());

const JOUR = 24 * 3600 * 1000;

// ---------- La règle, sans serveur ----------

test('les quatre freins écartent chacun quelqu\'un pour une raison différente', () => {
  const t0 = 1_700_000_000_000;
  const u = (id, o = {}) => ({ id, profile: { name: id }, lastActiveAt: t0 - 5 * 3600e3, ...o });
  const arrivant = u('neuf');
  const tous = [
    arrivant,
    u('lui-meme-mais-recopie', { id: 'neuf' }),
    u('ouvre-a-l-instant', { lastActiveAt: t0 - 60e3 }),
    u('profil-de-demo', { demo: true }),
    u('compte-ferme', { banned: { at: t0 } }),
    u('sans-profil', { profile: null }),
    u('deja-prevenu-hier', { lastNotifiedAt: { nouveaux: t0 - 3600e3 } }),
    u('celui-qu-on-previent'),
  ];
  const prevenus = quiPrevenir({ arrivant, tous, peutVoir: () => true, maintenant: t0 }).map((x) => x.id);
  assert.deepEqual(prevenus, ['celui-qu-on-previent']);

  // Le prédicat a le dernier mot : même sans frein, on ne prévient que qui verrait la carte.
  assert.deepEqual(quiPrevenir({ arrivant, tous, peutVoir: () => false, maintenant: t0 }), []);
  // Un arrivant sans profil n'est visible de personne, donc il n'y a rien à annoncer.
  assert.deepEqual(quiPrevenir({ arrivant: { id: 'x' }, tous, peutVoir: () => true, maintenant: t0 }), []);
});

test('le plafond tient, et il garde les plus récemment actifs', () => {
  const t0 = 1_700_000_000_000;
  const arrivant = { id: 'neuf', profile: {} };
  // Cent personnes, toutes éligibles, d'anciennetés croissantes.
  const tous = [arrivant, ...Array.from({ length: 100 }, (_, i) => ({
    id: `m${i}`, profile: {}, lastActiveAt: t0 - (i + 1) * 3600e3,
  }))];
  const prevenus = quiPrevenir({ arrivant, tous, peutVoir: () => true, maintenant: t0 });
  assert.equal(prevenus.length, MAX_PREVENUS, 'jamais plus que le plafond');
  // m0 est le plus récemment actif : on parle à qui revient déjà, plutôt que de réveiller les
  // comptes les plus endormis — c'est ce choix-là qui distingue une nouvelle d'un envoi de masse.
  assert.equal(prevenus[0].id, 'm0');
  assert.equal(prevenus.at(-1).id, `m${MAX_PREVENUS - 1}`);
});

test('les trois durées sont celles qu\'on croit', () => {
  assert.equal(ACTIF_RECENT_MS, 30 * 60 * 1000);
  assert.equal(RALENTI_MS, 48 * 3600 * 1000);
  assert.equal(MAX_PREVENUS, 20);
});

// ---------- De bout en bout ----------

test('une arrivée prévient qui la verrait, et personne d\'autre', async () => {
  await membre('3001', 'Awa', 'femme');
  await absentDepuis('3001', 2 * 3600e3);
  // Une autre intention : elle ne verra jamais cette personne dans son paquet.
  await membre('3002', 'Bea', 'femme', { intent: 'serieux' });
  await absentDepuis('3002', 2 * 3600e3);
  // Une autre ville : hors de la zone de recherche par défaut.
  await membre('3003', 'Cyr', 'homme', { city: 'Yaoundé' });
  await absentDepuis('3003', 2 * 3600e3);

  await membre('3010', 'Dan', 'homme');

  assert.ok(await attendue('3001', /vient d'arriver/), 'Awa, même intention et même ville, est prévenue');
  assert.equal(arrivees('3002').length, 0, 'Bea cherche autre chose');
  assert.equal(arrivees('3003').length, 0, 'Cyr est dans une autre ville');
  // Et la nouvelle ne nomme personne : ni le prénom de l'arrivant, ni rien qui le désigne.
  assert.ok(!arrivees('3001').some((m) => m.text.includes('Dan')), "l'arrivant n'est pas nommé");
});

test('qui vient d\'ouvrir l\'app n\'est pas prévenu : la carte arrive toute seule', async () => {
  await membre('3020', 'Eve', 'femme');
  // Pas de absentDepuis : /me vient de poser lastActiveAt à maintenant.
  await membre('3021', 'Fabi', 'homme');
  await wait(150);
  assert.equal(arrivees('3020').length, 0);
});

test('une seule annonce par compte, et une seule par personne tous les deux jours', async () => {
  await membre('3030', 'Gaia', 'femme');
  await absentDepuis('3030', 2 * 3600e3);
  await membre('3031', 'Hugo', 'homme');
  assert.ok(await attendue('3030', /vient d'arriver/), 'la première arrivée passe');
  const apresLaPremiere = arrivees('3030').length;

  // Une deuxième arrivée dans la foulée : le ralentisseur de 48 h la retient.
  await absentDepuis('3030', 2 * 3600e3);
  await membre('3032', 'Ines', 'femme');
  await wait(150);
  assert.equal(arrivees('3030').length, apresLaPremiere, 'deux arrivées le même jour ne font qu\'un message');

  // Et l'arrivant, lui, n'est annoncé qu'une fois dans sa vie : une re-vérification ne rejoue pas
  // la nouvelle. On remonte le ralentisseur de Gaia pour que seul `annonceLe` puisse la retenir.
  await store.updateUser('3030', { lastNotifiedAt: {}, lastActiveAt: Date.now() - 2 * 3600e3 });
  const avant = arrivees('3030').length;
  await store.updateUser('3031', { verification: 'pending' });
  await decideVerification('3031', true);
  await wait(200);
  assert.equal(arrivees('3030').length, avant, 'Hugo avait déjà été annoncé : on ne le réannonce pas');
  assert.ok((await store.getUser('3031')).annonceLe, "et la marque reste posée");
});

test('un compte fermé n\'est annoncé à personne', async () => {
  await membre('3040', 'Jo', 'femme');
  await absentDepuis('3040', 2 * 3600e3);

  // Un compte qui a un profil mais qu'on ferme **avant** de le rendre visible. L'ordre est tout :
  // fermer après l'annonce aurait mesuré autre chose — la première version de ce test annonçait
  // légitimement la personne, puis comptait cette annonce comme une fuite.
  await call('3042', '/me');
  assert.equal((await call('3042', '/me/profile', 'PUT', { name: 'Lina', age: 25, gender: 'femme', intent: 'amitie', city: 'Douala', promptA: 'Le poisson braisé' })).status, 200);
  await store.banUser('3042', { motif: 'test', par: 'test' });
  await store.updateUser('3042', { verification: 'pending' });

  const avant = arrivees('3040').length;
  await decideVerification('3042', true);
  await wait(200);
  assert.equal(arrivees('3040').length, avant, 'un compte fermé ne fait pas la une');
  assert.ok(!(await store.getUser('3042')).annonceLe, "et rien n'est marqué : la nouvelle n'a pas eu lieu");
});

test('l\'arrivée laisse une trace, et une seule par arrivée', async () => {
  await membre('3050', 'Moussa', 'homme');
  await absentDepuis('3050', 2 * 3600e3);
  await membre('3051', 'Nadia', 'femme');
  assert.ok(await attendue('3050', /vient d'arriver/));
  const lignes = (await store.events()).filter((e) => e.k === 'arrivee_dite' && String(e.u) === '3051');
  assert.equal(lignes.length, 1, 'une ligne par arrivée, pas une par destinataire');
  assert.ok(Number.isFinite(lignes[0].p.n) && lignes[0].p.n >= 1, 'elle compte les personnes prévenues');
});
