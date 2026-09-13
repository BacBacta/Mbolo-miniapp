// Fabrique l'identité visuelle : les SVG de brand/svg/ et les PNG de brand/png/.
//
//   node brand/generer.js          (ou npm run logo)
//
// Tout part d'ici, rien n'est dessiné à la main : les couleurs sont celles de public/styles.css,
// les lettres viennent de brand/traces.js (Fraunces et Manrope figées en tracés), et les PNG sont
// rendus par le Chromium de Playwright, déjà présent pour les tests de bout en bout. Changer une
// couleur, une taille ou le nom de la marque, c'est changer une constante ici et relancer.
//
// Le concept : le logo est l'anneau « vérifié » de l'app elle-même. Dans l'interface, l'aura
// (rose, ambre, violet) n'a le droit d'apparaître qu'au match, sur l'anneau d'un avatar vérifié
// et sur le stamp du like. L'avatar du bot est donc un avatar vérifié.
//
// Deux constructions sont produites, parce que l'initiale d'Odo est un O, c'est-à-dire un anneau :
//   « anneau »  la lettre est posée au centre d'un anneau, comme un avatar vérifié dans l'app ;
//   « lettre »  la lettre EST l'anneau, peinte de l'aura, et il n'y a rien d'autre.
// La seconde est la plus tenue : un seul objet au lieu de deux, et le O de Fraunces garde ses
// pleins et ses déliés, donc il se lit comme une lettre et non comme un cercle.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRACES, CAP_HEIGHT_FRAUNCES } from './traces.js';

// ------------------------------------------------------------------ La marque
// Le nom vit ici et nulle part ailleurs dans ce fichier. En changer, c'est changer ces trois
// lignes puis relancer l'extraction des tracés (voir l'en-tête de brand/traces.js).
export const MARQUE = {
  nom: 'Odo',
  mot: 'Odo',        // clé dans TRACES, pour le logotype
  lettre: 'O',       // clé dans TRACES, pour le monogramme
};

// ------------------------------------------------------------------ Palette (= styles.css)
export const COULEURS = {
  encre: '#0b0b14',      // --ink, --bg2 en sombre
  encre1: '#14141f',     // --bg en sombre
  encre2: '#1d1d2b',     // --bg3 en sombre
  os: '#f7f5fb',         // --on-photo, --button-text en clair
  osPage: '#f4f2f7',     // --bg2 en clair
  texteClair: '#151420', // --text en clair
  like: '#ff3d81',       // --like
  orSombre: '#f2c66b',   // --gold en sombre
  orClair: '#d9a63d',    // --gold en clair
  violet: '#7a5cff',     // quatrième arrêt de l'aura
  ambre: '#ff8a3d',      // deuxième arrêt de l'aura
  jaune: '#ffd34d',      // troisième arrêt de l'aura
};
// conic-gradient(from 210deg at 50% 50%, #ff3d81, #ff8a3d, #ffd34d, #7a5cff, #ff3d81)
export const AURA = { depart: 210, arrets: [COULEURS.like, COULEURS.ambre, COULEURS.jaune, COULEURS.violet, COULEURS.like] };

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

// Anneau conique : SVG n'a pas de dégradé conique, on pose N arcs de couleur interpolée.
// Chaque arc dépasse un peu sur le suivant pour qu'aucune couture ne se voie.
export function anneauAura(cx, cy, r, epaisseur, segments = 180) {
  const pas = 360 / segments;
  const arcs = [];
  for (let i = 0; i < segments; i++) {
    const a0 = AURA.depart + i * pas;
    const a1 = a0 + pas + 0.7;
    const [x0, y0] = point(cx, cy, r, a0);
    const [x1, y1] = point(cx, cy, r, a1);
    arcs.push(`<path d="M${n2(x0)} ${n2(y0)}A${r} ${r} 0 0 1 ${n2(x1)} ${n2(y1)}" stroke="${couleurAura(i / segments)}"/>`);
  }
  return `<g fill="none" stroke-width="${epaisseur}" stroke-linecap="butt">${arcs.join('')}</g>`;
}
// Le même conique, mais plein : des parts de tarte depuis le centre. Sert à peindre l'intérieur
// d'une lettre, puisqu'un dégradé conique ne se pose pas en `fill`.
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
function anneauSimple(cx, cy, r, epaisseur, trait) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${trait}" stroke-width="${epaisseur}"/>`;
}

