// Flouter, ou renoncer.
//
// styles.css sait déjà renoncer au flou quand le navigateur ne sait pas le faire, ou quand la
// personne demande moins de transparence. Restait le cas qu'aucune requête CSS ne sait poser :
// un téléphone qui sait flouter mais le rend lentement — la cible de l'app, précisément.
// La décision se mesure donc, et ces tests figent ce qu'elle décide.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { verreOpaque, reglerLeVerre, MEMOIRE_FAIBLE_GIO, IMAGE_LENTE_MS } = await import('../public/ui.js');

test('un appareil qui annonce peu de mémoire renonce au flou sans attendre la mesure', () => {
  for (const memoire of [0.25, 0.5, 1, MEMOIRE_FAIBLE_GIO]) {
    assert.equal(verreOpaque({ memoire }), true, `${memoire} Gio devrait suffire à trancher`);
  }
});

test('un appareil confortable garde le flou', () => {
  for (const memoire of [4, 8]) {
    assert.equal(verreOpaque({ memoire }), false, `${memoire} Gio ne doit pas déclencher le repli`);
  }
});

test('un rendu franchement lent coupe le flou, un rendu correct le garde', () => {
  assert.equal(verreOpaque({ memoire: 8, imageMedianeMs: IMAGE_LENTE_MS + 1 }), true);
  // 60 images par seconde, et même 30 tout juste : on ne punit pas un appareil qui tient.
  assert.equal(verreOpaque({ memoire: 8, imageMedianeMs: 16.7 }), false);
  assert.equal(verreOpaque({ memoire: 8, imageMedianeMs: IMAGE_LENTE_MS }), false, 'le seuil lui-même passe');
});

// Rendre l'app opaque à tort est pire que garder un flou coûteux : sans signal, on ne touche à rien.
test('sans rien savoir, on garde le flou', () => {
  assert.equal(verreOpaque(), false);
  assert.equal(verreOpaque({}), false);
  assert.equal(verreOpaque({ memoire: null, imageMedianeMs: null }), false);
  // navigator.deviceMemory absent vaut 0 chez certains navigateurs : ce n'est pas « peu de mémoire »
  assert.equal(verreOpaque({ memoire: 0 }), false, '0 veut dire « je ne sais pas », pas « minuscule »');
});

// Le repli doit exister dans la feuille de style, sinon la décision ne change rien à l'écran.
test('l\'attribut posé par la décision éteint bien les trois jetons du verre', () => {
  const css = fs.readFileSync(path.join(RACINE, 'public', 'styles.css'), 'utf8');
  const bloc = css.match(/:root\[data-verre="opaque"\]\s*\{([^}]*)\}/);
  assert.ok(bloc, 'styles.css doit porter une règle :root[data-verre="opaque"]');
  for (const jeton of ['--glass-blur: none', '--glass:', '--glass-photo:']) {
    assert.ok(bloc[1].includes(jeton), `le repli doit redéfinir ${jeton}`);
  }
});

// Les trois chemins vers le repli doivent donner le même résultat : un seul repli, trois façons
// d'y arriver. Si l'un d'eux dérive, l'app aura deux apparences dégradées différentes.
test('les trois replis du verre sont identiques', () => {
  const css = fs.readFileSync(path.join(RACINE, 'public', 'styles.css'), 'utf8');
  const replis = [...css.matchAll(/--glass-blur:\s*none;([\s\S]*?)\}/g)]
    .map((m) => m[1].replace(/\s+/g, ' ').trim());
  assert.equal(replis.length, 3, 'trois chemins : @supports, prefers-reduced-transparency, data-verre');
  assert.equal(new Set(replis).size, 1, `les replis ont divergé :\n${replis.join('\n')}`);
});

// La décision est retenue : la mesure d'une seule session est bruitée, l'appareil ne change pas.
test('une décision déjà prise s\'applique sans remesurer', async () => {
  const racine = { attributs: {}, setAttribute(n, v) { this.attributs[n] = v; } };
  let mesures = 0;
  const opaque = await reglerLeVerre({
    racine,
    stockage: { getItem: () => 'opaque', setItem: () => {} },
    memoire: 8,
    mesurer: async () => { mesures += 1; return 8; },
  });
  assert.equal(opaque, true);
  assert.equal(racine.attributs['data-verre'], 'opaque');
  assert.equal(mesures, 0, 'une décision retenue ne doit rien remesurer');
});

test('sans décision retenue, la mémoire tranche avant de faire ramer l\'appareil', async () => {
  const racine = { attributs: {}, setAttribute(n, v) { this.attributs[n] = v; } };
  let mesures = 0;
  const retenu = [];
  const opaque = await reglerLeVerre({
    racine,
    stockage: { getItem: () => null, setItem: (_, v) => retenu.push(v) },
    memoire: 1,
    mesurer: async () => { mesures += 1; return 8; },
  });
  assert.equal(opaque, true);
  assert.equal(mesures, 0, 'un appareil qui annonce 1 Gio n\'a pas besoin qu\'on le mesure');
  assert.deepEqual(retenu, ['opaque'], 'la décision est retenue pour la prochaine ouverture');
});

test('sur un appareil confortable, c\'est la mesure qui décide', async () => {
  const essai = async (imageMedianeMs) => {
    const racine = { attributs: {}, setAttribute(n, v) { this.attributs[n] = v; } };
    const retenu = [];
    const opaque = await reglerLeVerre({
      racine,
      stockage: { getItem: () => null, setItem: (_, v) => retenu.push(v) },
      memoire: 8,
      mesurer: async () => imageMedianeMs,
    });
    return { opaque, pose: racine.attributs['data-verre'], retenu };
  };
  assert.deepEqual(await essai(16.7), { opaque: false, pose: 'flou', retenu: ['flou'] });
  assert.deepEqual(await essai(60), { opaque: true, pose: 'opaque', retenu: ['opaque'] });
});

// Navigation privée : localStorage jette à la lecture comme à l'écriture. L'app doit décider
// quand même, sans jamais laisser l'erreur remonter jusqu'au démarrage.
test('un stockage qui refuse ne fait rien échouer', async () => {
  const racine = { attributs: {}, setAttribute(n, v) { this.attributs[n] = v; } };
  const opaque = await reglerLeVerre({
    racine,
    stockage: { getItem() { throw new Error('refusé'); }, setItem() { throw new Error('refusé'); } },
    memoire: 8,
    mesurer: async () => 60,
  });
  assert.equal(opaque, true, 'la mesure décide quand même');
  assert.equal(racine.attributs['data-verre'], 'opaque');
});
