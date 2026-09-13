// La marque ne doit pas diverger de l'app.
//
// brand/generer.js recopie des couleurs de public/styles.css. Une valeur recopiée finit toujours
// par dater : le jour où le rose du « J'aime » change dans la feuille de style, le logo garde
// l'ancien sans que personne ne le voie, et les deux se contredisent sur le même écran. Ce test
// relit la feuille de style et compare, pour que la divergence casse au lieu de passer.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(racine, 'public', 'styles.css'), 'utf8');
const { COULEURS, AURA, MARQUE, VARIANTES, fichiersSvg, couleurAura } = await import('../brand/generer.js');

// Lit un jeton dans un bloc donné de la feuille de style (:root, ou :root[data-scheme="dark"]).
function jeton(nom, bloc = ':root {') {
  const debut = css.indexOf(bloc);
  assert.notEqual(debut, -1, `bloc ${bloc} introuvable dans styles.css`);
  const fin = css.indexOf('\n}', debut);
  const portion = css.slice(debut, fin);
  const m = portion.match(new RegExp(`--${nom}:\\s*([^;]+);`));
  assert.ok(m, `jeton --${nom} introuvable dans ${bloc}`);
  return m[1].trim();
}

test('les couleurs de la marque sont celles de la feuille de style', () => {
  assert.equal(COULEURS.like, jeton('like'));
  assert.equal(COULEURS.encre, jeton('ink'));
  assert.equal(COULEURS.photoA, jeton('photo-a', ':root[data-scheme="dark"] {'));
  assert.equal(COULEURS.photoB, jeton('photo-b', ':root[data-scheme="dark"] {'));
  assert.equal(COULEURS.photoC, jeton('photo-c', ':root[data-scheme="dark"] {'));
  assert.equal(COULEURS.photoAClair, jeton('photo-a'));
  assert.equal(COULEURS.photoBClair, jeton('photo-b'));
  assert.equal(COULEURS.photoCClair, jeton('photo-c'));
  assert.equal(COULEURS.boutonSombre, jeton('button', ':root[data-scheme="dark"] {'));
  assert.equal(COULEURS.os, jeton('on-photo'));
  assert.equal(COULEURS.texteClair, jeton('text'));
  assert.equal(COULEURS.orClair, jeton('gold'));
  assert.equal(COULEURS.orSombre, jeton('gold', ':root[data-scheme="dark"] {'));
});

test('l’aura du logo est celle de --aura, arrêts et angle compris', () => {
  const valeur = jeton('aura');
  const angle = valeur.match(/from\s+(\d+)deg/);
  assert.ok(angle, '--aura ne déclare pas son angle de départ');
  assert.equal(AURA.depart, Number(angle[1]));
  const arrets = valeur.match(/#[0-9a-f]{6}/gi).map((c) => c.toLowerCase());
  assert.deepEqual(AURA.arrets, arrets);
});

test('l’interpolation rend exactement les arrêts déclarés', () => {
  // Aux positions des arrêts, la couleur calculée doit être l'arrêt lui-même : si l'interpolation
  // dérive, le logo n'est plus du même rose que le bouton « J'aime ».
  const n = AURA.arrets.length - 1;
  for (let i = 0; i <= n; i++) {
    assert.equal(couleurAura(i / n === 1 ? 0.999999 : i / n), AURA.arrets[i === n ? n : i].toLowerCase());
  }
});

test('chaque usage Telegram a sa pastille, et le nom vient d’une seule constante', () => {
  const svg = fichiersSvg();
  for (const usage of ['app', 'moderation', 'communaute', 'annonces']) {
    assert.ok(VARIANTES[usage].usage, `${usage} n’explique pas à quoi il sert`);
    assert.ok(svg[`svg/avatar-${usage}.svg`], `pastille manquante pour ${usage}`);
    assert.match(svg[`svg/avatar-${usage}.svg`], new RegExp(`<title>${MARQUE.nom} — `));
  }
});

test('les SVG du dépôt ne dépendent d’aucune police installée', () => {
  // Un <text> dans un SVG se rend avec la police de la machine qui l'ouvre, ou sans elle.
  // Les lettres du logo doivent donc être des tracés, jamais du texte.
  for (const [nom, contenu] of Object.entries(fichiersSvg())) {
    assert.doesNotMatch(contenu, /<text[\s>]/, `${nom} contient du texte au lieu d’un tracé`);
    assert.doesNotMatch(contenu, /font-family/, `${nom} demande une police`);
  }
});

test('les SVG écrits sur le disque sont ceux que le générateur produit', () => {
  // Sans cela, brand/svg/ peut rester en retard sur brand/generer.js sans que rien ne le dise.
  for (const [nom, attendu] of Object.entries(fichiersSvg())) {
    const chemin = path.join(racine, 'brand', nom);
    assert.ok(fs.existsSync(chemin), `${nom} manque : relance npm run logo`);
    assert.equal(fs.readFileSync(chemin, 'utf8'), attendu, `${nom} est périmé : relance npm run logo`);
  }
});