// Un texte tracé : taille = hauteur d'un em en pixels, ancré à gauche, centré, ou à droite.
function texte(cle, { taille, x, y, ancre = 'gauche', fill, opacity }) {
  const t = TRACES[cle];
  const s = taille / 1000;
  const largeur = (t.x2 - t.x1) * s;
  const dx = ancre === 'centre' ? x - largeur / 2 - t.x1 * s : ancre === 'droite' ? x - largeur - t.x1 * s : x - t.x1 * s;
  const op = opacity == null ? '' : ` opacity="${opacity}"`;
  return `<path transform="translate(${n2(dx)} ${n2(y)}) scale(${n2(s)})" fill="${fill}"${op} d="${t.d}"/>`;
}
// La transformation qui pose une lettre centrée sur (cx, cy), à une hauteur d'œil donnée.
// La boîte réelle du glyphe sert de référence, pas la hauteur de capitale : un O déborde
// volontairement au-dessus et au-dessous de la ligne des capitales, et ce débord doit être gardé,
// sinon la lettre paraît plus petite que les autres.
function poserLettre(cle, cx, cy, hauteur) {
  const t = TRACES[cle];
  const s = hauteur / (t.y2 - t.y1);
  const l = (t.x2 - t.x1) * s;
  const dx = cx - l / 2 - t.x1 * s;
  const dy = cy + hauteur / 2 - t.y2 * s;
  return { transform: `translate(${n2(dx)} ${n2(dy)}) scale(${n2(s)})`, d: t.d, largeur: l };
}
// Le monogramme plein, d'une seule couleur.
function monogramme(cx, cy, hauteur, fill, cle = MARQUE.lettre) {
  const p = poserLettre(cle, cx, cy, hauteur);
  return `<path transform="${p.transform}" fill="${fill}" d="${p.d}"/>`;
}
// Le monogramme peint de l'aura : la lettre sert de fenêtre, le conique est posé dedans.
function monogrammeAura(cx, cy, hauteur, idClip, cle = MARQUE.lettre) {
  const p = poserLettre(cle, cx, cy, hauteur);
  return {
    defs: `<clipPath id="${idClip}"><path transform="${p.transform}" d="${p.d}"/></clipPath>`,
    peinture: `<g clip-path="url(#${idClip})">${disqueAura(cx, cy, hauteur * 0.8)}</g>`,
  };
}
// Le monogramme peint d'un dégradé droit, pour les déclinaisons or et rose.
function monogrammeDegrade(cx, cy, hauteur, idGrad, de, a, cle = MARQUE.lettre) {
  const p = poserLettre(cle, cx, cy, hauteur);
  return {
    defs: `<linearGradient id="${idGrad}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${de}"/><stop offset="1" stop-color="${a}"/></linearGradient>`,
    peinture: `<path transform="${p.transform}" fill="url(#${idGrad})" d="${p.d}"/>`,
  };
}

