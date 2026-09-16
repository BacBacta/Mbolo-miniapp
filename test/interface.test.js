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
  // Le minuteur se réarme à chaque tour depuis que la cadence suit l'activité du fil : c'est
  // exactement la situation où un second minuteur orphelin s'installe. Une seule porte l'arme,
  // et elle éteint avant — l'invariant est tenu dans test/discussion.test.js.
  assert.match(chat, /relancerLePoll\(\)/, 'un seul chemin arme l\'interrogation');
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
  assert.match(boot, /params\.screen === 'verify' && !verifie\(\)/, 'un compte vérifié n\'est pas renvoyé au selfie');
  // Porte ou badge : l'app ne recopie pas la règle, elle lit le drapeau du serveur. Sous
  // « gate », membre() exige le badge et boot() n'a qu'un écran à montrer ; sous « badge », un
  // profil suffit. Une comparaison en dur ici ferait diverger l'interface du serveur.
  assert.match(boot, /if \(!membre\(\)\) return go\(/, "l'app s'ouvre selon la politique, pas selon une copie de la règle");
  assert.ok(!/verification === 'approved'/.test(boot), 'jamais la comparaison à la main dans boot()');
});

test("une discussion fermée arrête l'interrogation, et l'app en arrière-plan n'interroge plus /summary", () => {
  assert.match(entre('async function pollChat() {', 'function montrerLaFrappe() {'), /MATCH_NOT_FOUND[^\n]*BLOCKED[\s\S]*arreterLePoll\(\)/);
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

// Le menu déroulant d'Android n'est pas une liste de l'app : c'est une boîte de dialogue du
// système, à sa typographie et à ses couleurs, qu'aucune ligne de notre CSS ne peut toucher —
// et **sans recherche**, ce qui faisait quarante lignes à faire défiler pour atteindre le
// Cameroun sur 243 pays. Le pays passe donc par un écran à nous. Ce test refuse son retour,
// et refuse surtout que la recherche reconstruise son propre champ : sur Android, le clavier se
// refermerait à chaque caractère (même cause que la règle 16 dans la discussion).
test("aucun menu du système ne revient, et la recherche ne refait pas son champ", () => {
  const sansCommentaires = app.replace(/\/\/[^\n]*/g, '');
  assert.ok(!/<select/.test(sansCommentaires),
    "plus aucun <select> : le menu du système ne se met ni à notre typographie, ni à nos couleurs, et n'a pas de recherche");
  // Un `<datalist>` est le même piège par une autre porte : le navigateur en tire une boîte du
  // système. Sur la WebView de Telegram Android elle se dessine par-dessus l'écran, sans fond,
  // jusque sur le clavier. Les villes connues sont des pastilles, visibles d'un coup.
  assert.ok(!/<datalist|\slist="/.test(sansCommentaires),
    'plus aucun <datalist> : sa boîte se dessinait par-dessus les champs et le clavier');
  assert.match(app, /const villesProposees = \(pays, champ, valeur\) =>/, 'les villes connues passent par des pastilles');
  const poser = entre('function poserLaVille(', '// Les lignes de la liste des pays');
  assert.ok(!/render\(|SCREENS\./.test(poser), 'une pastille ne refait pas l\'écran : le clavier se fermerait');
  const recherche = entre("S.screen === 'pays' && name === 'recherche-pays'", "S.screen === 'chat' && name === 'message'");
  assert.match(recherche, /liste\.innerHTML = listeDesPays\(/, 'seule la liste est reconstruite');
  assert.ok(!/render\(/.test(recherche), 'jamais render() : il refait le champ, donc ferme le clavier');
});

// L'économie de data cachait la photo de la carte derrière un bouton. Or c'est sur cette photo
// qu'on décide d'aimer ou de passer, et elle ne coûtait qu'une image : la découverte ne charge
// que la carte du dessus (`loadCardPhoto(p)` une fois par balayage), jamais la suivante. Le
// réglage ne retenait donc presque rien, et il coûtait la décision. Il retient désormais les
// **vignettes des listes**, là où l'économie est réelle : cinquante images d'un coup.
test("la fiche qu'on décide garde sa photo, et l'économie de data reste sur les vignettes", () => {
  assert.ok(!/S\.dataSaver/.test(entre('function loadCardPhoto(p, {', 'photoUrl(p.id')),
    "la photo d'une fiche part toujours : une carte grise ne se juge pas");
  assert.match(entre('function loadAvatar(p, {', 'photoUrl(p.id'), /S\.dataSaver/,
    "les vignettes, elles, restent retenues : c'est là que l'économie existe");
  assert.match(entre('function lazyAvatars() {', 'async function changerLangue'),
    /if \(S\.dataSaver \|\| !\('IntersectionObserver' in window\)\) return;/,
    "et la liste ne va même pas les chercher");
  // Ce qui a disparu avec le bouton : il ne doit pas revenir par un coin de l'app.
  assert.ok(!/S\.revealed|data-action="reveal"/.test(app), 'plus de geste « Afficher la photo »');
});

// Le clavier réduit la fenêtre : sans écouteur, la zone des messages rétrécit et le dernier
// message passe dessous. Le parcours navigateur le rejoue pour de vrai (e2e/discussion.spec.js) ;
// ici on refuse seulement que l'écouteur disparaisse.
test('la discussion se recolle en bas quand la fenêtre change de taille', () => {
  const abonnement = entre('tg.onViewport(() => {', 'function renderChat');
  assert.match(abonnement, /if \(h === hauteurConnue\) return;/, 'pas de défilement pour une hauteur inchangée');
  assert.match(abonnement, /collerEnBas\(\)/);
  const f = entre('function collerEnBas(', 'let hauteurConnue');
  assert.match(f, /if \(!force && !S\.chatEnBas\) return;/, 'qui remonte l\'historique n\'est pas ramené de force');
  const rendu = entre('function renderChat() {', 'function updateChat');
  assert.match(rendu, /addEventListener\('scroll'/, 'et on sait s\'il y était');
  // Toucher « envoyer » retirait le focus au champ : sur Android le clavier se ferme et se
  // rouvre, et l'écran se dandine à chaque message. Rejoué en vrai dans e2e/discussion.spec.js.
  assert.match(rendu, /for \(const geste of \['pointerdown', 'mousedown'\]\)[\s\S]*preventDefault/, 'le focus ne quitte pas le champ au moment du geste');
});
