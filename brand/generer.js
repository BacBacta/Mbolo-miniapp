// Fabrique l'identité visuelle : les SVG de brand/svg/ et les PNG de brand/png/.
//
//   node brand/generer.js          (ou npm run logo)
//
// Tout part d'ici, rien n'est dessiné à la main : les couleurs viennent de public/styles.css, les
// lettres de brand/traces.js (Fraunces et Manrope figées en tracés), et les PNG sont rendus par le
// Chromium de Playwright, déjà présent pour les tests de bout en bout. Changer une couleur, une
// taille ou le nom, c'est changer une constante et relancer.
//
// Le concept : le logo est l'avatar vérifié de l'app elle-même. Dans l'app, un avatar est un carré
// arrondi sur le dégradé violet-encre des photos, avec l'initiale en os ; une personne vérifiée y
// gagne une bordure d'aura. Le logo prend ces trois éléments et leur donne de la matière :
//
//   - un squircle à courbure continue, pas un rectangle aux coins arrondis ;
//   - une face éclairée par le haut : dégradé vertical, reflet, liseré de lumière sur l'arête
//     supérieure, ombre intérieure en bas — le vocabulaire des icônes d'app ;
//   - un anneau d'aura qui rayonne : la bordure nette, une lueur qui déborde, un fil de lumière
//     sur son bord intérieur ;
//   - une initiale en léger relief : dégradé os, arête haute éclairée, arête basse ombrée, ombre
//     portée courte ;
//   - derrière, l'encre maillée de deux nappes de couleur floutées, une grille de points, une
//     vignette et un grain fin.
//
// Les groupes changent seulement l'anneau : ambre pour la modération (la couleur de ce qu'on
// t'accorde), rose pour la communauté (la couleur du « J'aime »), et le canal d'annonces est le
// même objet posé sur le thème clair.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRACES, CAP_HEIGHT_FRAUNCES } from './traces.js';

// ------------------------------------------------------------------ La marque
// Le nom vit ici et nulle part ailleurs. En changer, c'est changer ces lignes puis relancer
// l'extraction des tracés (voir l'en-tête de brand/traces.js).
export const MARQUE = {
  nom: 'Odo',
  mot: 'Odo',        // clé dans TRACES : le logotype, en Fraunces 500, la graisse que l'app charge
  lettre: 'O',       // clé dans TRACES : le monogramme, en Fraunces 600, qui tient mieux en petit
};

// ------------------------------------------------------------------ Palette (= styles.css)
export const COULEURS = {
  encre: '#0b0b14',      // --ink : le fond du match, et --bg2 en sombre
  encre1: '#14141f',     // --bg en sombre
  os: '#f7f5fb',         // --on-photo : le texte posé sur une photo, dans les deux thèmes
  osPage: '#f4f2f7',     // --bg2 en clair
  texteClair: '#151420', // --text en clair
  boutonSombre: '#ece9f7', // --button en sombre
  like: '#ff3d81',       // --like
  orSombre: '#f2c66b',   // --gold en sombre
  orClair: '#d9a63d',    // --gold en clair
  photoA: '#5a4a8a',     // --photo-a en sombre
  photoB: '#2a2350',     // --photo-b en sombre
  photoC: '#0e0c1e',     // --photo-c en sombre
  photoAClair: '#7c6bb3', // --photo-a en clair
  photoBClair: '#3f3670', // --photo-b en clair
  photoCClair: '#1c1838', // --photo-c en clair
  violet: '#7a5cff',     // quatrième arrêt de l'aura
  ambre: '#ff8a3d',      // deuxième arrêt de l'aura
  jaune: '#ffd34d',      // troisième arrêt de l'aura
};
// conic-gradient(from 210deg at 50% 50%, #ff3d81, #ff8a3d, #ffd34d, #7a5cff, #ff3d81)
export const AURA = { depart: 210, arrets: [COULEURS.like, COULEURS.ambre, COULEURS.jaune, COULEURS.violet, COULEURS.like] };

