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

// L'« économie de data » a été retirée le 17 septembre 2026, après que chacun de ses effets a été
// signalé comme une panne : la carte grise, l'en-tête vide de la discussion, puis la liste
// Messages sans visages. Aucun réglage ne doit revenir retenir une photo. La seule économie qui
// reste est la bonne : une vignette de liste ne se charge que quand sa ligne apparaît à l'écran.
test("aucun réglage ne retient une photo, et les vignettes se chargent à l'apparition", () => {
  assert.ok(!/dataSaver|data_saver|dansUneListe/.test(app), "l'économie de data ne revient pas");
  assert.ok(!/S\.\w+/.test(entre('function loadCardPhoto(p, {', 'photoUrl(p.id')), 'la fiche ne consulte aucun réglage');
  assert.ok(!/S\.\w+/.test(entre('function loadAvatar(p, {', 'photoUrl(p.id')), "l'avatar non plus");
  assert.match(entre('function lazyAvatars() {', 'async function changerLangue'), /IntersectionObserver/);
  // Et une vignette ne télécharge que la miniature : la photo entière, c'est pour la carte et la
  // fiche, là où l'on décide. L'inverse — la carte sur une miniature de 160 px — se verrait.
  assert.match(entre('function loadAvatar(p, {', '\n}\n'), /photoUrl\([^)]*\{ mini: true \}\)/, "l'avatar demande la miniature");
  assert.doesNotMatch(entre('function loadCardPhoto(p, {', '\n}\n'), /mini/, 'la carte demande la photo entière');
});

// Trois écrans ouvrent une fiche de profil, et `SCREENS.person` n'en connaissait qu'un. Depuis
// l'en-tête de la discussion et depuis « se sont arrêtés sur ta fiche », l'appui tombait sur le
// `if (!p) return go('discover')` : on était **renvoyé sur Découvrir sans un mot**. Un bouton qui
// ramène ailleurs se lit comme une panne, et c'en était une.
test('une fiche s\'ouvre depuis toutes les portes qui y mènent, pas seulement le paquet', () => {
  const lookup = entre('const profilConnu = (id) =>', '// Carte de profil');
  for (const porte of ['S.people', 'S.likes', 'S.vues', 'S.chat?.other']) {
    assert.ok(lookup.includes(porte), `${porte} doit être une porte vers une fiche`);
  }
  assert.match(entre('  person({ id }) {', '    S.person = p;'), /profilConnu\(id\)/,
    "l'écran doit lire la liste des portes, pas en rouvrir une à lui");
  // « Se sont arrêtés sur ta fiche » ne range rien de lui-même : la porte reste fermée sans ça.
  assert.match(entre('  async vues() {', '    tg.setBack(() => go(\'me\'));'), /S\.vues = profiles;/);
  // Et le retour ne renvoie plus au paquet : on revient d'où l'on est venu.
  assert.match(app, /person: \(\) => S\.personFrom \|\| 'discover'/);
});

// Un match n'est ni à aimer ni à passer. « Passer » sur quelqu'un avec qui on discute aurait l'air
// de défaire le match — et ne l'aurait pas fait, ce qui est pire.
test("la fiche d'un match ne propose ni « J'aime » ni « Passer »", () => {
  const ecran = entre('  person({ id }) {', '  async chat({ id }) {');
  assert.match(ecran, /const match = S\.personFrom === 'chat' && S\.chat\?\.other\?\.id === id;/);
  assert.match(ecran, /if \(match\) tg\.setButtons\(\{ main: \{ text: t\('Écrire à \{nom\}'/);
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

// ---------- Lot 0 de l'audit UI/UX (audit/15-ui-ux-premium.md) ----------

test("la cible du retour natif se calcule à l'appui, jamais avant que l'écran soit dessiné", () => {
  // « Se protéger » depuis une discussion, puis Retour, renvoyait sur Découvrir la première
  // fois : go() lisait PARENT.protection avant que SCREENS.protection ait posé S.protection.
  const corps = entre('function go(screen', '  SCREENS[screen](params);');
  assert.ok(!/PARENT\[screen\]\?\.\(\)/.test(corps), "le parent n'est pas appelé au moment de la navigation");
  assert.match(corps, /const parentDe = PARENT\[screen\];/);
  assert.match(corps, /tg\.setBack\(parentDe \? \(\) => \{ const p = parentDe\(\);/, "il est appelé dans le gestionnaire du bouton");
});

test("les lignes de Messages portent l'heure du dernier message", () => {
  assert.match(entre('function dessinerMessages()', 'S.matches.slice(0, 8).forEach'), /class="quand">\$\{quandCourt\(m\.lastMessage\?\.at \|\| m\.createdAt\)\}/);
  const q = entre('function quandCourt(ts)', 'function dessinerMessages()');
  assert.match(q, /timeLabel\(ts, langue\(\)\)/, "aujourd'hui : l'heure");
  assert.match(q, /t\('Hier'\)/);
});

test("l'étoile Telegram est une icône, jamais l'emoji du téléphone", () => {
  assert.ok(!app.includes('⭐'), "aucun emoji ⭐ dans l'interface");
  assert.match(app, /icon\('star'/);
  // Le bouton natif ne porte que du texte : un glyphe de police, et une seule ligne.
  assert.match(app, /\$\{choisie\.stars\} ★`/);
});

test('le menu du message propose Copier, et Telegram ne reçoit jamais plus de trois boutons', () => {
  const menu = entre('async function menuDuMessage(', 'async function copier(');
  assert.match(menu, /id: 'copier'/);
  assert.match(menu, /if \(buttons\.length < 3\) buttons\.push\(\{ id: 'cancel'/);
});

test("« Tester les notifications » n'est plus un réglage de la personne", () => {
  assert.ok(!app.includes("'test-notif'"), "la ligne et son gestionnaire sont partis (c'est /test dans le bot)");
});

test("la tranche d'activité dit « Actif », la présence dit « En ligne »", () => {
  assert.match(app, /recent: t\('Actif récemment'\), today: t\("Actif aujourd'hui"\), week: t\('Actif cette semaine'\)/);
  assert.ok(!app.includes("t(\"En ligne aujourd'hui\")"));
});
