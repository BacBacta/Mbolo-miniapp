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

// ---------- Lot 1 de l'audit UI/UX : la découverte photo d'abord ----------

test("le paquet est photo d'abord : pas de corps sous le pli, la fiche au chevron, trois boutons ronds", () => {
  const decouvrir = entre('  async discover() {', '  filters() {');
  assert.match(decouvrir, /class="deck plein"/);
  assert.match(decouvrir, /profileCard\(p, \{ cls: 'top', plein: true \}\)/);
  assert.match(decouvrir, /data-action="revenir"/);
  assert.match(decouvrir, /data-action="swipe-pass"/);
  assert.match(decouvrir, /data-action="swipe-like"/);
  assert.match(decouvrir, /tg\.setButtons\(null\)/, 'le bouton natif ne porte plus « J\'aime »');
  assert.ok(!/main: \{ text: t\("J'aime"\), onClick: \(\) => swipe/.test(decouvrir));
  // La carte pleine ne rend pas le corps ; la fiche (person) est une suite de blocs (lot 2).
  const carte = entre('function profileCard(p', '// ---------- La fiche en blocs');
  assert.match(carte, /\$\{plein \? '' : `<div class="card-body">/);
  assert.match(carte, /data-action="fiche"/);
  const fiche = entre('  person({ id }) {', '  match() {');
  assert.match(fiche, /ficheEnBlocs\(p\)/, 'la fiche est en blocs');
});

// ---------- Lot 2 de l'audit UI/UX : la fiche en blocs ----------

// La fiche était la carte du paquet en plus long : la même photo, la même question, les mêmes
// faits — rien que l'appui n'apportait. Elle est maintenant une suite de blocs, et les photos
// après la première ne partent qu'en apparaissant : ouvrir une fiche ne coûte pas trois photos.
test('la fiche est une suite de blocs : photo, question, photo, question, faits, confiance', () => {
  const f = entre('function ficheEnBlocs(p', 'function lazyBlocsPhoto(p)');
  // Une question par bloc, la première puis les supplémentaires, dans cet ordre.
  assert.match(f, /const questions = \[p\.promptA \? \{ q: p\.promptQ, a: p\.promptA \} : null, \.\.\.\(p\.extras \|\| \[\]\)\]/);
  assert.match(f, /class="bloc bloc-question"/);
  // Les photos alternent avec les questions, et celles qui restent ferment la suite.
  assert.match(f, /const autres = \(p\.photos \|\| \[\]\)\.slice\(1\);/);
  assert.match(f, /if \(autres\[i\] !== undefined\) suite\.push\(blocPhoto\(autres\[i\]\)\)/);
  assert.match(f, /autres\.slice\(questions\.length\)\.forEach\(\(n\) => suite\.push\(blocPhoto\(n\)\)\)/);
  // Les faits, la voix et la confiance ferment la fiche ; la confiance ouvre toujours l'explication.
  assert.match(f, /class="bloc bloc-faits"/);
  assert.match(f, /\$\{boutonVoix\(p\)\}/);
  assert.match(f, /class="bloc bloc-confiance">\$\{ligneConfiance\(p\)\}/);
  assert.match(entre('function ligneConfiance(p)', 'const boutonVoix'), /data-screen="jauge"/);
  // La photo de tête ne navigue pas entre les photos : elles sont des blocs, plus un carrousel.
  assert.ok(!/photo-nav/.test(f), 'la fiche ne porte pas le carrousel de la carte');
  // Rien de nouveau ne sort du serveur : la fiche ne lit que ce que la carte lisait déjà.
  for (const champ of ['p.promptA', 'p.extras', 'p.photos', 'p.compat', 'p.languages', 'p.intentLabel', 'p.voix', 'p.trust']) {
    assert.ok(f.includes(champ) || entre('const jaugeDe', 'function profileCard(p').includes(champ), `${champ} est un champ que la carte montrait déjà`);
  }
});

test("les photos de la fiche après la première ne se chargent qu'en apparaissant", () => {
  const l = entre('function lazyBlocsPhoto(p)', '// La photo d\'une fiche part toujours');
  assert.match(l, /new IntersectionObserver/);
  assert.match(l, /photoUrl\(p\.id, Number\(box\.dataset\.n\)\)/, 'la photo entière, pas la miniature : on la regarde');
  assert.ok(!/mini: true/.test(l));
  // Sans observateur, tout part : un bloc gris à vie serait pire qu'une photo de trop.
  assert.match(l, /if \(!\('IntersectionObserver' in window\)\) \{ blocs\.forEach\(charger\); return; \}/);
  const ecran = entre('  person({ id }) {', '  match() {');
  assert.match(ecran, /loadCardPhoto\(p\);\s*lazyBlocsPhoto\(p\);/, 'la photo de tête part tout de suite, les autres en apparaissant');
});

test("l'aperçu de son propre profil garde la carte : c'est ce que les autres voient dans le paquet", () => {
  const moi = entre('  me() {', 'Ton pseudo et ton numéro Telegram ne sont jamais montrés');
  assert.match(moi, /profileCard\(pp, \{ own: true \}\)/);
  assert.ok(!/ficheEnBlocs/.test(moi));
});

test('revenir sur le dernier balayage passe par le serveur, dans la minute, et jamais après un match', () => {
  const s = entre('async function swipe(action)', '// ---------- Discussion ----------');
  assert.match(s, /S\.dernierBalayage = \{ profil: p, action, at: Date\.now\(\) \}/);
  assert.match(s, /if \(r\.match\) \{\s*S\.dernierBalayage = null;/);
  assert.match(s, /api\(`\/swipes\/\$\{encodeURIComponent\(d\.profil\.id\)\}`, \{ method: 'DELETE' \}\)/);
  assert.match(entre('  async discover() {', '  filters() {'), /Date\.now\(\) - S\.dernierBalayage\.at < 60_000/);
});

test('sans pass, le mode Liste ouvre une feuille du bas, pas un écran', () => {
  const mode = entre("    case 'mode':", "    case 'venue':");
  assert.match(mode, /feuille\(\{/);
  assert.ok(!/go\('plus'\); break; \}/.test(mode.split('feuille(')[0]), "plus d'écran plein direct");
  assert.match(mode, /if \(choix === 'pass'\) \{ S\.plusRetour = 'discover'; go\('plus'\); \}/);
});

test('six pastilles de villes au plus', () => {
  assert.match(entre('const villesProposees = (pays, champ, valeur) =>', 'function poserLaVille('), /\.slice\(0, 6\)/);
});