// ------------------------------------------------------------------ Proportions
export const ICONE = {
  canevas: 1024,   // le carré que Telegram découpe en cercle
  cote: 640,       // le côté du squircle
  courbure: 4.4,   // exposant de la superellipse : 2 serait un cercle, 4 à 5 une icône d'app
  bordure: 20,     // l'anneau d'aura
  lettre: 0.36,    // hauteur de l'initiale, en fraction du côté
};

// ------------------------------------------------------------------ Outils
function hexVersRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbVersHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}
// Interpolation linéaire en sRGB, comme le fait CSS pour conic-gradient() sans espace précisé.
export function couleurAura(t) {
  const { arrets } = AURA;
  const pos = (t % 1) * (arrets.length - 1);
  const i = Math.min(Math.floor(pos), arrets.length - 2);
  const f = pos - i;
  const a = hexVersRgb(arrets[i]);
  const b = hexVersRgb(arrets[i + 1]);
  return rgbVersHex(a.map((v, k) => v + (b[k] - v) * f));
}
function point(cx, cy, r, deg) {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}
const n2 = (v) => (Math.round(v * 100) / 100).toString();
const svgOuvre = (l, h) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${l} ${h}" width="${l}" height="${h}">`;

// Le squircle : une superellipse |x|^n + |y|^n = 1, échantillonnée finement. C'est la courbure
// continue des icônes d'iOS et de Figma : le rayon ne saute pas d'une valeur à zéro au début du
// coin, il croît, et l'œil lit une forme calme au lieu d'un rectangle rafistolé.
function squircle(cx, cy, demi, n = ICONE.courbure, points = 360) {
  const d = [];
  for (let i = 0; i < points; i++) {
    const t = (i / points) * 2 * Math.PI;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const x = cx + demi * Math.sign(c) * Math.abs(c) ** (2 / n);
    const y = cy + demi * Math.sign(s) * Math.abs(s) ** (2 / n);
    d.push(`${i ? 'L' : 'M'}${n2(x)} ${n2(y)}`);
  }
  return d.join('') + 'Z';
}

// Le conique de l'aura, plein : SVG n'a pas de dégradé conique, on pose des parts de tarte de
// couleur interpolée, et la forme qui doit en être peinte sert de fenêtre.
function disqueAura(cx, cy, r, segments = 180) {
  const pas = 360 / segments;
  const parts = [];
  for (let i = 0; i < segments; i++) {
    const a0 = AURA.depart + i * pas;
    const a1 = a0 + pas + 0.6;
    const [x0, y0] = point(cx, cy, r, a0);
    const [x1, y1] = point(cx, cy, r, a1);
    parts.push(`<path d="M${n2(cx)} ${n2(cy)}L${n2(x0)} ${n2(y0)}A${r} ${r} 0 0 1 ${n2(x1)} ${n2(y1)}Z" fill="${couleurAura(i / segments)}"/>`);
  }
  return parts.join('');
}
function lineaire(id, arrets, { x1 = 0, y1 = 0, x2 = 0, y2 = 1 } = {}) {
  const stops = arrets.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a == null ? '' : ` stop-opacity="${a}"`}/>`).join('');
  return `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops}</linearGradient>`;
}
function radial(id, arrets, { cx = 0.5, cy = 0.5, r = 0.5, unites = null } = {}) {
  const stops = arrets.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a == null ? '' : ` stop-opacity="${a}"`}/>`).join('');
  const u = unites ? ` gradientUnits="userSpaceOnUse"` : '';
  return `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}"${u}>${stops}</radialGradient>`;
}
const flou = (id, r) =>
  `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${r}"/></filter>`;
const grain = (id, force, frequence = 0.8) =>
  `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="${frequence}" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="${force}"/></feComponentTransfer></filter>`;

