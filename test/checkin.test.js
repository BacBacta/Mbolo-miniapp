// Le code d'un lieu partenaire : il ne se devine pas, et il ne sort pas du serveur.
//
// Deux défauts vivaient ensemble. Le code était écrit en clair dans la configuration et se
// déduisait de l'identifiant du lieu (`rdv:lieu:palmier`) ; et surtout, l'objet lieu partait tel
// quel au navigateur à chaque interrogation de la discussion, code compris. Le serveur *donnait*
// donc le code aux deux personnes du rendez-vous : rendre le code imprévisible n'aurait rien
// changé tant que l'API le distribuait.
//
// Ce fichier fige les deux moitiés. La seconde compte au moins autant que la première : c'est
// celle qu'une modification innocente peut rouvrir, en recopiant un lieu dans une réponse.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-checkin-'));
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.WEBAPP_URL = 'https://exemple.test';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.SEED_DEMO = 'false';
process.env.AUTO_APPROVE = 'false';
process.env.VENUE_SECRET = 'secret-de-test';

const express = (await import('express')).default;
const { store } = await import('../server/store.js');
// Les routes désignent les autres par leur identifiant public, jamais par l'identifiant Telegram.
const pid = async (id) => (await store.getUser(id))?.pid;
const { bot } = await import('../server/bot.js');
const { api } = await import('../server/routes.js');
const { venues, VENUES_DEMO } = await import('../server/config.js');
const { codeDuLieu, codeValide } = await import('../server/lieux.js');
const { reinitialiser } = await import('../server/limites.js');
venues.push(...VENUES_DEMO);
bot.api.sendMessage = async () => ({});

