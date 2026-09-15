// Ce que l'interface doit faire entre deux réponses du réseau, lu dans sa source : un test de
// bout en bout qui attendrait une course ne prouverait rien (audit/09-revue-code.md, I9).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const entre = (debut, fin) => app.slice(app.indexOf(debut), app.indexOf(fin, app.indexOf(debut)));

test('la discussion porte un jeton de requête, et un seul minuteur', () => {
  const chat = entre('  async chat({ id }) {', '  async date() {');
  assert.match(chat, /S\.chatJeton = \(S\.chatJeton \|\| 0\) \+ 1/, 'un jeton par ouverture');
  assert.match(chat, /jeton !== S\.chatJeton/, 'et la réponse d\'une discussion quittée est ignorée');
  assert.match(chat, /clearInterval\(S\.chatTimer\);\s*S\.chatTimer = setInterval\(pollChat/, 'jamais deux minuteurs');
});

test("l'écran du rendez-vous et celui du selfie ne remplacent pas un écran quitté pendant l'attente", () => {
  assert.match(entre('  async date() {', '    const d = S.dateDraft;'), /if \(S\.screen !== 'date'\) return;/);
  assert.match(entre('  async verify(', 'S.selfie ?'), /if \(S\.screen !== 'verify'\) return;/);
});

test("aucun identifiant n'entre dans un chemin d'API sans être encodé", () => {
  const nus = app.match(/api\(`\/(matches|dates|photos|voix)\/\$\{(?!encodeURIComponent)[^}]+\}/g) || [];
  assert.deepEqual(nus, [], `chemins composés sans encodeURIComponent : ${nus.join(' ; ')}`);
});

test("les paramètres de lancement n'ouvrent une discussion que sur un identifiant de la bonne forme", () => {
  const boot = entre('async function boot() {', '\nboot();');
  assert.match(boot, /\/\^\[a-f0-9\]\{16\}\$\/\.test\(params\.match/);
  assert.match(boot, /params\.screen === 'verify' && !approved/, 'un compte vérifié n\'est pas renvoyé au selfie');
});

test("une discussion fermée arrête l'interrogation, et l'app en arrière-plan n'interroge plus /summary", () => {
  assert.match(entre('async function pollChat() {', 'async function sendMessage('), /MATCH_NOT_FOUND[^\n]*BLOCKED[\s\S]*clearInterval\(S\.chatTimer\)/);
  assert.match(entre('async function refreshSummary() {', 'const avatar ='), /if \(document\.hidden\) return;/);
});

// Sur un téléphone, l'écran de match affichait « J'aime » et « Écrire à … » l'un sur l'autre :
// il renverse toute la palette, donc le bouton natif de Telegram changeait de couleur et de
// libellé au même instant, et le client Android fond alors les deux états. On l'efface avant la
// bascule — et seulement là : masquer à chaque navigation ferait clignoter la barre partout.
test("les boutons sont effacés quand l'écran de match renverse la palette", () => {
  const f = entre('function go(screen, params = {}) {', 'async function refreshSummary');
  const ligne = /if \(\(screen === 'match'\) !== document\.body\.classList\.contains\('match-mode'\)\) tg\.setButtons\(null\);/;
  assert.match(f, ligne, 'effacés à l\'entrée comme à la sortie du match');
  assert.ok(f.indexOf('tg.setButtons(null)') < f.indexOf("classList.toggle('match-mode'"),
    'avant la bascule de la palette, sinon le bouton reprend déjà les nouvelles couleurs');
  assert.equal((f.match(/tg\.setButtons\(null\)/g) || []).length, 1, 'une seule fois : go() ne masque rien d\'autre');
});

// Le clavier réduit la fenêtre : sans écouteur, la zone des messages rétrécit et le dernier
// message passe dessous. Le parcours navigateur le rejoue pour de vrai (e2e/discussion.spec.js) ;
// ici on refuse seulement que l'écouteur disparaisse.
test('la discussion se recolle en bas quand la fenêtre change de taille', () => {
  assert.match(app, /tg\.onViewport\(\(\) => collerEnBas\(\)\)/);
  const f = entre('function collerEnBas(', 'tg.onViewport(');
  assert.match(f, /if \(!force && !S\.chatEnBas\) return;/, 'qui remonte l\'historique n\'est pas ramené de force');
  assert.match(entre('function renderChat() {', 'function updateChat'), /addEventListener\('scroll'/, 'et on sait s\'il y était');
});