// Un texte tracé : taille = hauteur d'un em en pixels, ancré à gauche, centré, ou à droite.
function texte(cle, { taille, x, y, ancre = 'gauche', fill, opacity, extra = '' }) {
  const t = TRACES[cle];
  const s = taille / 1000;
  const largeur = (t.x2 - t.x1) * s;
  const dx = ancre === 'centre' ? x - largeur / 2 - t.x1 * s : ancre === 'droite' ? x - largeur - t.x1 * s : x - t.x1 * s;
  const op = opacity == null ? '' : ` opacity="${opacity}"`;
  return `<path transform="translate(${n2(dx)} ${n2(y)}) scale(${n2(s)})" fill="${fill}"${op}${extra} d="${t.d}"/>`;
}
// La transformation qui centre une lettre sur (cx, cy) par sa boîte réelle : un O déborde de la
// ligne des capitales, et ce débord doit être gardé. Remontée d'un rien : centrée au millimètre,
// une lettre paraît tomber.
function poserLettre(cx, cy, hauteur, cle = MARQUE.lettre) {
  const t = TRACES[cle];
  const s = hauteur / (t.y2 - t.y1);
  const l = (t.x2 - t.x1) * s;
  const dx = cx - l / 2 - t.x1 * s;
  const dy = cy + hauteur / 2 - t.y2 * s - hauteur * 0.02;
  return { transform: `translate(${n2(dx)} ${n2(dy)}) scale(${n2(s)})`, d: t.d, echelle: s };
}

// ------------------------------------------------------------------ Les quatre usages
export const VARIANTES = {
  app: {
    titre: 'Bot et mini app',
    scheme: 'sombre', anneau: 'aura', nappes: [['violet', 0.28], ['like', 0.2]],
    usage: 'Photo de profil du bot (BotFather, /setuserpic) et icône de la mini app.',
  },
  moderation: {
    titre: 'Groupe de modération',
    scheme: 'sombre', anneau: 'or', nappes: [['orSombre', 0.14], ['violet', 0.12]],
    usage: 'Photo du groupe privé de modération (ADMIN_CHAT_ID). L’ambre est la couleur de la confiance dans l’app.',
  },
  communaute: {
    titre: 'Groupe de la communauté',
    scheme: 'sombre', anneau: 'rose', nappes: [['like', 0.24], ['violet', 0.16]],
    usage: 'Photo du groupe ouvert aux membres de la bêta. Le rose est la couleur du « J’aime ».',
  },
  annonces: {
    titre: 'Canal d’annonces',
    scheme: 'clair', anneau: 'aura', nappes: [['violet', 0.16], ['like', 0.12]],
    usage: 'Photo du canal public. Le même objet, posé sur le thème clair.',
  },
};