// Le grain : une texture très légère, qui rend le disque moins « écran » et plus « matière ».
function grain(id, force = 0.035) {
  return `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.62" numOctaves="2" stitchTiles="stitch" result="bruit"/>
    <feColorMatrix in="bruit" type="saturate" values="0"/>
    <feComponentTransfer><feFuncA type="linear" slope="${force}"/></feComponentTransfer>
  </filter>`;
}
function halo(id, flou) {
  return `<filter id="${id}" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">
    <feGaussianBlur stdDeviation="${flou}"/>
  </filter>`;
}
// L'aura qui respire : des nappes radiales très douces, rose en haut à gauche, violet en bas à
// droite, comme sur l'écran de match où l'aura respire derrière la paire.
function respiration(largeur, hauteur, force, id = 'r') {
  const r = Math.max(largeur, hauteur) * 0.62;
  return `<defs>
    <radialGradient id="${id}a" gradientUnits="userSpaceOnUse" cx="${n2(largeur * 0.24)}" cy="${n2(hauteur * 0.2)}" r="${n2(r)}">
      <stop offset="0" stop-color="${COULEURS.like}" stop-opacity="${force}"/><stop offset="1" stop-color="${COULEURS.like}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${id}b" gradientUnits="userSpaceOnUse" cx="${n2(largeur * 0.8)}" cy="${n2(hauteur * 0.86)}" r="${n2(r)}">
      <stop offset="0" stop-color="${COULEURS.violet}" stop-opacity="${force * 1.15}"/><stop offset="1" stop-color="${COULEURS.violet}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="${id}c" gradientUnits="userSpaceOnUse" cx="${n2(largeur * 0.78)}" cy="${n2(hauteur * 0.12)}" r="${n2(r * 0.6)}">
      <stop offset="0" stop-color="${COULEURS.ambre}" stop-opacity="${force * 0.5}"/><stop offset="1" stop-color="${COULEURS.ambre}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${largeur}" height="${hauteur}" fill="url(#${id}a)"/>
  <rect width="${largeur}" height="${hauteur}" fill="url(#${id}b)"/>
  <rect width="${largeur}" height="${hauteur}" fill="url(#${id}c)"/>`;
}

// ------------------------------------------------------------------ Les quatre usages
// Une seule construction, ce qui change est la teinte, le fond et la couleur de la lettre.
export const VARIANTES = {
  app: {
    titre: 'Bot et mini app',
    fond: COULEURS.encre, respiration: 0.26, teinte: 'aura', lettre: COULEURS.os,
    usage: 'Photo de profil du bot (BotFather, /setuserpic) et icône de la mini app.',
  },
  moderation: {
    titre: 'Groupe de modération',
    fond: COULEURS.encre, respiration: 0, ambre: 0.16, teinte: 'or', lettre: COULEURS.orSombre,
    usage: 'Photo du groupe privé de modération (ADMIN_CHAT_ID). L’ambre est la couleur de la confiance dans l’app.',
  },
  communaute: {
    titre: 'Groupe de la communauté',
    fond: COULEURS.encre, respiration: 0.22, teinte: 'rose', lettre: COULEURS.os,
    usage: 'Photo du groupe ouvert aux membres de la bêta. Le rose est la couleur du « J’aime ».',
  },
  annonces: {
    titre: 'Canal d’annonces',
    fond: COULEURS.os, respiration: 0.14, teinte: 'aura', lettre: COULEURS.texteClair,
    usage: 'Photo du canal public. La version claire : os et encre, comme le thème clair de l’app.',
  },
};

// La pastille : 1024 × 1024. Le fond remplit tout le carré, parce que Telegram y découpe
// lui-même un cercle. Tout le dessin tient dans le cercle inscrit, donc rien n'est coupé.
export const PASTILLE = {
  taille: 1024,
  rayonAnneau: 428,      // construction « anneau »
  epaisseur: 26,
  hauteurLettre: 376,    // la lettre au centre de l'anneau
  hauteurLettreSeule: 812, // construction « lettre » : la lettre occupe la place de l'anneau
};

