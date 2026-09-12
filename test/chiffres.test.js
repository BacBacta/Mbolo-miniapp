// Lire les chiffres : les exclusions, et ce qui doit être signalé plutôt qu'affiché tel quel.
//
// Le plan (audit/05-mesure-produit.md) insiste sur deux choses plus que sur les formules. Les
// exclusions doivent être en amont : un profil de démonstration « like » en retour et répond tout
// seul, donc exclure son auteur ne suffit pas, il faut exclure la paire — sans quoi un tableau de
// bord naïf afficherait un taux de match proche de cent pour cent. Et un chiffre douteux doit être
// signalé à côté du nombre : une métrique phare falsifiable est pire que pas de métrique.
//
// Le calcul est une fonction pure : ces tests lui donnent des mondes construits à la main, ce qui
// permet d'éprouver des cas qu'un vrai parcours mettrait des semaines à produire.
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculer, reel } from '../server/chiffres.js';

const JOUR = 86400e3;
const MAINTENANT = Date.parse('2026-09-12T12:00:00Z');
const ilYA = (j) => MAINTENANT - j * JOUR;

const membre = (id, o = {}) => ({ id: String(id), createdAt: ilYA(60), lastActiveAt: MAINTENANT, profile: { city: 'Yaoundé' }, verification: 'approved', profileSavedAt: ilYA(60), ...o });
const evt = (k, u, p, at = MAINTENANT) => ({ id: `e-${Math.random()}`, k, u: u === null ? undefined : String(u), at, ...(p ? { p } : {}) });
const match = (id, a, b, at = ilYA(30)) => ({ id, users: [String(a), String(b)], createdAt: at });
const msg = (from, at) => ({ id: `m-${Math.random()}`, from: String(from), text: 'x', at });

// Un monde minimal où deux personnes réelles se sont écrit.
function monde(extra = {}) {
  const users = [membre(1), membre(2), ...(extra.users || [])];
  // Les comptes datent de soixante jours : pour que l'activation soit possible, le match et les
  // messages doivent tomber dans les quatorze jours qui suivent l'inscription, pas n'importe quand.
  const matches = [match('m1', 1, 2, ilYA(52)), ...(extra.matches || [])];
  const messages = new Map([['m1', [msg(1, ilYA(52)), msg(2, ilYA(52))]], ...(extra.messages || [])]);
  const events = [
    evt('verif_decided', 1, { ok: true, auto: false, ms: 3 * 3600e3 }),
    evt('verif_decided', 2, { ok: true, auto: false, ms: 5 * 3600e3 }),
    ...(extra.events || []),
  ];
  return calculer({
    users, matches, messages, events,
    reports: extra.reports || [], dates: extra.dates || [], blocks: extra.blocks || [],
  }, MAINTENANT);
}

// ---------- Les exclusions, en amont ----------

test('un profil de démonstration ne compte ni lui, ni son match, ni ses messages', () => {
  const sans = monde();
  const avec = monde({
    users: [membre('demo-1', { demo: true })],
    matches: [match('m2', 1, 'demo-1')],
    messages: [['m2', [msg(1, ilYA(20)), msg('demo-1', ilYA(20))]]],
  });
  assert.equal(avec.exclus.demo, 1, 'il est compté comme écarté');
  assert.equal(avec.entonnoir.comptes, sans.entonnoir.comptes, "et pas parmi les comptes réels");
  // Le piège que le plan nomme : c'est la paire qu'il faut exclure, pas seulement l'auteur.
  assert.equal(avec.contre.signalementsPour100Matchs, sans.contre.signalementsPour100Matchs);
  assert.equal(avec.entree.partMatchsAvecMessage48h, sans.entree.partMatchsAvecMessage48h,
    'le match avec le profil de démonstration ne gonfle pas le taux');
});

test('un compte de développement et un compte fermé sont écartés eux aussi', () => {
  const r = monde({ users: [membre(3, { devUser: true }), membre(4, { banned: { at: MAINTENANT } })] });
  assert.equal(r.exclus.dev, 1);
  assert.equal(r.exclus.fermes, 1);
  assert.equal(r.entonnoir.comptes, 2, 'seuls les deux vrais comptent');
  assert.equal(reel({ id: '9', devUser: true }), false);
  assert.equal(reel({ id: '9' }), true);
});

// ---------- La validation automatique ----------