// ------------------------------------------------------------------ L'icône
// (cx, cy) le centre, cote le côté. Les identifiants sont préfixés pour qu'on puisse en inclure
// plusieurs dans un même dessin. Retourne { defs, corps }.
function icone(v, cx, cy, cote, id) {
  const demi = cote / 2;
  const e = cote / ICONE.cote;               // échelle des épaisseurs
  const b = ICONE.bordure * e;               // l'anneau
  const clair = v.scheme === 'clair';
  const [pa, pb, pc] = clair
    ? [COULEURS.photoAClair, COULEURS.photoBClair, COULEURS.photoCClair]
    : [COULEURS.photoA, COULEURS.photoB, COULEURS.photoC];
  const ext = squircle(cx, cy, demi);
  const int = squircle(cx, cy, demi - b);
  const lettre = poserLettre(cx, cy, cote * ICONE.lettre);

  // L'anneau : aura conique, ou un dégradé de deux tons pour l'ambre et le rose.
  let peintureAnneau;
  const defs = [];
  if (v.anneau === 'aura') {
    defs.push(`<clipPath id="${id}ce"><path d="${ext}"/></clipPath>`);
    peintureAnneau = `<g clip-path="url(#${id}ce)">${disqueAura(cx, cy, demi * 1.5)}</g>`;
  } else {
    const [de, a] = v.anneau === 'or' ? [COULEURS.orSombre, COULEURS.orClair] : [COULEURS.like, COULEURS.ambre];
    defs.push(lineaire(`${id}ga`, [[0, de], [1, a]], { x1: 0, y1: 0, x2: 1, y2: 1 }));
    peintureAnneau = `<path d="${ext}" fill="url(#${id}ga)"/>`;
  }

  defs.push(
    // La face : plus claire en haut, plus sombre en bas — la lumière vient d'en haut.
    lineaire(`${id}face`, [[0, pa], [0.62, pb], [1, pc]]),
    // Le reflet : une nappe de lumière en haut à gauche, comme sur un objet en verre.
    radial(`${id}reflet`, [[0, '#ffffff', 0.22], [0.6, '#ffffff', 0.04], [1, '#ffffff', 0]], { cx: 0.3, cy: 0.05, r: 0.85 }),
    // Le liseré d'arête : blanc en haut, rien en bas.
    lineaire(`${id}arete`, [[0, '#ffffff', 0.5], [0.45, '#ffffff', 0.08], [1, '#ffffff', 0]]),
    // L'ombre intérieure, au pied de la face.
    lineaire(`${id}pied`, [[0, '#000000', 0], [0.72, '#000000', 0], [1, '#000000', 0.28]]),
    // La lettre : blanc pur en haut, os en bas, pour que le relief se lise.
    lineaire(`${id}os`, [[0, '#ffffff'], [1, COULEURS.os]]),
    `<clipPath id="${id}ci"><path d="${int}"/></clipPath>`,
    `<clipPath id="${id}cl"><path transform="${lettre.transform}" d="${lettre.d}"/></clipPath>`,
    flou(`${id}f1`, 2.2 * e),
    flou(`${id}f2`, 14 * e),
    flou(`${id}f3`, 30 * e),
    `<filter id="${id}fo" x="-40%" y="-40%" width="180%" height="200%" color-interpolation-filters="sRGB"><feDropShadow dx="0" dy="${n2(28 * e)}" stdDeviation="${n2(26 * e)}" flood-color="#000" flood-opacity="0.55"/><feDropShadow dx="0" dy="${n2(4 * e)}" stdDeviation="${n2(4 * e)}" flood-color="#000" flood-opacity="0.35"/></filter>`,
    `<filter id="${id}fl" x="-40%" y="-40%" width="180%" height="180%" color-interpolation-filters="sRGB"><feDropShadow dx="0" dy="${n2(5 * e)}" stdDeviation="${n2(7 * e)}" flood-color="#000" flood-opacity="0.4"/></filter>`,
  );

  const corps = `
    <!-- la lueur de l'anneau, qui déborde -->
    <g filter="url(#${id}f3)" opacity="${clair ? 0.42 : 0.62}">${peintureAnneau}</g>
    <!-- l'ombre portée de l'objet entier -->
    <g filter="url(#${id}fo)"><path d="${ext}" fill="${pc}"/></g>
    <!-- l'anneau net -->
    ${peintureAnneau}
    <!-- la face -->
    <path d="${int}" fill="url(#${id}face)"/>
    <g clip-path="url(#${id}ci)">
      <path d="${int}" fill="url(#${id}reflet)"/>
      <path d="${int}" fill="url(#${id}pied)"/>
      <!-- ombre intérieure : la face décalée vers le haut, contour flouté, ne laisse que le pied -->
      <path d="${int}" transform="translate(0 ${n2(-10 * e)})" fill="none" stroke="#000" stroke-opacity="0.32" stroke-width="${n2(22 * e)}" filter="url(#${id}f2)"/>
      <!-- liseré d'arête : le contour intérieur, blanc en haut -->
      <path d="${int}" fill="none" stroke="url(#${id}arete)" stroke-width="${n2(3 * e)}"/>
      <!-- fil de lumière au bord intérieur de l'anneau, plus large et flouté -->
      <path d="${int}" fill="none" stroke="#ffffff" stroke-opacity="0.18" stroke-width="${n2(10 * e)}" filter="url(#${id}f1)"/>
    </g>
    <!-- l'initiale, en relief -->
    <g filter="url(#${id}fl)"><path transform="${lettre.transform}" d="${lettre.d}" fill="url(#${id}os)"/></g>
    <g clip-path="url(#${id}cl)">
      <path transform="translate(0 ${n2(2 * e)}) ${lettre.transform}" d="${lettre.d}" fill="none" stroke="#ffffff" stroke-opacity="0.4" stroke-width="${n2(2.2 * e)}" vector-effect="non-scaling-stroke"/>
    </g>`;
  return { defs: defs.join(''), corps };
}