function teinteAnneau(v, cx, cy, r, ep, defs) {
  if (v.teinte === 'aura') return anneauAura(cx, cy, r, ep);
  if (v.teinte === 'or') {
    defs.push(`<linearGradient id="or" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${COULEURS.orSombre}"/><stop offset="1" stop-color="${COULEURS.orClair}"/></linearGradient>`);
    return anneauSimple(cx, cy, r, ep, 'url(#or)');
  }
  if (v.teinte === 'rose') {
    defs.push(`<linearGradient id="rose" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${COULEURS.like}"/><stop offset="1" stop-color="${COULEURS.ambre}"/></linearGradient>`);
    return anneauSimple(cx, cy, r, ep, 'url(#rose)');
  }
  return anneauSimple(cx, cy, r, ep, v.lettre);
}
function teinteLettre(v, cx, cy, h, defs) {
  if (v.teinte === 'aura') {
    const m = monogrammeAura(cx, cy, h, 'lettre');
    defs.push(m.defs);
    return m.peinture;
  }
  const [de, a] = v.teinte === 'or' ? [COULEURS.orSombre, COULEURS.orClair] : [COULEURS.like, COULEURS.ambre];
  const m = monogrammeDegrade(cx, cy, h, 'teinte', de, a);
  defs.push(m.defs);
  return m.peinture;
}

// construction : « anneau » (la lettre dans l'anneau) ou « lettre » (la lettre est l'anneau).
// carre : true remplit le carré pour un avatar Telegram ; false donne un disque détouré, dont la
// lueur déborde un peu, ce qui est ce qui la fait exister sur un fond sombre.
export function pastille(nom, { carre = true, taille = PASTILLE.taille, construction = 'lettre' } = {}) {
  const v = VARIANTES[nom];
  const T = PASTILLE.taille;
  const c = T / 2;
  const defs = [grain('grain'), halo('halo', 30)];
  const nappe = v.respiration
    ? respiration(T, T, v.respiration)
    : v.ambre
      ? `<defs><radialGradient id="ra" gradientUnits="userSpaceOnUse" cx="${T * 0.3}" cy="${T * 0.22}" r="${T * 0.7}"><stop offset="0" stop-color="${COULEURS.orSombre}" stop-opacity="${v.ambre}"/><stop offset="1" stop-color="${COULEURS.orSombre}" stop-opacity="0"/></radialGradient></defs><rect width="${T}" height="${T}" fill="url(#ra)"/>`
      : '';
  const marque =
    construction === 'lettre'
      ? teinteLettre(v, c, c, PASTILLE.hauteurLettreSeule, defs)
      : `${teinteAnneau(v, c, c, PASTILLE.rayonAnneau, PASTILLE.epaisseur, defs)}${monogramme(c, c, PASTILLE.hauteurLettre, v.lettre)}`;
  const aLueur =
    construction === 'lettre'
      ? teinteLettre(v, c, c, PASTILLE.hauteurLettreSeule, [])
      : teinteAnneau(v, c, c, PASTILLE.rayonAnneau, PASTILLE.epaisseur, []);
  const clip = carre ? '' : ` clip-path="url(#rond)"`;
  const lueur = v.fond === COULEURS.os ? 0.3 : 0.5;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${T} ${T}" width="${taille}" height="${taille}">
  <title>${MARQUE.nom} — ${v.titre}</title>
  <defs>${defs.join('')}<clipPath id="rond"><circle cx="${c}" cy="${c}" r="${c}"/></clipPath></defs>
  <g${clip}>
    <rect width="${T}" height="${T}" fill="${v.fond}"/>
    ${nappe}
  </g>
  <g filter="url(#halo)" opacity="${lueur}">${aLueur}</g>
  ${marque}
  <rect width="${T}" height="${T}" filter="url(#grain)"${clip}/>
</svg>
`;
}

// Le monogramme seul, en une couleur : tampon, filigrane, impression en une couleur.
export function marqueMono(couleur = 'currentColor', construction = 'lettre') {
  const T = 1024;
  const c = T / 2;
  const corps =
    construction === 'lettre'
      ? monogramme(c, c, PASTILLE.hauteurLettreSeule, couleur)
      : `${anneauSimple(c, c, PASTILLE.rayonAnneau, PASTILLE.epaisseur, couleur)}${monogramme(c, c, PASTILLE.hauteurLettre, couleur)}`;
  return `${svgOuvre(T, T)}
  <title>${MARQUE.nom} — monogramme</title>
  ${corps}
</svg>
`;
}

// Le logotype : le nom en Fraunces, avec une marge égale tout autour.
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

// La marque seule : la lettre peinte et sa lueur, sur fond transparent, sans disque. C'est ce
// qui sert dans un verrouillage horizontal ou sur une affiche : le disque de la pastille y
// dessinerait un cercle plus sombre que le fond, qu'on lit comme une salissure.
export function marqueSeule(nom = 'app', { taille = PASTILLE.taille, id = 'm' } = {}) {
  const v = VARIANTES[nom];
  const T = PASTILLE.taille;
  const c = T / 2;
  const defs = [halo(`${id}h`, 26)];
  const peinture = teinteLettre(v, c, c, PASTILLE.hauteurLettreSeule, defs);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${T} ${T}" width="${taille}" height="${taille}">
  <title>${MARQUE.nom}</title>
  <defs>${defs.join('')}</defs>
  <g filter="url(#${id}h)" opacity="0.45">${peinture}</g>
  ${peinture}
</svg>
`;
}

