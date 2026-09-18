// Comment l'app ouvre un lien, et pourquoi la distinction n'est pas un détail de style.
//
// Telegram expose deux méthodes, et elles ne font pas la même chose :
//
//   openLink(url)          ouvre un navigateur, par-dessus la mini app.
//   openTelegramLink(url)  ouvre la discussion visée dans Telegram — sans refermer la mini app.
//                          Quand le geste est d'aller parler au bot, `{ fermer: true }` la referme.
//
// Le bouton « Enregistrer ma présentation » employait la première sur un lien t.me. Telegram
// ouvrait donc un navigateur sur la page web de t.me, laquelle cherche à rouvrir Telegram
// par-dessus la mini app : sur Android, un écran figé. Rien ne plantait, tout était bloqué.
//
// Ce test lit le code plutôt que le navigateur, parce que c'est là que la confusion se fait, et
// qu'un test de bout en bout hors de Telegram ne verrait rien : hors de Telegram, les deux
// méthodes retombent sur window.open et se ressemblent.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const lire = (f) => fs.readFileSync(new URL(`../public/${f}`, import.meta.url), 'utf8');
const sansCommentaires = (s) => s.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

// Une vraie adresse Telegram, pas les trois lettres « t.me » aperçues au milieu d'un appel :
// `S.chat.messages.at(-1)` en contient, et un test qui s'y arrête crie au loup.
const ADRESSE = /https:\/\/t\.me\//;

test('aucun lien t.me ne part par openLink', () => {
  const app = sansCommentaires(lire('app.js'));
  const fautifs = [...app.matchAll(/openLink\(([^)]*)\)/g)]
    .map((m) => m[1])
    .filter((arg) => ADRESSE.test(arg));
  assert.deepEqual(fautifs, [], 'un lien Telegram doit passer par tg.openTelegramLink');
});

test("les liens t.me de l'app passent bien par openTelegramLink ou share", () => {
  const app = sansCommentaires(lire('app.js'));
  // Chaque ligne qui fabrique une adresse t.me doit la remettre à l'une des portes connues —
  // soit tout de suite, soit dans une variable que la ligne suivante confie à tg.share().
  //
  // Il y en a **trois**, et la troisième n'est pas une navigation : le `widget_link` d'une story
  // n'est pas ouvert par l'app, il est remis à Telegram qui le dessine dans la story. Personne
  // n'est envoyé nulle part au moment du partage, donc la distinction openLink / openTelegramLink
  // ne s'y applique pas — mais l'adresse doit quand même être tracée jusqu'à elle, sans quoi la
  // porte deviendrait la fissure par où un lien t.me repartirait un jour dans un navigateur.
  const lignes = app.split('\n').filter((l) => ADRESSE.test(l));
  assert.ok(lignes.length >= 2, 'le dépôt en a plusieurs : le bot et le partage');
  for (const ligne of lignes) {
    assert.match(ligne, /openTelegramLink|tg\.share|const url =|const lien =/,
      `cette ligne fabrique un lien Telegram sans le confier à la bonne méthode : ${ligne.trim()}`);
  }
  // Et la variable de la story va bien à shareToStory, pas ailleurs.
  const debut = app.indexOf("case 'story'");
  const story = app.slice(debut, app.indexOf("case '", debut + 20));
  assert.match(story, /tg\.shareToStory\(/);
  assert.ok(!/openLink\(/.test(story), 'un lien t.me ne part jamais dans un navigateur');
});

// Les deux méthodes existent et se distinguent dans tg.js : c'est le seul endroit qui touche au
// SDK (règle 13), donc c'est là que la différence doit être écrite, une fois.
test('tg.js expose les deux, et chacune appelle la méthode Telegram qui lui correspond', () => {
  const tg = lire('tg.js');
  const bloc = (nom) => {
    const debut = tg.indexOf(`export function ${nom}(`);
    assert.ok(debut > 0, `tg.js doit exporter ${nom}`);
    return tg.slice(debut, tg.indexOf('\n}', debut));
  };
  assert.match(bloc('openTelegramLink'), /W\.openTelegramLink\(/);
  assert.ok(!/W\.openLink\(/.test(bloc('openTelegramLink')), 'openTelegramLink ne doit pas ouvrir un navigateur');
  assert.match(bloc('openLink'), /W\.openLink\(/);
  assert.ok(!/W\.openTelegramLink\(/.test(bloc('openLink')), 'openLink ne doit pas refermer la mini app');
});

// Hors de Telegram — le mode développement, et les tests de bout en bout — les deux doivent
// rester utilisables, sinon le parcours se bloque là où il n'y a rien à bloquer.
test('hors de Telegram, les deux retombent sur le navigateur', () => {
  const tg = lire('tg.js');
  for (const nom of ['openTelegramLink', 'openLink']) {
    const debut = tg.indexOf(`export function ${nom}(`);
    const bloc = tg.slice(debut, tg.indexOf('\n}', debut));
    assert.match(bloc, /window\.open\(/, `${nom} doit avoir un secours hors de Telegram`);
  }
});

// Le 18 septembre 2026, « Enregistrer ma présentation » ouvrait bien la discussion du bot… derrière
// la mini app, qui restait devant avec un toast « appuie sur le micro » et aucun micro :
// openTelegramLink ne referme pas la mini app. Les trois liens qui envoient parler au bot (la
// voix, « le bot ne peut pas te prévenir », le compte fermé) la referment donc explicitement.
test('aller parler au bot referme la mini app', () => {
  const app = sansCommentaires(lire('app.js'));
  const versLeBot = [...app.matchAll(/openTelegramLink\(`https:\/\/t\.me\/\$\{[^}]+\}\?start=(voix|prevenir|aide)`([^)]*)\)/g)];
  assert.equal(versLeBot.length, 3, 'les trois portes vers le bot');
  for (const m of versLeBot) assert.match(m[2], /\{ fermer: true \}/, `${m[1]} doit refermer la mini app`);
  const tg = sansCommentaires(lire('tg.js'));
  assert.match(tg, /export function openTelegramLink\(url, \{ fermer = false \} = \{\}\)/);
  assert.match(tg, /W\.openTelegramLink\(url\);\s*if \(fermer\) W\.close\(\);/, 'la fermeture suit l\'ouverture, dans Telegram seulement');
});