// ------------------------------------------------------------------ Le fond
// L'encre, maillée : deux nappes de couleur floutées, une grille de points qui s'efface vers les
// bords, une vignette, un grain fin. Le même fond sert à la pastille et à l'affiche.
function fond(v, L, H, id, { grille = true, force = 1 } = {}) {
  const clair = v.scheme === 'clair';
  const base = clair ? COULEURS.osPage : COULEURS.encre;
  const centre = clair ? '#ffffff' : COULEURS.encre1;
  const R = Math.max(L, H);
  const [n1, n2_] = v.nappes;
  const defs = [
    radial(`${id}bg`, [[0, centre], [1, base]], { cx: 0.5, cy: 0.42, r: 0.7 }),
    radial(`${id}n1`, [[0, COULEURS[n1[0]], n1[1] * force], [1, COULEURS[n1[0]], 0]], { cx: L * 0.22, cy: H * 0.18, r: R * 0.55, unites: true }),
    radial(`${id}n2`, [[0, COULEURS[n2_[0]], n2_[1] * force], [1, COULEURS[n2_[0]], 0]], { cx: L * 0.8, cy: H * 0.86, r: R * 0.55, unites: true }),
    radial(`${id}vig`, [[0.5, '#000000', 0], [1, '#000000', clair ? 0.08 : 0.55]], { cx: 0.5, cy: 0.5, r: 0.72 }),
    `<pattern id="${id}pts" width="${n2(R / 32)}" height="${n2(R / 32)}" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="${n2(R / 900)}" fill="${clair ? '#151420' : '#ffffff'}"/></pattern>`,
    `<mask id="${id}mk"><rect width="${L}" height="${H}" fill="url(#${id}mg)"/></mask>`,
    radial(`${id}mg`, [[0, '#ffffff'], [0.75, '#ffffff', 0.35], [1, '#ffffff', 0]], { cx: 0.5, cy: 0.5, r: 0.6 }),
    grain(`${id}gr`, clair ? 0.03 : 0.045),
  ];
  const corps = `
  <rect width="${L}" height="${H}" fill="url(#${id}bg)"/>
  <rect width="${L}" height="${H}" fill="url(#${id}n1)"/>
  <rect width="${L}" height="${H}" fill="url(#${id}n2)"/>
  ${grille ? `<rect width="${L}" height="${H}" fill="url(#${id}pts)" opacity="${clair ? 0.12 : 0.16}" mask="url(#${id}mk)"/>` : ''}
  <rect width="${L}" height="${H}" fill="url(#${id}vig)"/>`;
  return { defs: defs.join(''), corps, grain: `<rect width="${L}" height="${H}" filter="url(#${id}gr)"/>` };
}