const app = express();
app.use(express.json());
app.use('/api', api);
const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api`;
const call = async (user, p, method = 'GET', body) => {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', 'x-dev-user': user }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
const lieu = venues.find((v) => v.city === 'Yaoundé');

async function creer(id, name, gender) {
  await call(id, '/me');
  await call(id, '/me/profile', 'PUT', { name, age: 25, gender, intent: 'amitie', city: 'Yaoundé', promptA: 'Le poisson braisé' });
  await store.updateUser(id, { verification: 'approved' });
}
// Un rendez-vous accepté, prêt pour le check-in. Renvoie l'identifiant du rendez-vous et du match.
async function rendezVousAccepte(a, b) {
  await creer(a, 'Awa', 'femme');
  await creer(b, 'Éric', 'homme');
  await call(a, '/swipes', 'POST', { targetId: await pid(b), action: 'like' });
  const m = (await call(b, '/swipes', 'POST', { targetId: await pid(a), action: 'like' })).body.match.id;
  const d = (await call(a, `/matches/${m}/dates`, 'POST', { venueId: lieu.id, slot: 'samedi 15h' })).body.date.id;
  await call(b, `/dates/${d}`, 'PUT', { status: 'accepted' });
  return { d, m };
}

test.after(() => server.close());

// ---------- Première moitié : le code ne se devine pas ----------

test("le code ne se déduit pas de l'identifiant du lieu", () => {
  const code = codeDuLieu('palmier');
  assert.ok(!codeValide('palmier', 'rdv:lieu:palmier'), "l'ancienne forme devinable ne vaut plus rien");
  assert.ok(!codeValide('palmier', 'rdv:palmier'), "l'identifiant seul ne suffit pas");
  assert.ok(!codeValide('palmier', 'palmier'), 'ni l\'identifiant nu');
  // Ce qui reste lisible sert à réimprimer une feuille trouvée ; le secret est l'empreinte.
  assert.match(code, /^rdv:palmier:[0-9a-f]{16}$/);
});

test('deux lieux ont deux codes, et celui du voisin ne marche pas', () => {
  assert.notEqual(codeDuLieu('palmier'), codeDuLieu('lac'));
  assert.ok(!codeValide('palmier', codeDuLieu('lac')), 'le code du lieu voisin est refusé');
  assert.ok(codeValide('palmier', codeDuLieu('palmier')));
});

// timingSafeEqual jette une exception quand les longueurs diffèrent : sans le hachage des deux
// côtés, un code scanné trop court ferait tomber la route en 500 au lieu de la refuser.
test('un code de longueur quelconque est refusé, jamais une exception', () => {
  for (const bizarre of ['', 'x', 'rdv:', undefined, null, 'a'.repeat(5000), '🙂']) {
    assert.doesNotThrow(() => codeValide('palmier', bizarre), String(bizarre));
    assert.ok(!codeValide('palmier', bizarre), String(bizarre));
  }
});

// Dans un processus à part : lieux.js lit le secret par config.js, qui lit process.env une fois
// au chargement. Réimporter le module ne suffit donc pas — c'est un nouveau démarrage qu'il faut,
// et c'est exactement ce que fait la rotation d'urgence.
test('changer le secret change tous les codes', () => {
  const avec = (secret) => execFileSync(process.execPath, ['-e',
    "import('./server/lieux.js').then((m) => process.stdout.write(m.codeDuLieu('palmier')))"],
  { encoding: 'utf8', env: { ...process.env, VENUE_SECRET: secret } });

  assert.equal(avec('secret-de-test'), codeDuLieu('palmier'), 'à secret égal, code égal');
  assert.notEqual(avec('un-autre-secret'), codeDuLieu('palmier'), 'renouveler le secret invalide les QR imprimés');
});

// Sans VENUE_SECRET, le secret est tiré au hasard au démarrage. Ce défaut doit échouer du bon
// côté : les QR imprimés cessent de marcher, aucun ne devient devinable ou stable.
test('sans secret configuré, le code change à chaque démarrage', () => {
  const sansSecret = () => execFileSync(process.execPath, ['-e',
    "import('./server/lieux.js').then((m) => process.stdout.write(m.codeDuLieu('palmier')))"],
  { encoding: 'utf8', env: { ...process.env, VENUE_SECRET: '' } });

  assert.notEqual(sansSecret(), sansSecret(), 'deux démarrages, deux codes');
});

// ---------- Seconde moitié : le code ne sort jamais du serveur ----------
//
// C'est le test qui compte le plus : le code était *servi* au navigateur. Chaque assertion vise
// une réponse d'API qui transporte un lieu.

test('le code du lieu n\'apparaît dans aucune réponse de l\'API', async () => {
  const { d, m } = await rendezVousAccepte('9101', '9102');
  const code = codeDuLieu(lieu.id);

  const chat = await call('9102', `/matches/${m}`);
  assert.equal(chat.body.dates[0].venue.code, undefined, 'la discussion servait le lieu entier, code compris');
  assert.ok(!JSON.stringify(chat.body).includes(code), 'le code ne doit apparaître nulle part dans la discussion');

  const liste = await call('9101', '/venues');
  assert.ok(!JSON.stringify(liste.body).includes(code), 'ni dans la liste des lieux');

  const maj = await call('9101', `/dates/${d}`, 'PUT', { status: 'cancelled' });
  assert.ok(!JSON.stringify(maj.body).includes(code), 'ni dans la réponse à un changement de statut');
});

test('aucun lieu ne porte de champ code : on ne peut pas laisser fuir ce qu\'on ne transporte pas', () => {
  for (const v of VENUES_DEMO) {
    assert.equal(v.code, undefined, `${v.id} porte encore un code en clair`);
  }
});

// ---------- Le contrôle au bout : ce que la route accepte ----------

test('le bon code confirme l\'arrivée, un code inventé ne confirme rien', async () => {
  reinitialiser();
  const { d } = await rendezVousAccepte('9103', '9104');

  const faux = await call('9103', `/dates/${d}/checkin`, 'POST', { code: 'rdv:lieu:palmier' });
  assert.equal(faux.status, 400);
  assert.equal(faux.body.code, 'WRONG_VENUE');
  // Le message dit quoi faire, pas seulement que c'est raté (règle 11).
  assert.match(faux.body.message, /Scanne le code posé sur ta table/);

  const vrai = await call('9103', `/dates/${d}/checkin`, 'POST', { code: codeDuLieu(lieu.id) });
  assert.equal(vrai.status, 200, JSON.stringify(vrai.body));
  assert.equal(vrai.body.arrived, true);
});

test('les essais de codes en série sont arrêtés', async () => {
  reinitialiser();
  const { d } = await rendezVousAccepte('9105', '9106');
  let dernier;
  for (let i = 0; i < 11; i += 1) {
    dernier = await call('9105', `/dates/${d}/checkin`, 'POST', { code: `essai-${i}` });
  }
  assert.equal(dernier.status, 429, 'la onzième tentative est refusée');
  assert.equal(dernier.body.code, 'RATE_LIMIT');
  reinitialiser();
});