// Sert à poser une pastille ou la marque seule dans un autre dessin, sans balises <svg> ni titre.
function inclure(svgSource) {
  return svgSource
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/<title>.*?<\/title>/, '');
}
const pastilleIncluse = (nom, construction) =>
  construction === 'lettre' ? inclure(marqueSeule(nom)) : inclure(pastille(nom, { carre: false, construction }));

// Le logo horizontal : pastille à gauche, logotype à droite, alignés sur l'axe de la pastille.
export function logoHorizontal(nom, couleurTexte, { construction = 'lettre', fond = null } = {}) {
  const P = 320;
  const cap = 232;
  const s = cap / CAP_HEIGHT_FRAUNCES;
  const t = TRACES[MARQUE.mot];
  const largeurMot = (t.x2 - t.x1) * (s / 1000);
  const marge = 64;
  const ecart = 56;
  const L = Math.ceil(marge + P + ecart + largeurMot + marge);
  const H = P + marge * 2;
  const echelle = P / PASTILLE.taille;
  return `${svgOuvre(L, H)}
  <title>${MARQUE.nom}</title>
  ${fond ? `<rect width="${L}" height="${H}" fill="${fond}"/>` : ''}
  <g transform="translate(${marge} ${marge}) scale(${n2(echelle)})">${pastilleIncluse(nom, construction)}</g>
  ${texte(MARQUE.mot, { taille: s, x: marge + P + ecart, y: H / 2 + cap / 2 - cap * 0.04, fill: couleurTexte })}
</svg>
`;
}

// Image de présentation de la mini app (BotFather en demande une de 640 × 360).
export function affiche(largeur, hauteur, { beta = true, construction = 'lettre' } = {}) {
  const u = hauteur / 360;
  const P = 128 * u;
  const cap = 84 * u;
  const s = cap / CAP_HEIGHT_FRAUNCES;
  const t = TRACES[MARQUE.mot];
  const largeurMot = (t.x2 - t.x1) * (s / 1000);
  const ecart = 26 * u;
  const bloc = P + ecart + largeurMot;
  const x0 = (largeur - bloc) / 2;
  const cy = hauteur * 0.43;
  const echelle = P / PASTILLE.taille;
  const etiquette = beta
    ? `<g>
    <rect x="${n2(largeur / 2 - 62 * u)}" y="${n2(hauteur * 0.815)}" width="${n2(124 * u)}" height="${n2(24 * u)}" rx="${n2(12 * u)}" fill="none" stroke="${COULEURS.os}" stroke-opacity="0.28" stroke-width="${n2(1.2 * u)}"/>
    ${texte('beta', { taille: 9.5 * u, x: largeur / 2, y: hauteur * 0.815 + 16.4 * u, ancre: 'centre', fill: COULEURS.os, opacity: 0.72 })}
  </g>`
    : '';
  return `${svgOuvre(largeur, hauteur)}
  <title>${MARQUE.nom} — présentation</title>
  <defs>${grain('grainA', 0.03)}</defs>
  <rect width="${largeur}" height="${hauteur}" fill="${COULEURS.encre}"/>
  ${respiration(largeur, hauteur, 0.2, 'af')}
  <g transform="translate(${n2(x0)} ${n2(cy - P / 2)}) scale(${n2(echelle)})">${pastilleIncluse('app', construction)}</g>
  ${texte(MARQUE.mot, { taille: s, x: x0 + P + ecart, y: cy + cap / 2 - cap * 0.04, fill: COULEURS.os })}
  ${texte('slogan', { taille: 17 * u, x: largeur / 2, y: hauteur * 0.74, ancre: 'centre', fill: COULEURS.os, opacity: 0.72 })}
  ${etiquette}
  <rect width="${largeur}" height="${hauteur}" filter="url(#grainA)"/>
</svg>
`;
}