// ------------------------------------------------------------------ Les fichiers
// La pastille Telegram : 1024 × 1024, le fond remplit le carré parce que Telegram y découpe un
// cercle ; l'icône et sa lueur tiennent dans le cercle inscrit, donc rien n'est coupé.
export function pastille(nom, { taille = ICONE.canevas } = {}) {
  const v = VARIANTES[nom];
  const T = ICONE.canevas;
  const c = T / 2;
  const f = fond(v, T, T, 'b');
  const i = icone(v, c, c, ICONE.cote, 'i');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${T} ${T}" width="${taille}" height="${taille}">
  <title>${MARQUE.nom} — ${v.titre}</title>
  <defs>${f.defs}${i.defs}</defs>
  ${f.corps}
  ${i.corps}
  ${f.grain}
</svg>
`;
}

// L'icône seule, fond transparent : pour la poser sur autre chose.
export function marque(nom = 'app', { taille = 512 } = {}) {
  const v = VARIANTES[nom];
  const T = 512;
  const i = icone(v, T / 2, T / 2, 400, 'm');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${T} ${T}" width="${taille}" height="${taille}">
  <title>${MARQUE.nom}</title>
  <defs>${i.defs}</defs>
  ${i.corps}
</svg>
`;
}

// Le monogramme en une couleur : le squircle en anneau, l'initiale en plein.
export function marqueMono(couleur = 'currentColor') {
  const T = 512;
  const demi = 200;
  const b = ICONE.bordure * (2 * demi / ICONE.cote);
  const lettre = poserLettre(T / 2, T / 2, 2 * demi * ICONE.lettre);
  return `${svgOuvre(T, T)}
  <title>${MARQUE.nom} — monogramme</title>
  <path fill-rule="evenodd" fill="${couleur}" d="${squircle(T / 2, T / 2, demi)} ${squircle(T / 2, T / 2, demi - b)}"/>
  <path transform="${lettre.transform}" d="${lettre.d}" fill="${couleur}"/>
</svg>
`;
}

// Le logotype : le nom en Fraunces 500, la graisse de l'identité dans l'app.
const LOGOTYPE = { hauteurCap: 280, marge: 24 };
export function logotype(couleur) {
  const s = LOGOTYPE.hauteurCap / CAP_HEIGHT_FRAUNCES;
  const t = TRACES[MARQUE.mot];
  const largeur = (t.x2 - t.x1) * (s / 1000);
  const haut = -t.y1 * (s / 1000);
  const bas = t.y2 * (s / 1000);
  const L = Math.ceil(largeur + LOGOTYPE.marge * 2);
  const H = Math.ceil(haut + bas + LOGOTYPE.marge * 2);
  return `${svgOuvre(L, H)}
  <title>${MARQUE.nom} — logotype</title>
  ${texte(MARQUE.mot, { taille: s, x: LOGOTYPE.marge, y: LOGOTYPE.marge + haut, fill: couleur })}
</svg>
`;
}

// Le logo horizontal : l'icône à gauche, le nom à droite, aligné sur le carré. Fond transparent.
export function logoHorizontal(nom, couleurTexte) {
  const v = VARIANTES[nom];
  const cote = 240;
  const cap = cote * 0.62;
  const s = cap / CAP_HEIGHT_FRAUNCES;
  const t = TRACES[MARQUE.mot];
  const largeurMot = (t.x2 - t.x1) * (s / 1000);
  const marge = 72;
  const ecart = cote * 0.36;
  const L = Math.ceil(marge + cote + ecart + largeurMot + marge);
  const H = cote + marge * 2;
  const i = icone(v, marge + cote / 2, H / 2, cote, 'l');
  return `${svgOuvre(L, H)}
  <title>${MARQUE.nom}</title>
  <defs>${i.defs}</defs>
  ${i.corps}
  ${texte(MARQUE.mot, { taille: s, x: marge + cote + ecart, y: H / 2 + cap / 2 - cap * 0.04, fill: couleurTexte })}
</svg>
`;
}

