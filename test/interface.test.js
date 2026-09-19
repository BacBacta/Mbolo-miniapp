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

// Le 18 septembre 2026, sur Telegram Android sans bouton natif en bas, la hauteur annoncée par
// Telegram dépassait l'écran d'une soixantaine de pixels : le champ de saisie de la discussion
// vivait sous la barre de navigation du téléphone, et plus personne ne pouvait écrire. La
// discussion prend donc la plus petite des trois mesures — Telegram, sa valeur stable, la
// fenêtre —, parce qu'une hauteur plus grande que la fenêtre est invisible par construction.
test('la discussion ne dépasse jamais la fenêtre : la plus petite des trois hauteurs', () => {
  const css = fs.readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
  const regle = css.match(/body\.chat-mode \{ --hauteur-visible: (min\([^;]+)\); \}/);
  assert.ok(regle, 'la hauteur visible de la discussion est une variable posée sur body.chat-mode');
  for (const mesure of ['var(--tg-viewport-height, 100dvh)', 'var(--tg-viewport-stable-height, 100dvh)', '100dvh']) {
    assert.ok(regle[1].includes(mesure), `la hauteur visible tient compte de ${mesure}`);
  }
  assert.match(css, /body\.chat-mode main \{ height: var\(--hauteur-visible\);/, 'main lit cette variable, pas Telegram directement');
  assert.match(css, /fallback-bar:not\(\[hidden\]\)\) main \{ height: calc\(var\(--hauteur-visible\) - 74px\)/, 'la barre de secours en retire sa hauteur');
});

// Les mesures de la fenêtre se lisent depuis un lien (?startapp=diag), jamais depuis un menu :
// c'est un outil pour comprendre une mise en page qui ne se voit que dans la vraie WebView.
// La pastille « ♥ 2 » ne se comprend pas seule : un appui ouvre une feuille qui explique le
// compteur. Les nombres viennent du serveur (`limites.jaimeParJour`), jamais d'une constante ici.
test('la pastille du quota est un bouton, et sa feuille lit les marches du serveur', () => {
  const barre = entre('    <div class="dbar">', '</div>`;');
  assert.match(barre, /<button type="button" class="pill quota-pill" data-action="quota"/, 'la pastille se touche');
  const feuilleQuota = entre('async function expliquerLeQuota() {', 'async function porteEnFeuille(quoi) {');
  assert.match(feuilleQuota, /S\.me\?\.limites\?\.jaimeParJour/, 'les marches viennent du serveur');
  assert.ok(!/\b[25]\s*par jour|: [25]\b/.test(feuilleQuota), 'aucun nombre de quota recopié dans l\'interface');
  assert.match(feuilleQuota, /ouvrirLePass\('quota'\)/, 'la feuille mène au pass par la porte « quota »');
  assert.match(feuilleQuota, /go\(S\.me\.verification === 'pending' \? 'pending' : 'verify'\)/, 'et à la vérification quand le badge manque');
  assert.match(app, /case 'quota': expliquerLeQuota\(\); break;/);
});

test("le lien de diagnostic ouvre l'écran des mesures, et le SDK n'est lu que dans tg.js", () => {
  const boot = entre('async function boot() {', '\nboot();');
  assert.match(boot, /params\.screen === 'diag'[^\n]*go\('diag'\)/);
  const tgSrc = fs.readFileSync(new URL('../public/tg.js', import.meta.url), 'utf8');
  assert.match(tgSrc, /screen === 'diag'\) p\.screen = 'diag'/, 'startapp=diag mène à l\'écran');
  assert.match(tgSrc, /export function diagnostic\(\)/);
  const ecran = entre('  diag() {', '  jauge() {');
  assert.match(ecran, /tg\.diagnostic\(\)/);
  assert.ok(!/window\.Telegram|W\./.test(ecran), 'l\'écran ne touche pas au SDK : tout passe par tg.js');
  assert.ok(!/api\(|fetch\(/.test(ecran), 'rien ne part du téléphone');
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

test("le menu du message est une feuille à nous, avec Copier, et le popup natif ne sert qu'aux confirmations", () => {
  const menu = entre('async function menuDuMessage(', 'async function copier(');
  assert.match(menu, /id: 'copier'/);
  assert.match(menu, /await feuille\(\{/, 'une feuille, pas le popup de Telegram : un menu est une liste');
  assert.ok(!/tg\.popup/.test(menu));
  // Le popup natif reste pour confirmer : retirer un match, supprimer un message.
  assert.match(entre('async function retirerLaLigne(', '// Vignettes de la liste'), /tg\.popup\(/);
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
  assert.match(fiche, /ficheEnBlocs\(p, \{ decidable/, 'la fiche est en blocs');
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

// Le « J'aime » sur une réponse (lot 2, seconde moitié) : un cœur par réponse, une feuille avec
// un champ, et c'est la personne qui appuie — rien ne part sans elle. Le mot voyage avec le
// balayage ; l'écran de match et la carte d'ouverture nomment la réponse aimée.
test("chaque réponse de la fiche porte un cœur quand on peut encore décider, et jamais sur un match", () => {
  const f = entre('function ficheEnBlocs(p', 'function lazyBlocsPhoto(p)');
  assert.match(f, /decidable \? `<button type="button" class="coeur" data-action="aimer-reponse" data-q="\$\{esc\(x\.q\)\}"/);
  const ecran = entre('  person({ id }) {', '  match() {');
  assert.match(ecran, /const decide = !match && p\.status !== 'liked';[\s\S]*ficheEnBlocs\(p, \{ decidable: decide \}\)/);
});

test("aimer une réponse ouvre une feuille avec un champ borné, et n'envoie que sur « Envoyer »", () => {
  const a = entre('async function aimerLaReponse(q)', '// « J\'aime » ou « Passer » depuis le détail');
  assert.match(a, /champ: \{ placeholder: t\('Un mot pour l\\'accompagner \(facultatif\)'\), maxlength: MOT_MAX \}/);
  assert.match(a, /if \(r\?\.id !== 'aimer'\) return;/, 'annuler ou fermer la feuille ne fait rien');
  assert.match(a, /swipePerson\('like', \{ sur: q, mot: r\.valeur \}\)/);
  assert.match(a, /const MOT_MAX = 60;/);
  const sp = entre('async function swipePerson(action', 'function dessinerLePass() {');
  assert.match(sp, /\.\.\.\(sur \? \{ sur, mot \} : \{\}\)/, 'sans réponse visée, la requête ne change pas');
});

test("la feuille avec un champ rend le mot avec le bouton, et Entrée vaut le bouton principal", () => {
  const ui = fs.readFileSync(new URL('../public/ui.js', import.meta.url), 'utf8');
  const f = ui.slice(ui.indexOf('export function feuille('), ui.indexOf('// ---------- Squelettes'));
  assert.match(f, /resolve\(valeur !== undefined \? \{ id, valeur \} : input \? \{ id, valeur: input\.value\.trim\(\) \} : id\)/);
  assert.match(f, /if \(champ\.maxlength\) input\.maxLength = champ\.maxlength;/);
  assert.match(f, /e\.key === 'Enter'/);
});

test("l'écran de match et la carte d'ouverture nomment la réponse aimée, par sa clé de question", () => {
  const m = entre('  match() {', '  async matches(');
  assert.match(m, /m\.aime \? `<p class="lead">\$\{t\('\{nom\} a aimé ta réponse à « \{question\} »', \{ nom: esc\(m\.other\.name\), question: esc\(libelleQuestion\(m\.aime\.q\)\) \}\)\}<\/p>/);
  assert.match(m, /m\.aime\.mot \? `<p class="mot-aime">« \$\{esc\(m\.aime\.mot\)\} »<\/p>`/);
  const o = entre('function ouverture(c)', 'function poserLAmorce');
  assert.match(o, /c\.aime \? `<p class="lead">\$\{t\('\{nom\} a aimé ta réponse à « \{question\} »'/);
  assert.match(app, /aime: data\.aime \|\| null,/, 'la discussion retient ce que le premier appel a dit');
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

// ---------- Lot 3 de l'audit UI/UX : structure et navigation ----------

// Six écrans avant le premier visage (constat A) : la jauge et la voix s'intercalaient entre le
// profil et la découverte. Elles restent atteignables — la jauge depuis les pastilles de la carte,
// la voix depuis l'onglet Profil — mais ne s'imposent plus.
test("ni la jauge ni la voix ne s'intercalent entre le profil et la découverte", () => {
  const save = entre('async function saveProfile()', 'async function sendSelfie()');
  assert.ok(!/go\('jauge'\)/.test(save), "l'enregistrement du profil mène à la vérification");
  assert.match(save, /go\('verify'\)/);
  const statut = entre('async function refreshStatus()', 'let swiping = false;');
  assert.ok(!/go\('voix'\)/.test(statut), 'la vérification mène à la découverte');
  assert.ok(!app.includes('jauge_vue') && !app.includes('voix_vue'), "plus de drapeaux « vu une fois »");
  // La jauge à un appui depuis la carte, et le retour d'où elle a été ouverte.
  assert.match(entre('function profileCard(p', '// ---------- La fiche en blocs'), /<button type="button" class="overlay-trust" data-action="go" data-screen="jauge"/);
  assert.match(app, /if \(screen === 'jauge' && S\.screen !== 'jauge'\) S\.jaugeRetour = S\.screen;/);
});

// La photo d'abord (constat B) : c'est l'actif principal d'une fiche, et la mettre en troisième
// étape disait le contraire.
test('la photo est en première étape du profil, avec le prénom et l\'âge', () => {
  const form = entre('  profile() {', '  // Aucune entrée fichier ne porte `capture`');
  const etape0 = form.slice(form.indexOf('const bodies = ['), form.indexOf("<label class=\"field\"><span class=\"label\">${t('Prénom')}"));
  assert.match(etape0, /photo-slots premiere/, 'les emplacements sont dans la première étape');
  assert.ok(!/photo-slots/.test(form.slice(form.indexOf("${t('Une question sur toi')}"))), 'et plus dans la troisième');
  assert.match(form, /if \(step === 0\) emplacementsPhoto\(\)/, 'les photos existantes se chargent à la première étape');
  assert.match(entre('function completion()', 'function discoverBar()'), /done: \(S\.me\.photos \|\| \[\]\)\.length > 0, step: 0/);
});

// Trois écrans en un (constats V, W) : l'onglet Profil garde l'en-tête, la complétion, la fiche et
// la voix ; tout le reste est derrière le SettingsButton, en groupes.
test("les réglages sont derrière le SettingsButton, en groupes, et l'onglet Profil ne les liste plus", () => {
  assert.match(app, /tg\.onSettings\(\(\) => go\('reglages'\)\)/);
  assert.match(app, /if \(screen === 'settings'\) screen = 'reglages';/);
  const moi = entre('  me() {', '  reglages() {');
  for (const partie of ['data-screen="langue"', 'data-action="delete"', 'name="discretion"', 'data-action="invite"', 'data-screen="confiance"']) {
    assert.ok(!moi.includes(partie), `${partie} a quitté l'onglet Profil`);
  }
  assert.match(moi, /tg\.hasSettingsButton\(\) \? '' :/, 'la ligne « Réglages » ne double pas le bouton natif');
  const reglages = entre('  reglages() {', '// Ce qui remplace un `<select>`');
  for (const groupe of ["t('Compte')", "t('Sécurité')", "t('{app} Plus', { app: APP })", "t('Faire connaître {app}', { app: APP })"]) {
    assert.ok(reglages.includes(groupe), `le groupe ${groupe} existe`);
  }
  assert.match(reglages, /data-action="delete"/);
  // Ce qui s'ouvre depuis les réglages y revient.
  assert.match(app, /const retourReglages = \(\) => \(S\.ecranPrecedent === 'reglages' \? 'reglages' : 'me'\);/);
  assert.match(app, /vues: retourReglages, voix: retourReglages, reglages: \(\) => 'me', confiance: retourReglages/);
});

// Les transitions ont une direction (constat AE) : un enfant entre par la droite, le retour par
// la gauche, les onglets fondent. C'est go() qui le sait, avant que l'écran change.
test("go() donne une direction à l'entrée de l'écran, calculée avant de changer d'écran", () => {
  const g = entre('function go(screen, params = {}) {', '  S.screen = screen;');
  assert.match(g, /const direction = PARENT\[dOu\]\?\.\(\) === screen \? 'gauche' : PARENT\[screen\] \? 'droite' : 'fondu';/);
  assert.ok(!/PARENT\[screen\]\?\.\(\)/.test(g), "le parent de l'écran qui arrive n'est jamais lu avant qu'il soit dessiné");
  assert.match(g, /app\.dataset\.entree = direction;/);
  const css = fs.readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
  assert.match(css, /main\[data-entree="droite"\] > \* \{ animation-name: entre-droite/);
  assert.match(css, /main\[data-entree="gauche"\] > \* \{ animation-name: entre-gauche/);
  // Et le secondaire est toujours un fantôme, le principal toujours plein (constat AD).
  assert.match(css, /\.fallback-bar \.secondary \{ background: transparent;/);
});

// Balayer une ligne de Messages vers la gauche découvre « Retirer » (constat T) : le geste est
// horizontal, une ligne ouverte se referme au premier appui, et retirer passe par la confirmation.
test('une ligne de Messages se balaie vers la gauche pour retirer le match, avec confirmation', () => {
  const liste = entre('  async matches({ silent = false } = {}) {', '// La suite des écrans, après l\'onglet Messages.');
  assert.match(liste, /<div class="row-swipe" data-id="\$\{m\.id\}"><button type="button" class="row-action" data-action="retirer-ligne"/);
  assert.match(liste, /balayageDesLignes\(\);/);
  const b = entre('function balayageDesLignes()', 'async function retirerLaLigne(');
  assert.match(b, /axe = Math\.abs\(mx\) > Math\.abs\(my\) \? 'x' : 'y'/, "un défilement vertical n'ouvre pas la ligne");
  assert.match(b, /Math\.max\(-LARGEUR_RETIRER, Math\.min\(0,/, 'vers la gauche seulement, et pas plus loin que le bouton');
  assert.match(b, /if \(ouverte\) \{ e\.preventDefault\(\); e\.stopPropagation\(\);/, "une ligne ouverte se referme au lieu d'ouvrir la discussion");
  const r = entre('async function retirerLaLigne(', '// Vignettes de la liste');
  assert.match(r, /if \(reponse !== 'ok'\) return;/);
  assert.match(r, /method: 'DELETE'/);
});

// ---------- Lot 4 de l'audit UI/UX : la discussion, dernier tiers ----------

test("les réactions sont six, fermées, dans la feuille du menu, et la bulle change en place", () => {
  assert.match(app, /const REACTIONS = \['❤️', '😂', '😮', '😢', '👍', '🔥'\];/);
  const menu = entre('async function menuDuMessage(', 'async function porteEnFeuille(');
  assert.match(menu, /reactions: REACTIONS,/);
  assert.match(menu, /mienne: m\.reactions\?\.moi \|\| null,/);
  assert.match(menu, /if \(choix\?\.id === 'reaction'\) return reagir\(id, choix\.valeur === m\.reactions\?\.moi \? null : choix\.valeur\);/, 'la même réaction une seconde fois la retire');
  const r = entre('async function reagir(id, emoji)', 'const reactionsHtml');
  assert.match(r, /peindreReactions\(m\);\s*tg\.haptic\('light'\);/, "la bulle change avant la réponse du serveur");
  assert.match(r, /m\.reactions = avant;/, 'un refus remet l\'état d\'avant');
  assert.match(entre('function peindreReactions(m)', 'function majReactions('), /bulle\.querySelector\('\.reacts'\)\?\.remove\(\);/);
  assert.match(app, /if \(data\.reagis\?\.length\) majReactions\(data\.reagis\);/, "l'interrogation rattrape les réactions");
});

test("la photo passe par un aperçu et une légende avant de partir, et Annuler ne fait rien", () => {
  const f = entre('async function envoyerLaPhoto(file, input)', 'async function sendDate()');
  assert.match(f, /const feuilleLegende = await feuille\(\{\s*image: photo,/);
  assert.match(f, /if \(feuilleLegende\?\.id !== 'envoyer' \|\| S\.screen !== 'chat' \|\| !S\.chat\) \{ if \(input\) input\.value = ''; return; \}/);
  assert.match(f, /body: \{ photo, \.\.\.\(legende \? \{ text: legende \} : \{\}\)/);
});

test("la ligne de déblocage est sous l'en-tête, fine, et plus dans le fil", () => {
  const rc = entre('function renderChat()', 'function updateChat(');
  assert.match(rc, /<\/div>\s*\$\{barreDeDeblocage\(c\)\}\s*<div class="messages"/, "sous l'en-tête, avant le fil");
  assert.match(app, /return `\$\{dateCards\}<div class="spacer"><\/div>\$\{ouverture\(c\)\}`;/, 'plus dans la tête du fil');
  assert.match(entre('function barreDeDeblocage(c)', 'function chatBulles('), /t\('Liens et numéros à \{n\}', \{ n: c\.unlockAfter \}\)/);
});

test("sans lieu partenaire dans la ville, la discussion n'a pas de bouton principal", () => {
  const c = entre('  async chat({ id }) {', '  async date() {');
  assert.match(c, /tg\.setButtons\(S\.me\.options\?\.lieuxIci\s*\? \{ main: \{ text: t\('Proposer un rendez-vous'\)/);
  assert.match(c, /: \(S\.me\.confiance \? jePars : null\)\)/, "« Je pars » reste en secondaire quand une personne de confiance existe");
});

test("la tuile floutée porte un cadenas, et son appui ouvre une feuille, pas l'écran du pass", () => {
  assert.match(app, /const avatarFlou = \(src, size = 'md'\) => .*<span class="cadenas">\$\{icon\('lock', 12\)\}<\/span>/);
  assert.ok(!/data-action="plus" data-quoi="likes">\$\{avatarFlou/.test(app) && !/data-action="plus" data-quoi="vues">\$\{avatarFlou/.test(app));
  assert.match(app, /data-action="porte-feuille" data-quoi="likes">\$\{avatarFlou\(src\)\}/);
  assert.match(app, /data-action="porte-feuille" data-quoi="vues">\$\{avatarFlou\(src\)\}/);
  const pf = entre('async function porteEnFeuille(quoi)', 'const REACTIONS');
  assert.match(pf, /if \(r === 'pass'\) ouvrirLePass\(quoi\);/);
});

// ---------- Lot 5 de l'audit UI/UX : la finition continue ----------

const css = fs.readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');

// Le texte suit le réglage du téléphone (constat AA) : 100 % de la taille système, et les tailles
// de lecture en rem. Ce qui est posé sur une photo reste en pixels : l'image le dimensionne.
test("le texte est en rem et suit la taille du système, les composants de photo restent en pixels", () => {
  assert.match(css, /html \{ font-size: 100%; \}/);
  assert.match(css, /font: \.96875rem\/1\.5 var\(--font-ui\);/, 'le corps');
  for (const sel of ['h1 {', '.lead {', '.list-row .title {', '.bubble {', '.eyebrow {', '.fine {']) {
    const ligne = css.split('\n').find((l) => l.startsWith(sel));
    assert.ok(ligne, `${sel} existe`);
    assert.ok(!/font-size: [0-9.]+px/.test(ligne), `${sel} n'est plus en pixels`);
  }
  const photo = css.split('\n').find((l) => l.startsWith('.overlay .name {'));
  assert.match(photo, /font-size: 38px/, 'le prénom sur la photo garde ses pixels');
});

// L'ambre sur le voile d'une photo tombait sous 3:1 (constat AC) : le mot est en --on-photo,
// l'ambre ne reste que sur un point devant lui.
test("l'ambre ne porte plus un texte posé sur une photo", () => {
  const act = css.split('\n').find((l) => l.startsWith('.overlay .line .act {'));
  assert.match(act, /color: var\(--on-photo\)/);
  assert.ok(!/var\(--gold\)/.test(act));
  assert.match(css, /\.overlay \.line \.act::before \{ content: ''; .*background: var\(--gold\)/);
});

// Chaque écran secondaire a un ancrage visuel (constat X) : la jauge montre la jauge, la voix une
// onde, la personne de confiance le message qu'elle recevra, les vues le nombre en grand.
test('les écrans secondaires ont chacun un ancrage visuel', () => {
  assert.match(entre('  jauge() {', '  // Choisir un pays'), /<div class="jauge-visuel" aria-hidden="true">/);
  assert.match(entre('  voix() {', '  supprime() {'), /<div class="onde" aria-hidden="true">/);
  assert.match(entre('  confiance() {', '  async plus() {'), /<div class="apercu-message" aria-hidden="true">/);
  assert.match(entre('  async vues() {', '  jauge() {'), /<p class="chiffre">/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.onde i, \.jauge-visuel/, 'les ancrages animés se taisent sous reduced-motion');
});

test('la spécification du mouvement est écrite dans styles.css, avec ses durées et ses courbes', () => {
  assert.match(css, /Spécification du mouvement/);
  for (const mot of ['120 ms', '200 ms', '220 ms', '260 ms', '--ease', '--spring', 'prefers-reduced-motion']) assert.ok(css.includes(mot), mot);
});


// Audit 16, lot A : l'entrée sous « badge ». Le bouton natif de l'écran de vérification ne dit
// plus « Plus tard » (n° 1), le selfie envoyé mène à Découvrir et non à une salle d'attente
// (n° 2), l'erreur d'un formulaire revient à l'écran avec le focus sur le champ fautif (n° 3),
// rien n'est vendu à la première inscription (n° 11), et le rendez-vous n'est annoncé que là
// où un lieu partenaire existe (n° 18).
test("l'écran de vérification met le geste devant, et « Plus tard » n'est plus le bouton principal", () => {
  const verify = entre('  async verify(', '  pending() {');
  assert.doesNotMatch(verify, /main: \{ text: t\('Plus tard'\)/, '« Plus tard » n\'est jamais le bouton principal');
  assert.match(verify, /data-action="go" data-screen="discover">\$\{t\('Plus tard'\)\}/, 'il est un lien texte sous la carte du geste');
  assert.ok(verify.indexOf('gesture-card') < verify.indexOf('${gains}'), 'le geste et le bouton passent avant les avantages');
  assert.match(verify, /S\.me\.options\?\.lieuxIci \? listRow\(\{ iconName: 'coffee'/, 'le rendez-vous n\'est annoncé que là où un lieu existe');
});

test('sous « badge », le selfie envoyé mène à Découvrir, et une veille dit quand le bouclier arrive', () => {
  const envoi = entre('async function sendSelfie() {', 'async function refreshStatus() {');
  assert.match(envoi, /if \(entreeLibre\(\)\) \{[\s\S]*veillerLaVerification\(\);\s*go\('discover'\);[\s\S]*\} else \{\s*go\('pending'\);/);
  const veille = entre('function veillerLaVerification() {', 'async function refreshStatus() {');
  assert.match(veille, /if \(S\.screen === 'discover' \|\| S\.screen === 'me'\) go\(S\.screen\);/, 'seuls les écrans qui montrent le badge sont redessinés');
  assert.doesNotMatch(veille, /go\('discover'\)|go\('chat'/, 'la veille ne change jamais d\'écran');
  const pending = entre('  pending() {', '  // Le paquet');
  assert.match(pending, /entreeLibre\(\)\s*\? \{ main: \{ text: t\('Découvrir en attendant'\)/, 'l\'écran d\'attente ouvre la découverte sous « badge »');
});

test("l'erreur d'un formulaire revient à l'écran, avec le focus sur le champ fautif", () => {
  const erreur = entre('function showError(', 'const listRow =');
  assert.match(erreur, /scrollIntoView/);
  assert.match(erreur, /if \(e\.champ\) app\.querySelector\(`\[name="\$\{e\.champ\}"\]`\)\?\.focus\(\)/);
  const etape = entre('function erreurDEtape(step) {', 'function nextStep() {');
  assert.match(etape, /champ: 'age'/);
  assert.match(etape, /champ: 'name'/);
  assert.match(etape, /champ: 'promptA'/);
});

test("rien n'est vendu à la première inscription", () => {
  const suite = entre('  const suite = extras.length < plafond', '  return blocs + suite;');
  // Et rien n'est vendu non plus là où le pass ne se vend pas (PLUS_SANS_VENTE_PAYS).
  assert.match(suite, /extras\.length < total - 1 && S\.me\?\.profile && passEnVente\(\)\s*\? porteDuPass\(\{ quoi: 'questions'/);
});

// Audit 16, lot B (n° 4) : le bot ne peut écrire qu'à qui l'a autorisé, et la demande ne vivait
// qu'à l'envoi du selfie. Elle vit maintenant à l'enregistrement du premier profil aussi, un
// refus laisse une ligne dans l'onglet Profil, et cette ligne ouvre le bot par openTelegramLink.
test("le droit d'écrire au bot se demande dès le premier profil, et un refus laisse une porte", () => {
  const save = entre('async function saveProfile() {', 'async function sendSelfie() {');
  assert.match(save, /const premiere = !S\.me\.profile;/);
  assert.match(save, /if \(premiere\) await demanderLAccesAuBot\(\);/, 'demandé à la première inscription');
  const selfie = entre('async function sendSelfie() {', 'function veillerLaVerification() {');
  assert.match(selfie, /await demanderLAccesAuBot\(\);/, 'et toujours à l\'envoi du selfie');
  assert.doesNotMatch(app.replace(/function demanderLAccesAuBot[\s\S]*?\n\}/, ''), /tg\.requestWriteAccess\(/, 'une seule porte vers la demande');
  const me = entre('  me() {', '  async reglages() {');
  assert.match(me, /pp && botMuet\(\) \?[\s\S]*action: 'ouvrir-bot'/, 'la ligne de l\'onglet Profil quand le bot est muet');
  const ouvrir = entre('function ouvrirLeBot() {', 'function noterEtape(');
  assert.match(ouvrir, /tg\.openTelegramLink\(`https:\/\/t\.me\/\$\{S\.me\.botUsername\}\?start=prevenir`, \{ fermer: true \}\)/);
});

// Audit 16, lot C : le quota et le paquet. À zéro, le ♥ n'appelle pas le serveur et ouvre la
// feuille du quota ; un 429 ouvre la même feuille et jamais un toast (n° 6) ; la pastille attend
// son nombre (n° 7) ; le paquet vide mène à une ville et à l'invitation, pas au cadenas (n° 5) ;
// et chaque icône demandée existe dans PATHS (n° 15 : « card » et « rows » n'existaient pas).
test("à zéro, le ♥ explique au lieu d'appeler, et le 429 ouvre la même feuille", () => {
  const swipe = entre('async function swipe(action) {', 'async function revenir() {');
  assert.match(swipe, /if \(action === 'like' && quotaEpuise\(\)\) return expliquerLeQuota\(\);/);
  assert.match(swipe, /if \(!surLaLimite\(e\)\) showError\(e\);/);
  const personne = entre('async function swipePerson(action', '// Écrans');
  assert.match(personne, /if \(action === 'like' && quotaEpuise\(\)\) return expliquerLeQuota\(\);/);
  assert.match(personne, /if \(!surLaLimite\(e\)\) showError\(e, null\);/);
  const limite = entre('function surLaLimite(e) {', 'async function swipe(action) {');
  assert.match(limite, /e\?\.code !== 'DAILY_LIMIT'/);
  assert.match(limite, /S\.remaining = 0;\s*expliquerLeQuota\(\);/);
  assert.match(app, /class="rond like\$\{quotaEpuise\(\) \? ' epuise' : ''\}"/, 'le ♥ s\'éteint à zéro, et reste un bouton');
  assert.doesNotMatch(app, /Tu as vu tous tes profils du jour/, 'le message faux ne revient pas');
});

test("la pastille du quota attend son nombre, et le paquet vide mène à une porte ouverte", () => {
  const barre = entre('function discoverBar() {', 'function profileCard(');
  assert.match(barre, /!S\.quota \? `<span class="pill quota-pill attente" aria-hidden="true">/);
  const vide = entre('        titre = t("Personne d\'autre dans cette zone pour l\'instant");', '      } else if (v.horsTranche) {');
  assert.match(vide, /t\('Changer de ville'\)/);
  assert.match(vide, /secondaire = \{ text: t\('Inviter'\), onClick: inviter \};/);
  assert.doesNotMatch(vide, /t\('Changer de zone'\)/);
});

test("chaque icône demandée par l'interface existe dans ui.js", () => {
  const ui = fs.readFileSync(new URL('../public/ui.js', import.meta.url), 'utf8');
  const paths = ui.slice(ui.indexOf('const PATHS = {'), ui.indexOf('};', ui.indexOf('const PATHS = {')));
  const connues = new Set([...paths.matchAll(/^  '?([a-z-]+)'?: '/gm)].map((m) => m[1]));
  const demandees = new Set([
    ...[...app.matchAll(/icon\('([a-z-]+)'/g)].map((m) => m[1]),
    ...[...app.matchAll(/iconName: '([a-z-]+)'/g)].map((m) => m[1]),
    ...[...app.matchAll(/icon\(limite\('liste'\) \? '([a-z-]+)' : '([a-z-]+)'/g)].flatMap((m) => [m[1], m[2]]),
  ]);
  const absentes = [...demandees].filter((n) => !connues.has(n));
  assert.deepEqual(absentes, [], `icônes demandées sans tracé : ${absentes.join(', ')}`);
  assert.ok(connues.has('card') && connues.has('rows'), 'le sélecteur Cartes / Liste a ses deux icônes');
});

// Audit 16, lot D : les mots et les fins. Un compte fermé a son écran et un bouton vers le bot
// (n° 13) ; un compte supprimé peut fermer la mini app (n° 14) ; la fiche décide avec les mêmes
// ronds que le paquet (n° 16) ; remettre les filtres à zéro n'enregistre pas (n° 17) ; le bandeau
// réseau part quand le réseau répond (n° 20) ; la carte du pass ne passe devant les discussions
// que s'il y a quelqu'un derrière (n° 12).
test("un compte fermé a son écran et un bouton vers le bot, pas « Réessayer »", () => {
  const erreur = entre('function renderError(e, retry) {', 'const ACTIVITY_LABELS');
  assert.match(erreur, /if \(e\.code === 'BANNED'\) \{[\s\S]*t\('Ton compte est fermé'\)[\s\S]*tg\.openTelegramLink\(`https:\/\/t\.me\/\$\{e\.bot\}\?start=aide`, \{ fermer: true \}\)/);
  assert.match(app, /\.\.\.\(data\.bot \? \{ bot: data\.bot \} : \{\}\)/, 'le nom du bot voyage avec l\'erreur');
  const supprime = entre('  supprime() {', '  // Odo Plus');
  assert.match(supprime, /tg\.inTelegram \? \{ main: \{ text: t\('Fermer'\), onClick: tg\.close \} \} : null/);
});

test('la fiche décide avec les mêmes boutons ronds que le paquet, jamais une barre native', () => {
  const fiche = entre('  person({ id }) {', '  async chat({ id }) {');
  assert.match(fiche, /class="deck-actions sous-fiche"/);
  assert.match(fiche, /data-action="fiche-like"/);
  assert.match(fiche, /data-action="fiche-pass"/);
  assert.doesNotMatch(fiche, /main: \{ text: t\("J'aime"\)/);
  assert.doesNotMatch(fiche, /secondary: \{ text: t\('Passer'\)/);
  assert.match(app, /case 'fiche-like': swipePerson\('like'\); break;/);
});

test("remettre les filtres à zéro remplit les champs sans enregistrer, et le bandeau réseau part quand le réseau répond", () => {
  const zero = entre('function remettreLesFiltresAZero() {', 'async function saveFilters(values) {');
  assert.doesNotMatch(zero, /saveFilters|api\(/, 'rien ne part au serveur');
  assert.match(zero, /SCREENS\.filters\(\);/);
  assert.match(app, /secondary: \{ text: t\('Tout remettre à zéro'\), onClick: remettreLesFiltresAZero \}/);
  assert.doesNotMatch(app, /t\('Tout voir'\)/);
  const poll = entre('async function pollChat() {', 'function arreterLePoll');
  assert.match(poll, /if \(S\.chat\.notice && S\.chat\.noticeReseau\) \{[\s\S]*S\.chat\.notice = null;/);
  assert.equal((app.match(/S\.chat\.noticeReseau = e\.code === 'NETWORK';/g) || []).length, 2, 'les deux endroits qui posent un bandeau disent s\'il vient du réseau');
});

test("la carte du pass ne passe devant les discussions que si quelqu'un a aimé", () => {
  const messages = entre('  async matches({ silent = false } = {}) {', '  me() {');
  assert.match(messages, /const quelquUn = S\.likes\.length \|\| S\.likesN \|\| S\.likesFlous\.length;/);
  assert.match(messages, /const enTete = quelquUn \? likesStrip : '';/);
  assert.match(messages, /const enQueue = quelquUn \? '' : likesStrip;/);
});

// Audit 16, lot E : ce qui se perd. La première inscription a un brouillon sur l'appareil, sans
// la photo, effacé à l'enregistrement et à la suppression (n° 8) ; un envoi de photo a son
// propre délai, et un profil déjà enregistré ne repart pas avec la photo qui a échoué (n° 9).
test("la première inscription a un brouillon sans photo, effacé à l'enregistrement et à la suppression", () => {
  const brouillon = entre('const BROUILLON =', "const BOT_MUET = 'bot_muet';");
  assert.match(brouillon, /if \(!S\.form \|\| S\.me\?\.profile\) return;/, 'jamais après le premier profil');
  assert.match(brouillon, /const \{ photos, \.\.\.texte \} = S\.form;/, 'jamais la photo');
  const profil = entre('  profile() {', '    const step = S.formStep;');
  assert.match(profil, /const brouillon = !S\.form && !S\.me\.profile \? lireLeBrouillon\(\) : null;/);
  assert.match(profil, /\.\.\.\(brouillon\?\.form \|\| \{\}\),/);
  const saisie = entre("app.addEventListener('input'", "} else if (S.screen === 'pays'");
  assert.equal((saisie.match(/sauverLeBrouillon\(\);/g) || []).length, 2, 'chaque saisie le sauve');
  const fin = entre('async function envoyerLesPhotosPuisFinir() {', '// Aujourd');
  assert.match(fin, /S\.form = null;\s*S\.formStep = 0;\s*oublierLeBrouillon\(\);/, 'effacé à l\'enregistrement');
  assert.match(app, /S\.supprime = true;\s*oublierLeBrouillon\(\);/, 'et avec le compte');
});

test("une photo a son propre délai, et un profil enregistré ne repart pas avec elle", () => {
  assert.match(app, /async function api\(path, \{ method = 'GET', body, delai = DELAI_MAX_MS \} = \{\}\)/);
  assert.match(app, /setTimeout\(\(\) => stop\.abort\(\), delai\)/);
  const save = entre('async function saveProfile() {', 'const delaiPourEnvoyer');
  assert.doesNotMatch(save, /me\/photos/, 'le profil ne renvoie plus les photos lui-même');
  assert.match(save, /await envoyerLesPhotosPuisFinir\(\);/);
  const photos = entre('async function envoyerLesPhotosPuisFinir() {', '  S.form = null;');
  assert.match(photos, /delai: delaiPourEnvoyer\(v\)/);
  assert.match(photos, /photos\[n\] = 'keep';/, 'une photo partie ne repart pas');
  assert.match(photos, /e\?\.code === 'NETWORK' \? t\("La photo n'est pas partie : réessaie\."\) : e\?\.message/, 'le réseau a son mot, le serveur garde le sien');
  assert.match(photos, /t\('Ton profil est enregistré\.'\)/);
  assert.match(save, /oublierLeBrouillon\(\);\s*await envoyerLesPhotosPuisFinir\(\);/, 'le brouillon part dès que le profil est enregistré');
  assert.match(photos, /onClick: envoyerLesPhotosPuisFinir/, 'réessayer ne renvoie que les photos');
});

// Audit 16, n° 19 : la carte et la fiche ne montrent la fraction « n sur 2 » que si le serveur dit
// qu'un second critère est atteignable ; avant, « Vérifié » seul. L'interface ne recopie pas la
// règle, elle lit `options.jaugeEnFraction`, et un serveur qui ne le dit pas garde la fraction.
test("« Vérifié » seul sur la carte et la fiche tant que le serveur ne montre pas la fraction", () => {
  assert.match(app, /const jaugeEnFraction = \(\) => S\.me\?\.options\?\.jaugeEnFraction !== false;/);
  const ligne = entre('function ligneConfiance(p) {', '// Le bouton d\'écoute');
  assert.match(ligne, /if \(!jaugeEnFraction\(\)\) \{[\s\S]*badgeSeul\(tr\)/, 'la fiche');
  assert.match(app, /class="overlay-trust"[^\n]*\$\{jaugeEnFraction\(\) \? `<span class="trust-pips">[\s\S]*` : badgeSeul\(tr\)\}/, 'la carte');
  const badge = entre('const badgeSeul =', 'function ligneConfiance');
  assert.match(badge, /t\('Vérifié'\) : t\('Pas encore vérifié'\)/);
  const jauge = entre('  jauge() {', '  pays() {');
  assert.match(jauge, /t\('Confiance \{n\} sur \{total\}'/, "l'écran d'explication garde la fraction");
  assert.match(jauge, /S\.me\.options\.jaugeCompleteLe/, 'et dit quand elle revient sur les cartes');
});