test("une décision automatique ne compte pas comme vérifiée par un humain, et le dit", () => {
  const r = calculer({
    users: [membre(1), membre(2)],
    events: [evt('verif_decided', 1, { ok: true, auto: true, ms: 3000 }), evt('verif_decided', 2, { ok: true, auto: false, ms: 4 * 3600e3 })],
  }, MAINTENANT);
  assert.equal(r.entonnoir.verifieParHumain, 1, "seule la décision humaine compte");
  assert.equal(r.entree.delaiModerationMesuresSur, 1, 'et seule la sienne entre dans le délai');
  assert.equal(r.entree.delaiModerationMedianMs, 4 * 3600e3, 'les trois secondes de la validation automatique ne tirent pas la médiane');
  assert.ok(r.avertissements.some((a) => a.includes('AUTO_APPROVE')), "l'avertissement accompagne le chiffre");
});

test("un compte approuvé sans décision enregistrée ne passe pas pour vérifié par un humain", () => {
  const r = calculer({ users: [membre(1)], events: [] }, MAINTENANT);
  assert.equal(r.entonnoir.verifieParHumain, 0, "on ne sait pas qui a tranché : on ne suppose pas");
  assert.ok(r.avertissements.some((a) => a.includes("avant la mise en place de la mesure")));
});

// ---------- L'activation ----------

test("l'activation exige un message à une personne réelle, pas un like ni un match", () => {
  const r = monde();
  assert.equal(r.activation.actives, 2, 'les deux se sont écrit');

  const sansMessage = calculer({
    users: [membre(1), membre(2)],
    matches: [match('m1', 1, 2, ilYA(52))],
    messages: new Map([['m1', []]]),
    events: [evt('verif_decided', 1, { ok: true, auto: false }), evt('verif_decided', 2, { ok: true, auto: false })],
  }, MAINTENANT);
  assert.equal(sansMessage.activation.actives, 0, 'un match sans message n\'active personne');
});

test("un message envoyé après quatorze jours n'active pas", () => {
  const r = calculer({
    users: [membre(1, { createdAt: ilYA(60) }), membre(2)],
    matches: [match('m1', 1, 2)],
    messages: new Map([['m1', [msg(1, ilYA(20))]]]), // 40 jours après l'inscription
    events: [evt('verif_decided', 1, { ok: true, auto: false })],
  }, MAINTENANT);
  assert.equal(r.activation.actives, 0);
});

test("un compte trop récent n'entre pas au dénominateur", () => {
  const r = calculer({ users: [membre(1, { createdAt: ilYA(3) })], events: [] }, MAINTENANT);
  assert.equal(r.activation.sur, 0, "il n'a pas encore eu ses quatorze jours");
});

// ---------- La métrique phare, et ce qui la rend douteuse ----------

test('un rendez-vous confirmé par une seule personne ne compte pas comme réussi', () => {
  const seul = monde({ dates: [{ id: 'd1', matchId: 'm1', status: 'accepted', arrivals: { 1: MAINTENANT } }] });
  assert.equal(seul.phare.reciproques, 0, "une personne a attendu seule : ce n'est pas un succès");
  assert.equal(seul.contre.checkinsNonReciproques, 1, "c'est une contre-métrique, et un signal de sécurité");

  const deux = monde({ dates: [{ id: 'd1', matchId: 'm1', status: 'accepted', arrivals: { 1: MAINTENANT, 2: MAINTENANT } }] });
  assert.equal(deux.phare.reciproques, 1);
  assert.deepEqual(deux.phare.parVille, { 'Yaoundé': 1 });
});

// Le plan est explicite : une métrique phare falsifiable est pire que pas de métrique.
test("la phare est annoncée comme une borne haute tant que les codes des lieux sont fixes", () => {
  const r = monde({ dates: [{ id: 'd1', matchId: 'm1', status: 'accepted', arrivals: { 1: MAINTENANT, 2: MAINTENANT } }] });
  assert.ok(r.avertissements.some((a) => a.includes('borne haute')), "le chiffre ne part jamais seul");
});

test('un rendez-vous avec un profil de démonstration ne compte pas', () => {
  const r = monde({
    users: [membre('demo-1', { demo: true })],
    matches: [match('m2', 1, 'demo-1')],
    dates: [{ id: 'd2', matchId: 'm2', status: 'accepted', arrivals: { 1: MAINTENANT, 'demo-1': MAINTENANT } }],
  });
  assert.equal(r.phare.reciproques, 0);
});

// ---------- Les contre-métriques ----------