// L'affiche : l'image de présentation de la mini app (BotFather en demande une de 640 × 360), et
// l'image de partage. L'icône flotte sur l'encre maillée, le nom en grand, la promesse dessous,
// une étiquette en verre.
export function affiche(largeur, hauteur, { beta = true } = {}) {
  const u = hauteur / 360;
  const v = VARIANTES.app;
  const cote = 118 * u;
  const cap = cote * 0.62;
  const s = cap / CAP_HEIGHT_FRAUNCES;
  const t = TRACES[MARQUE.mot];
  const largeurMot = (t.x2 - t.x1) * (s / 1000);
  const ecart = cote * 0.36;
  const bloc = cote + ecart + largeurMot;
  const x0 = (largeur - bloc) / 2;
  const cy = hauteur * 0.41;
  const f = fond(v, largeur, hauteur, 'a');
  const i = icone(v, x0 + cote / 2, cy, cote, 'p');
  const etiquette = beta
    ? `<g>
    <rect x="${n2(largeur / 2 - 66 * u)}" y="${n2(hauteur * 0.8)}" width="${n2(132 * u)}" height="${n2(26 * u)}" rx="${n2(13 * u)}" fill="#ffffff" fill-opacity="0.05" stroke="url(#av)" stroke-width="${n2(1 * u)}"/>
    ${texte('beta', { taille: 9.6 * u, x: largeur / 2, y: hauteur * 0.8 + 17.4 * u, ancre: 'centre', fill: COULEURS.os, opacity: 0.7 })}
  </g>`
    : '';
  return `${svgOuvre(largeur, hauteur)}
  <title>${MARQUE.nom} — présentation</title>
  <defs>${f.defs}${i.defs}
    ${lineaire('av', [[0, '#ffffff', 0.3], [1, '#ffffff', 0.08]], { x1: 0, y1: 0, x2: 1, y2: 1 })}
    ${lineaire('mot', [[0, '#ffffff'], [1, COULEURS.os, 0.82]])}
  </defs>
  ${f.corps}
  ${i.corps}
  ${texte(MARQUE.mot, { taille: s, x: x0 + cote + ecart, y: cy + cap / 2 - cap * 0.04, fill: 'url(#mot)' })}
  ${texte('slogan', { taille: 15.5 * u, x: largeur / 2, y: hauteur * 0.685, ancre: 'centre', fill: COULEURS.os, opacity: 0.58 })}
  ${etiquette}
  ${f.grain}
</svg>
`;
}

