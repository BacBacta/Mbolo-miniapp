// Une promesse rejetée sans filet arrête le processus. La revue du 14 septembre 2026 en a trouvé
// trois chemins depuis l'extérieur (audit/09-revue-code.md, C1, C2, C5) ; ce fichier fige le
// remède commun, et les deux symptômes les plus simples à rejouer.
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { envelopper, enArrierePlan } from '../server/promesses.js';
import { lireCookie } from '../server/session.js';

// Compte les rejets que personne n'a rattrapés pendant un test. Sans ce compteur, le test
// passerait pendant que Node s'apprête à sortir — c'est exactement le symptôme qu'on fige.
function surveillerLesRejets() {
  const rejets = [];
  const ecoute = (r) => rejets.push(r);
  process.on('unhandledRejection', ecoute);
  return { rejets, arreter: () => process.off('unhandledRejection', ecoute) };
}
const respirer = () => new Promise((r) => setTimeout(r, 30));

test('un gestionnaire enveloppé qui rejette répond 500 au lieu de laisser une promesse orpheline', async () => {
  const app = express();
  const routeur = envelopper(express.Router());
  routeur.get('/boum', async () => { throw new Error('boum'); });
  routeur.get('/lent', async (req, res) => { await respirer(); res.json({ ok: true }); });
  app.use(routeur);
  app.use((err, req, res, next) => res.status(500).json({ code: 'SERVER_ERROR' })); // eslint-disable-line no-unused-vars
  const server = app.listen(0);
  const base = `http://localhost:${server.address().port}`;
  const s = surveillerLesRejets();
  try {
    const r = await fetch(`${base}/boum`);
    assert.equal(r.status, 500);
    assert.equal((await r.json()).code, 'SERVER_ERROR');
    assert.equal((await fetch(`${base}/lent`)).status, 200, 'les gestionnaires sains ne changent pas');
    await respirer();
    assert.equal(s.rejets.length, 0, 'aucune promesse orpheline');
  } finally {
    s.arreter();
    server.close();
  }
});

test('une tâche en arrière-plan qui échoue est journalisée, jamais relancée', async () => {
  const s = surveillerLesRejets();
  const journal = [];
  const vrai = console.error;
  console.error = (m) => journal.push(String(m));
  try {
    await enArrierePlan(Promise.reject(new Error('Telegram est parti')), 'notification');
    await enArrierePlan((async () => { throw new Error('plus tard'); })());
    await respirer();
  } finally {
    console.error = vrai;
    s.arreter();
  }
  assert.equal(s.rejets.length, 0);
  assert.match(journal[0], /notification : Telegram est parti/);
});

// Le cookie « % » faisait jeter decodeURIComponent depuis un gestionnaire sans filet : une requête
// anonyme sur /api/mod arrêtait le serveur.
test('un cookie malformé est lu comme absent, pas comme une exception', () => {
  for (const valeur of ['%', '%E0%A4%A', '%zz']) {
    assert.equal(lireCookie({ headers: { cookie: `mod_session=${valeur}` } }, 'mod_session'), null, valeur);
  }
  assert.equal(lireCookie({ headers: { cookie: 'a=1; mod_session=abc%2Edef' } }, 'mod_session'), 'abc.def', 'un cookie sain se lit toujours');
});
