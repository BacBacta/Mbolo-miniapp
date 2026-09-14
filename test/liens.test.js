// Comment l'app ouvre un lien, et pourquoi la distinction n'est pas un détail de style.
//
// Telegram expose deux méthodes, et elles ne font pas la même chose :
//
//   openLink(url)          ouvre un navigateur, par-dessus la mini app.
//   openTelegramLink(url)  referme la mini app et ouvre la discussion visée.
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
  // Chaque ligne qui fabrique une adresse t.me doit la remettre à l'une des deux portes —
  // soit tout de suite, soit dans une variable que la ligne suivante confie à tg.share().
  const lignes = app.split('\n').filter((l) => ADRESSE.test(l));
  assert.ok(lignes.length >= 2, 'le dépôt en a plusieurs : le bot et le partage');
  for (const ligne of lignes) {
    assert.match(ligne, /openTelegramLink|tg\.share|const url =/,
      `cette ligne fabrique un lien Telegram sans le confier à la bonne méthode : ${ligne.trim()}`);
  }
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