// Le favicon : l'icône sans effets, en 36 segments — il fait 16 px sur un onglet.
export function favicon() {
  const T = 64;
  const demi = 30;
  const b = 4;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${T} ${T}">
  <defs>${lineaire('fp', [[0, COULEURS.photoA], [1, COULEURS.photoC]])}<clipPath id="fc"><path d="${squircle(32, 32, demi, ICONE.courbure, 120)}"/></clipPath></defs>
  <g clip-path="url(#fc)">${disqueAura(32, 32, 48, 36)}</g>
  <path d="${squircle(32, 32, demi - b, ICONE.courbure, 120)}" fill="url(#fp)"/>
  ${(() => { const l = poserLettre(32, 32, 2 * demi * ICONE.lettre); return `<path transform="${l.transform}" d="${l.d}" fill="${COULEURS.os}"/>`; })()}
</svg>
`;
}

// ------------------------------------------------------------------ Ce qui est écrit sur le disque
export function fichiersSvg() {
  const svg = {};
  for (const nom of Object.keys(VARIANTES)) {
    svg[`svg/avatar-${nom}.svg`] = pastille(nom);
    svg[`svg/marque-${nom}.svg`] = marque(nom);
  }
  svg['svg/monogramme-encre.svg'] = marqueMono(COULEURS.texteClair);
  svg['svg/monogramme-os.svg'] = marqueMono(COULEURS.os);
  svg['svg/logotype-encre.svg'] = logotype(COULEURS.texteClair);
  svg['svg/logotype-os.svg'] = logotype(COULEURS.os);
  svg['svg/logo-horizontal-sombre.svg'] = logoHorizontal('app', COULEURS.os);
  svg['svg/logo-horizontal-clair.svg'] = logoHorizontal('annonces', COULEURS.texteClair);
  svg['svg/presentation-640x360.svg'] = affiche(640, 360);
  svg['svg/banniere-1600x900.svg'] = affiche(1600, 900);
  svg['svg/favicon.svg'] = favicon();
  return svg;
}

export const RENDUS = [
  ...Object.keys(VARIANTES).flatMap((nom) => [
    { source: `svg/avatar-${nom}.svg`, sortie: `png/avatar-${nom}-1024.png`, largeur: 1024, hauteur: 1024 },
    { source: `svg/avatar-${nom}.svg`, sortie: `png/avatar-${nom}-512.png`, largeur: 512, hauteur: 512 },
    { source: `svg/marque-${nom}.svg`, sortie: `png/marque-${nom}-512.png`, largeur: 512, hauteur: 512, transparent: true },
  ]),
  { source: 'svg/logo-horizontal-sombre.svg', sortie: 'png/logo-horizontal-sombre.png', transparent: true },
  { source: 'svg/logo-horizontal-clair.svg', sortie: 'png/logo-horizontal-clair.png', transparent: true },
  { source: 'svg/logo-horizontal-sombre.svg', sortie: 'png/logo-horizontal-sur-encre.png', fond: COULEURS.encre },
  { source: 'svg/logo-horizontal-clair.svg', sortie: 'png/logo-horizontal-sur-os.png', fond: COULEURS.osPage },
  { source: 'svg/presentation-640x360.svg', sortie: 'png/presentation-640x360.png', largeur: 640, hauteur: 360 },
  { source: 'svg/presentation-640x360.svg', sortie: 'png/presentation-1280x720.png', largeur: 1280, hauteur: 720 },
  { source: 'svg/banniere-1600x900.svg', sortie: 'png/banniere-1600x900.png', largeur: 1600, hauteur: 900 },
  { source: 'svg/logotype-os.svg', sortie: 'png/logotype-os.png', transparent: true },
];

const dossier = path.dirname(fileURLToPath(import.meta.url));

export function ecrireSvg(racine = dossier) {
  const svg = fichiersSvg();
  for (const [nom, contenu] of Object.entries(svg)) {
    const chemin = path.join(racine, nom);
    fs.mkdirSync(path.dirname(chemin), { recursive: true });
    fs.writeFileSync(chemin, contenu);
  }
  return Object.keys(svg);
}

function dimensions(svgSource) {
  const m = svgSource.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
  return { largeur: Math.round(+m[1]), hauteur: Math.round(+m[2]) };
}

export async function rendrePng(racine = dossier) {
  const { chromium } = await import('@playwright/test');
  const navigateur = await chromium.launch();
  try {
    for (const r of RENDUS) {
      const source = fs.readFileSync(path.join(racine, r.source), 'utf8');
      const base = dimensions(source);
      const largeur = r.largeur ?? base.largeur;
      const hauteur = r.hauteur ?? base.hauteur;
      const page = await navigateur.newPage({ viewport: { width: largeur, height: hauteur }, deviceScaleFactor: 1 });
      const dimensionne = source.replace(/^<svg([^>]*?) width="[^"]*" height="[^"]*"/, `<svg$1 width="${largeur}" height="${hauteur}"`);
      await page.setContent(`<!doctype html><html><body style="margin:0;background:${r.fond ?? 'transparent'}">${dimensionne}</body></html>`);
      fs.mkdirSync(path.dirname(path.join(racine, r.sortie)), { recursive: true });
      await page.screenshot({ path: path.join(racine, r.sortie), omitBackground: !!r.transparent, type: 'png' });
      await page.close();
    }
  } finally {
    await navigateur.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const svgs = ecrireSvg();
  console.log(`${svgs.length} SVG écrits`);
  await rendrePng();
  console.log(`${RENDUS.length} PNG rendus`);
}
