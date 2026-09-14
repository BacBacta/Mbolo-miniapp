// Accepter ou refuser un rendez-vous (P0-4).
//
// Jusqu'ici une proposition restait « proposée » pour toujours : l'autre personne n'avait aucun
// moyen de dire oui ou non, et n'importe qui pouvait confirmer son arrivée à un rendez-vous que
// l'autre n'avait jamais accepté. Ce fichier fige la machine à états et ses autorisations.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-rdv-'));
process.env.BOT_TOKEN = '123456:TEST_TOKEN';
process.env.WEBAPP_URL = 'https://exemple.test';
process.env.ALLOW_DEV_AUTH = 'true';
process.env.SEED_DEMO = 'false';
process.env.AUTO_APPROVE = 'false';

const express = (await import('express')).default;
const { store } = await import('../server/store.js');
const { bot } = await import('../server/bot.js');
const { api } = await import('../server/routes.js');
const { venues, VENUES_DEMO } = await import('../server/config.js');
const { codeDuLieu } = await import('../server/lieux.js');
// La liste est vide par défaut : aucun lieu n'entre en production sans partenariat signé. Un
// test qui éprouve le rendez-vous doit donc dire de quels lieux il a besoin, au lieu de compter
// sur ceux que la configuration portait — c'est cette dépendance tacite qui laissait croire que
// quatre cafés de Yaoundé avaient accepté quelque chose.
venues.push(...VENUES_DEMO);

// Les notifications sont interceptées : chaque changement doit en déclencher une, et une seule
const envoyes = [];
bot.api.sendMessage = async (id, text) => { envoyes.push({ id: String(id), text }); return {}; };