test("les faux positifs apparents de l'anti-arnaque se calculent sur ce qui a suivi", () => {
  const bloques = [evt('antiscam_block', 1, { c: 'MONEY_BLOCKED' }, ilYA(10)), evt('antiscam_block', 2, { c: 'MONEY_BLOCKED' }, ilYA(10))];
  // Le premier a été signalé ensuite, le second n'a rien eu.
  const r = monde({ events: bloques, reports: [{ id: 'r1', from: '2', targetId: '1', at: ilYA(9), reason: 'argent' }] });
  assert.equal(r.contre.fauxPositifsApparents, 0.5, 'un sur deux n\'a eu aucune suite');
  assert.deepEqual(r.contre.blocagesParCode, { MONEY_BLOCKED: 2 });
});

test("un compte vérifié qui n'a jamais vu une carte est compté", () => {
  const r = monde({ events: [evt('deck_empty', 1, { why: 'vide' })] });
  assert.equal(r.contre.verifiesSansAucuneCarte, 1);

  const servi = monde({ events: [evt('deck_empty', 1, { why: 'vide' }), evt('deck_served', 1, { n: 3, r: 17 })] });
  assert.equal(servi.contre.verifiesSansAucuneCarte, 0, "celui à qui on a servi une carte ne compte plus");
});

test('la part des découvertes servies se lit sur les deux événements', () => {
  const r = monde({ events: [evt('deck_served', 1, { n: 3 }), evt('deck_served', 2, { n: 1 }), evt('deck_empty', 1, { why: 'vide' })] });
  assert.equal(Math.round(r.entree.partDecouvertesServies * 100), 67);
});

// ---------- Ce qui n'existe pas ne s'invente pas ----------

test('une base vide ne produit aucun chiffre inventé', () => {
  const r = calculer({ users: [], events: [] }, MAINTENANT);
  assert.equal(r.entonnoir.comptes, 0);
  assert.equal(r.activation.part, null, 'aucune part sur zéro');
  assert.equal(r.entree.delaiModerationMedianMs, null);
  assert.equal(r.entree.partDecouvertesServies, null);
  assert.equal(r.contre.signalementsPour100Matchs, null);
  assert.ok(r.avertissements.some((a) => a.includes('rétroactif')), "et le dit à chaque fois");
});

test("sans app_opened, on dit qu'on ne peut pas dater un départ", () => {
  const r = monde();
  assert.equal(r.churn.datable, false);
  assert.ok(r.avertissements.some((a) => a.includes('dater leur départ')));

  const avec = monde({ events: [evt('app_opened', 1)] });
  assert.equal(avec.churn.datable, true);
  assert.ok(!avec.avertissements.some((a) => a.includes('dater leur départ')));
});

test('le churn dur se lit sur account_deleted, qui ne désigne personne', () => {
  const r = monde({ events: [evt('account_deleted', null, { c: '2026-W30', d: 12 }), evt('account_deleted', null, { c: '2026-W31', d: 3 })] });
  assert.equal(r.churn.dur, 2);
  assert.equal(r.contre.suppressionsPour100Verifies, 100, 'deux suppressions pour deux comptes vérifiés');
});

// Le script lui-même. Une sortie « lisible à la machine » qui ne se lit pas est un piège : la
// bannière de npm et les journaux de migration s'y invitaient, et le JSON n'était plus du JSON.
// Les diagnostics partent donc sur la sortie d'erreur, et ce test le fige.
test('--json sort du JSON et rien d\'autre sur la sortie standard', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-chiffres-'));

  const { stdout } = await promisify(execFile)('node', ['scripts/chiffres.js', '--json'], {
    env: { ...process.env, DATA_DIR: dossier, DATABASE_URL: '', SEED_DEMO: 'false', BOT_TOKEN: '' },
  });
  const r = JSON.parse(stdout);
  assert.deepEqual(Object.keys(r).sort(), ['activation', 'avertissements', 'churn', 'contre', 'entonnoir', 'entree', 'exclus', 'phare']);
  assert.equal(r.entonnoir.comptes, 0, 'une base neuve ne compte personne');
  assert.ok(r.avertissements.length > 0, 'et dit quand même ce qui limite la lecture');
});

test("la sortie lisible par un humain dit ce qu'elle ne peut pas dire", async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'rencontres-chiffres2-'));

  const { stdout } = await promisify(execFile)('node', ['scripts/chiffres.js'], {
    env: { ...process.env, DATA_DIR: dossier, DATABASE_URL: '', SEED_DEMO: 'false', BOT_TOKEN: '' },
  });
  assert.match(stdout, /Entonnoir d'inscription/);
  assert.match(stdout, /Contre-métriques/);
  assert.match(stdout, /À lire avant de conclure/);
  assert.match(stdout, /rétroactif/, "l'avertissement qui vaut pour tout le dossier est là");
  // Aucune part inventée sur une base vide : les cases vides disent « — », jamais « 0 % ».
  assert.match(stdout, /délai médian de modération\s+—/);
});