// Le favicon : sans lueur ni grain, en 36 segments seulement, parce qu'il fait 16 px sur un onglet.
export function favicon() {
  const T = 64;
  const c = 32;
  const m = monogrammeAura(c, c, 52, 'f');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${T} ${T}">
  <defs>${m.defs}</defs>
  <circle cx="${c}" cy="${c}" r="${c}" fill="${COULEURS.encre}"/>
  ${m.peinture}
</svg>
`;
}

// ------------------------------------------------------------------ Ce qui est écrit sur le disque
export function fichiersSvg() {
  const svg = {};
  for (const construction of ['lettre', 'anneau']) {
    for (const nom of Object.keys(VARIANTES)) {
      svg[`svg/${construction}/avatar-${nom}.svg`] = pastille(nom, { carre: true, construction });
      svg[`svg/${construction}/pastille-${nom}.svg`] = pastille(nom, { carre: false, construction });
    }
    svg[`svg/${construction}/monogramme-encre.svg`] = marqueMono(COULEURS.texteClair, construction);
    svg[`svg/${construction}/monogramme-os.svg`] = marqueMono(COULEURS.os, construction);
    svg[`svg/${construction}/logo-horizontal-sombre.svg`] = logoHorizontal('app', COULEURS.os, { construction });
    svg[`svg/${construction}/logo-horizontal-clair.svg`] = logoHorizontal('annonces', COULEURS.texteClair, { construction });
    svg[`svg/${construction}/presentation-640x360.svg`] = affiche(640, 360, { construction });
  }
  svg['svg/logotype-encre.svg'] = logotype(COULEURS.texteClair);
  svg['svg/logotype-os.svg'] = logotype(COULEURS.os);
  svg['svg/favicon.svg'] = favicon();
  return svg;
}

export const RENDUS = [
  ...['lettre', 'anneau'].flatMap((k) => [
    ...Object.keys(VARIANTES).flatMap((nom) => [
      { source: `svg/${k}/avatar-${nom}.svg`, sortie: `png/${k}/avatar-${nom}-1024.png`, largeur: 1024, hauteur: 1024 },
      { source: `svg/${k}/avatar-${nom}.svg`, sortie: `png/${k}/avatar-${nom}-512.png`, largeur: 512, hauteur: 512 },
    ]),
    { source: `svg/${k}/pastille-app.svg`, sortie: `png/${k}/pastille-app-512.png`, largeur: 512, hauteur: 512, transparent: true },
    { source: `svg/${k}/logo-horizontal-sombre.svg`, sortie: `png/${k}/logo-horizontal-sombre.png`, transparent: true },
    { source: `svg/${k}/logo-horizontal-clair.svg`, sortie: `png/${k}/logo-horizontal-clair.png`, transparent: true },
    { source: `svg/${k}/presentation-640x360.svg`, sortie: `png/${k}/presentation-640x360.png`, largeur: 640, hauteur: 360 },
    { source: `svg/${k}/presentation-640x360.svg`, sortie: `png/${k}/presentation-1280x720.png`, largeur: 1280, hauteur: 720 },
  ]),
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