const app = express();
app.use(express.json());
app.use('/api', api);
const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api`;
const call = async (user, p, method = 'GET', body) => {
  const r = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', 'x-dev-user': user }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json() };
};
async function creer(id, name, gender) {
  await call(id, '/me');
  await call(id, '/me/profile', 'PUT', { name, age: 25, gender, intent: 'amitie', city: 'Yaoundé', promptA: 'Le poisson braisé' });
  await store.updateUser(id, { verification: 'approved' });
}
async function matcher(a, b) {
  await call(a, '/swipes', 'POST', { targetId: b, action: 'like' });
  return (await call(b, '/swipes', 'POST', { targetId: a, action: 'like' })).body.match.id;
}
const lieu = venues.find((v) => v.city === 'Yaoundé');
// Renvoie [identifiant du rendez-vous, identifiant du match]. `qui` propose, l'autre est invité.
async function proposer(qui, matchId, slot = 'samedi 15h') {
  const d = await call(qui, `/matches/${matchId}/dates`, 'POST', { venueId: lieu.id, slot });
  assert.equal(d.status, 200, JSON.stringify(d.body));
  return d.body.date.id;
}
const statut = async (qui, matchId, id) => (await call(qui, `/matches/${matchId}`)).body.dates.find((d) => d.id === id)?.status;

// Les notifications partent sans retenir la réponse HTTP : prévenir Telegram ne doit pas faire
// attendre celui qui a cliqué. Il faut donc leur laisser le temps d'arriver avant de compter, puis
// un instant de plus : c'est ce délai supplémentaire qui ferait apparaître une deuxième notification
// s'il en partait une, et c'est bien « une, et une seule » que ces tests veulent vérifier.
async function notifications(attendues = 1) {
  for (let i = 0; i < 200 && envoyes.length < attendues; i += 1) await new Promise((r) => setTimeout(r, 5));
  await new Promise((r) => setTimeout(r, 40));
  return envoyes;
}
// Repart d'un compteur vide, une fois les notifications déjà parties bien arrivées.
async function oublierLesNotifications(dejaParties = 1) {
  await notifications(dejaParties);
  envoyes.length = 0;
}

test.after(() => server.close());

test('la personne invitée accepte, et celle qui propose est prévenue', async () => {
  await creer('7001', 'Awa', 'femme');
  await creer('7002', 'Éric', 'homme');
  const m = await matcher('7001', '7002');
  const id = await proposer('7001', m);
  await oublierLesNotifications();

  const r = await call('7002', `/dates/${id}`, 'PUT', { status: 'accepted' });
  assert.equal(r.status, 200);
  assert.equal(r.body.date.status, 'accepted');
  assert.equal(await statut('7001', m, id), 'accepted', 'les deux côtés voient le même statut');
  const n = await notifications();
  assert.equal(n.length, 1, 'une notification, et une seule');
  assert.equal(n[0].id, '7001', 'elle part vers la personne qui a proposé');
  assert.match(n[0].text, /accepté/);
});

test('la personne invitée refuse ; le rendez-vous est clos, pas effacé', async () => {
  await creer('7003', 'Bana', 'femme');
  await creer('7004', 'Cyrille', 'homme');
  const m = await matcher('7003', '7004');
  const id = await proposer('7003', m);
  await oublierLesNotifications();

  assert.equal((await call('7004', `/dates/${id}`, 'PUT', { status: 'declined' })).status, 200);
  assert.equal(await statut('7003', m, id), 'declined');
  const n = await notifications();
  assert.equal(n.length, 1);
  assert.equal(n[0].id, '7003');
  // Refusé est définitif : on repropose, on ne ressuscite pas
  const encore = await call('7004', `/dates/${id}`, 'PUT', { status: 'accepted' });
  assert.equal(encore.status, 409);
  assert.equal(encore.body.code, 'DATE_CLOSED');
});

// CHANGEMENTS est un objet ordinaire : « constructor » y est une propriété, donc « vraie ». Un
// statut hors liste passait, la base le gardait, et la notification tombait sur un message
// inexistant — hors de tout try, ce qui arrêtait le serveur (audit/09-revue-code.md, C1).
test('un statut hors liste est refusé, le rendez-vous reste intact, rien ne part', async () => {
  await creer('c1', 'Clara', 'femme'); await creer('c2', 'Cyril', 'homme');
  const m = await matcher('c1', 'c2');
  const id = await proposer('c1', m);
  await oublierLesNotifications(1);
  const rejets = [];
  const ecoute = (r) => rejets.push(r);
  process.on('unhandledRejection', ecoute);
  try {
    for (const faux of ['constructor', '__proto__', 'toString', 'hasOwnProperty', '']) {
      const r = await call('c2', `/dates/${id}`, 'PUT', { status: faux });
      assert.equal(r.status, 400, `${faux || '(vide)'} : ${JSON.stringify(r.body)}`);
      assert.equal(r.body.code, 'STATUS_INVALID');
    }
    assert.equal(await statut('c2', m, id), 'proposed', 'le rendez-vous n\'a pas bougé');
    assert.equal((await notifications(0)).length, 0, 'aucune notification');
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(rejets.length, 0, 'aucune promesse orpheline');
  } finally {
    process.off('unhandledRejection', ecoute);
  }
  // Et la vraie action marche toujours après.
  assert.equal((await call('c2', `/dates/${id}`, 'PUT', { status: 'accepted' })).status, 200);
});

test('celle qui propose ne peut pas accepter à la place de l\'autre', async () => {
  await creer('7005', 'Diane', 'femme');
  await creer('7006', 'Franck', 'homme');
  const m = await matcher('7005', '7006');
  const id = await proposer('7005', m);

  for (const action of ['accepted', 'declined']) {
    const r = await call('7005', `/dates/${id}`, 'PUT', { status: action });
    assert.equal(r.status, 403, `${action} par la personne qui propose`);
    assert.equal(r.body.code, 'DATE_NOT_YOURS');
  }
  assert.equal(await statut('7005', m, id), 'proposed', 'le rendez-vous n\'a pas bougé');
});

test('annuler : sa propre proposition avant réponse, le rendez-vous accepté des deux côtés', async () => {
  await creer('7007', 'Gisèle', 'femme');
  await creer('7008', 'Hervé', 'homme');
  const m = await matcher('7007', '7008');

  // Tant qu'elle attend, seule la personne qui a proposé peut annuler : l'autre a « refuser »
  const id1 = await proposer('7007', m);
  const refus = await call('7008', `/dates/${id1}`, 'PUT', { status: 'cancelled' });
  assert.equal(refus.status, 403);
  assert.equal(refus.body.code, 'DATE_NOT_YOURS');
  assert.equal((await call('7007', `/dates/${id1}`, 'PUT', { status: 'cancelled' })).status, 200);

  // Une fois accepté, chacun doit pouvoir se décommander : c'est une question de sécurité
  const id2 = await proposer('7007', m, 'dimanche 16h');
  await call('7008', `/dates/${id2}`, 'PUT', { status: 'accepted' });
  // Deux notifications sont déjà en route ici : la proposition, puis l'acceptation.
  await oublierLesNotifications(2);
  assert.equal((await call('7008', `/dates/${id2}`, 'PUT', { status: 'cancelled' })).status, 200);
  assert.equal(await statut('7007', m, id2), 'cancelled');
  const n = await notifications();
  assert.equal(n[0].id, '7007', 'la personne qui avait proposé est prévenue');
});

test('le check-in exige un rendez-vous accepté', async () => {
  await creer('7009', 'Ines', 'femme');
  await creer('7010', 'Jules', 'homme');
  const m = await matcher('7009', '7010');
  const id = await proposer('7009', m);

  const tot = await call('7010', `/dates/${id}/checkin`, 'POST', { code: codeDuLieu(lieu.id) });
  assert.equal(tot.status, 409, 'on ne confirme pas son arrivée à un rendez-vous jamais accepté');
  assert.equal(tot.body.code, 'DATE_NOT_ACCEPTED');

  await call('7010', `/dates/${id}`, 'PUT', { status: 'accepted' });
  const ok = await call('7010', `/dates/${id}/checkin`, 'POST', { code: codeDuLieu(lieu.id) });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.arrived, true);
});

test('un rendez-vous annulé ferme aussi le check-in', async () => {
  await creer('7011', 'Kadi', 'femme');
  await creer('7012', 'Landry', 'homme');
  const m = await matcher('7011', '7012');
  const id = await proposer('7011', m);
  await call('7012', `/dates/${id}`, 'PUT', { status: 'accepted' });
  await call('7011', `/dates/${id}`, 'PUT', { status: 'cancelled' });

  const r = await call('7012', `/dates/${id}/checkin`, 'POST', { code: codeDuLieu(lieu.id) });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'DATE_NOT_ACCEPTED');
});

test('un seul rendez-vous vivant par discussion', async () => {
  await creer('7013', 'Mina', 'femme');
  await creer('7014', 'Noé', 'homme');
  const m = await matcher('7013', '7014');
  const id = await proposer('7013', m);

  // Tant que le premier attend une réponse, on n'en empile pas un second
  const doublon = await call('7013', `/matches/${m}/dates`, 'POST', { venueId: lieu.id, slot: 'lundi 18h' });
  assert.equal(doublon.status, 409);
  assert.equal(doublon.body.code, 'DATE_EN_COURS');

  // Une fois le premier refusé, la voie est libre
  await call('7014', `/dates/${id}`, 'PUT', { status: 'declined' });
  assert.equal((await call('7013', `/matches/${m}/dates`, 'POST', { venueId: lieu.id, slot: 'lundi 18h' })).status, 200);
});

test('une personne bloquée ne change plus le statut, et l\'identifiant de qui propose ne sort pas', async () => {
  await creer('7015', 'Oumou', 'femme');
  await creer('7016', 'Patrick', 'homme');
  const m = await matcher('7015', '7016');
  const id = await proposer('7016', m);

  // Ce que voit la personne invitée : le statut, et si la proposition vient d'elle — pas l'identifiant
  const vue = (await call('7015', `/matches/${m}`)).body.dates.find((d) => d.id === id);
  assert.equal(vue.status, 'proposed');
  assert.equal(vue.proposedByMe, false);
  assert.equal(vue.proposedBy, undefined, 'l\'identifiant Telegram de l\'autre ne sort jamais');
  assert.equal((await call('7016', `/matches/${m}`)).body.dates[0].proposedByMe, true);

  await store.block('7015', '7016');
  const r = await call('7016', `/dates/${id}`, 'PUT', { status: 'cancelled' });
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'BLOCKED');
});

test('un statut inventé est refusé', async () => {
  await creer('7017', 'Rita', 'femme');
  await creer('7018', 'Samuel', 'homme');
  const m = await matcher('7017', '7018');
  const id = await proposer('7017', m);
  for (const faux of ['arrived', 'proposed', '', 'DROP TABLE', null]) {
    const r = await call('7018', `/dates/${id}`, 'PUT', { status: faux });
    assert.equal(r.status, 400, `statut refusé : ${faux}`);
    assert.equal(r.body.code, 'STATUS_INVALID');
  }
  assert.equal(await statut('7017', m, id), 'proposed');
});
