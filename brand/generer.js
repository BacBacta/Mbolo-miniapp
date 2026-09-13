// Fabrique l'identité visuelle : les SVG de brand/svg/ et les PNG de brand/png/.
//
//   node brand/generer.js          (ou npm run logo)
//
// Tout part d'ici, rien n'est dessiné à la main : les couleurs et les proportions sont celles de
// public/styles.css, les lettres viennent de brand/traces.js (Fraunces et Manrope figées en
// tracés), et les PNG sont rendus par le Chromium de Playwright, déjà présent pour les tests de
// bout en bout. Changer une couleur, une taille ou le nom, c'est changer une constante et relancer.
//
// Le concept : le logo est l'avatar vérifié de l'app elle-même, à ses proportions exactes.
// Dans l'app, un avatar est un carré arrondi (rayon 30 %) sur le dégradé violet-encre des photos,
// avec l'initiale en os quand il n'y a pas de photo ; une personne vérifiée y gagne une bordure
// fine d'aura. C'est tout ce que le logo est : ce carré, cette bordure, cette initiale. Les
// groupes reprennent les deux autres anneaux que l'app connaît, séparés de l'avatar par un liseré
// de fond : l'anneau doré (« ce qu'on t'accorde », et la modération accorde la vérification) et
// l'anneau os (« nouveau », et la communauté est ce qui vient d'arriver). L'aura n'est jamais posée
// pleine : nette sur la bordure seulement, et sinon floutée derrière l'avatar, comme au match.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRACES, CAP_HEIGHT_FRAUNCES } from './traces.js';

// ------------------------------------------------------------------ La marque
// Le nom vit ici et nulle part ailleurs dans ce fichier. En changer, c'est changer ces lignes puis
// relancer l'extraction des tracés (voir l'en-tête de brand/traces.js).
export const MARQUE = {
  nom: 'Odo',
  mot: 'Odo',        // clé dans TRACES : le logotype, en Fraunces 500, la graisse que l'app charge
  lettre: 'O',       // clé dans TRACES : le monogramme, en Fraunces 600, qui tient mieux en petit
};

// ------------------------------------------------------------------ Palette (= styles.css)
export const COULEURS = {
  encre: '#0b0b14',      // --ink : le fond du match, et --bg2 en sombre
  os: '#f7f5fb',         // --on-photo : le texte posé sur une photo, dans les deux thèmes
  osPage: '#f4f2f7',     // --bg2 en clair
  texteClair: '#151420', // --text en clair
  boutonSombre: '#ece9f7', // --button en sombre : le seul objet clair de l'écran
  like: '#ff3d81',       // --like
  orSombre: '#f2c66b',   // --gold en sombre
  orClair: '#d9a63d',    // --gold en clair
  photoA: '#5a4a8a',     // --photo-a en sombre
  photoC: '#0e0c1e',     // --photo-c en sombre
  photoAClair: '#7c6bb3', // --photo-a en clair
  photoCClair: '#1c1838', // --photo-c en clair
  violet: '#7a5cff',     // quatrième arrêt de l'aura
  ambre: '#ff8a3d',      // deuxième arrêt de l'aura
  jaune: '#ffd34d',      // troisième arrêt de l'aura
};
// conic-gradient(from 210deg at 50% 50%, #ff3d81, #ff8a3d, #ffd34d, #7a5cff, #ff3d81)
export const AURA = { depart: 210, arrets: [COULEURS.like, COULEURS.ambre, COULEURS.jaune, COULEURS.violet, COULEURS.like] };

// ------------------------------------------------------------------ Proportions (= styles.css)
// .avatar : border-radius 14 px sur 46 px, 32 px sur 104 px, soit 30 % du côté.
// .avatar.verified : bordure de 3 px, soit 3 à 6 % du côté selon la taille.
// .new-item et .like-item : anneau posé en ombre, un liseré de fond puis la couleur.
// .avatar.xl : initiale à 40 px sur 104 px, soit une hauteur de capitale d'environ 27 % du côté.
export const AVATAR = {
  canevas: 1024,   // le carré que Telegram découpe en cercle
  cote: 600,       // le côté du carré arrondi
  rayon: 0.30,     // fraction du côté
  bordure: 22,     // la bordure d'aura d'une personne vérifiée
  lisere: 18,      // le liseré de fond entre l'avatar et un anneau
  anneau: 22,      // l'anneau doré ou os
  lettre: 0.34,    // hauteur de l'initiale, en fraction du côté : un peu plus que dans l'app (27 %),
                   // pour rester lisible à 40 px dans une liste de discussions
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
// linear-gradient(150deg, a, c) : en CSS, 150° pointe vers le bas, un peu à droite.
function degradePhoto(id, a, c) {
  const rad = (150 * Math.PI) / 180;
  const dx = Math.sin(rad) / 2;
  const dy = -Math.cos(rad) / 2;
  return `<linearGradient id="${id}" x1="${n2(0.5 - dx)}" y1="${n2(0.5 - dy)}" x2="${n2(0.5 + dx)}" y2="${n2(0.5 + dy)}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${c}"/></linearGradient>`;
}
const arrondi = (x, y, cote, rayon, extra = '') =>
  `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(cote)}" height="${n2(cote)}" rx="${n2(rayon)}"${extra}/>`;

// Un texte tracé : taille = hauteur d'un em en pixels, ancré à gauche, centré, ou à droite.
function texte(cle, { taille, x, y, ancre = 'gauche', fill, opacity }) {
  const t = TRACES[cle];
  const s = taille / 1000;
  const largeur = (t.x2 - t.x1) * s;
  const dx = ancre === 'centre' ? x - largeur / 2 - t.x1 * s : ancre === 'droite' ? x - largeur - t.x1 * s : x - t.x1 * s;
  const op = opacity == null ? '' : ` opacity="${opacity}"`;
  return `<path transform="translate(${n2(dx)} ${n2(y)}) scale(${n2(s)})" fill="${fill}"${op} d="${t.d}"/>`;
}
// L'initiale, centrée sur (cx, cy) par sa boîte réelle : un O déborde de la ligne des capitales,
// et ce débord doit être gardé, sinon la lettre paraît plus petite qu'elle n'est. Elle est
// remontée d'un rien (2 % de sa hauteur) : centrée au millimètre, elle paraît tomber.
function initiale(cx, cy, hauteur, fill, cle = MARQUE.lettre) {
  const t = TRACES[cle];
  const s = hauteur / (t.y2 - t.y1);
  const l = (t.x2 - t.x1) * s;
  const dx = cx - l / 2 - t.x1 * s;
  const dy = cy + hauteur / 2 - t.y2 * s - hauteur * 0.02;
  return `<path transform="translate(${n2(dx)} ${n2(dy)}) scale(${n2(s)})" fill="${fill}" d="${t.d}"/>`;
}
function ombre(id) {
  // .pair .avatar : 0 20px 50px -20px rgb(0 0 0 / .8), soit une ombre portée basse et douce
  return `<filter id="${id}" x="-30%" y="-30%" width="160%" height="170%" color-interpolation-filters="sRGB"><feDropShadow dx="0" dy="22" stdDeviation="22" flood-color="#000" flood-opacity="0.45"/></filter>`;
}
function flou(id, rayon) {
  return `<filter id="${id}" x="-40%" y="-40%" width="180%" height="180%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${rayon}"/></filter>`;
}

// ------------------------------------------------------------------ Les quatre usages
export const VARIANTES = {
  app: {
    titre: 'Bot et mini app',
    scheme: 'sombre', anneau: 'aura', halo: 0.4,
    usage: 'Photo de profil du bot (BotFather, /setuserpic) et icône de la mini app. L’avatar vérifié, avec l’aura floutée derrière comme au match.',
  },
  moderation: {
    titre: 'Groupe de modération',
    scheme: 'sombre', anneau: 'or', halo: 0,
    usage: 'Photo du groupe privé de modération (ADMIN_CHAT_ID). L’anneau doré est celui de « ce qu’on t’accorde », et la modération accorde la vérification.',
  },
  communaute: {
    titre: 'Groupe de la communauté',
    scheme: 'sombre', anneau: 'os', halo: 0.3,
    usage: 'Photo du groupe ouvert aux membres de la bêta. L’anneau os est celui des nouveaux matchs : ce qui vient d’arriver.',
  },
  annonces: {
    titre: 'Canal d’annonces',
    scheme: 'clair', anneau: 'aura', halo: 0.3,
    usage: 'Photo du canal public. Le thème clair : le même avatar vérifié, posé sur l’os.',
  },
};

// L'avatar seul, à poser n'importe où : le carré arrondi, sa bordure ou son anneau, l'initiale.
// (x, y) est le coin du carré, cote son côté. Les identifiants sont préfixés pour qu'on puisse en
// inclure plusieurs dans un même dessin.
function avatar(v, x, y, cote, id) {
  const r = cote * AVATAR.rayon;
  const cx = x + cote / 2;
  const cy = y + cote / 2;
  const e = cote / AVATAR.cote; // échelle des épaisseurs
  const [pa, pc] = v.scheme === 'clair' ? [COULEURS.photoAClair, COULEURS.photoCClair] : [COULEURS.photoA, COULEURS.photoC];
  const fond = v.scheme === 'clair' ? COULEURS.osPage : COULEURS.encre;
  const defs = [degradePhoto(`${id}p`, pa, pc), ombre(`${id}o`)];
  let corps;
  if (v.anneau === 'aura') {
    // .avatar.verified : la bordure est l'aura, l'image en retrait dessine le padding-box
    const b = AVATAR.bordure * e;
    defs.push(`<clipPath id="${id}c">${arrondi(x, y, cote, r)}</clipPath>`);
    corps = `<g filter="url(#${id}o)">${arrondi(x, y, cote, r, ` fill="${pc}"`)}</g>
    <g clip-path="url(#${id}c)">${disqueAura(cx, cy, cote)}</g>
    ${arrondi(x + b, y + b, cote - 2 * b, r - b, ` fill="url(#${id}p)"`)}`;
  } else {
    // .like-item / .new-item : un liseré de fond, puis l'anneau, posés en ombre autour de l'avatar
    const l = AVATAR.lisere * e;
    const a = AVATAR.anneau * e;
    const couleur = v.anneau === 'or' ? (v.scheme === 'clair' ? COULEURS.orClair : COULEURS.orSombre) : (v.scheme === 'clair' ? COULEURS.texteClair : COULEURS.boutonSombre);
    corps = `${arrondi(x - l - a, y - l - a, cote + 2 * (l + a), r + l + a, ` fill="${couleur}"`)}
    ${arrondi(x - l, y - l, cote + 2 * l, r + l, ` fill="${fond}"`)}
    <g filter="url(#${id}o)">${arrondi(x, y, cote, r, ` fill="url(#${id}p)"`)}</g>`;
  }
  return { defs: defs.join(''), corps: `${corps}\n    ${initiale(cx, cy, cote * AVATAR.lettre, COULEURS.os)}` };
}

// La pastille Telegram : 1024 × 1024, le fond remplit le carré parce que Telegram y découpe un
// cercle ; l'avatar et son anneau tiennent dans le cercle inscrit, donc rien n'est coupé.
export function pastille(nom, { taille = AVATAR.canevas } = {}) {
  const v = VARIANTES[nom];
  const T = AVATAR.canevas;
  const c = T / 2;
  const fond = v.scheme === 'clair' ? COULEURS.osPage : COULEURS.encre;
  const a = avatar(v, c - AVATAR.cote / 2, c - AVATAR.cote / 2, AVATAR.cote, 'a');
  // .match-hero .aura : l'aura floutée derrière l'avatar, voilée et lente
  const halo = v.halo
    ? `<g filter="url(#h)" opacity="${v.halo}"><clipPath id="hc"><circle cx="${c}" cy="${c}" r="${T * 0.36}"/></clipPath><g clip-path="url(#hc)">${disqueAura(c, c, T * 0.36, 90)}</g></g>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${T} ${T}" width="${taille}" height="${taille}">
  <title>${MARQUE.nom} — ${v.titre}</title>
  <defs>${a.defs}${flou('h', 90)}</defs>
  <rect width="${T}" height="${T}" fill="${fond}"/>
  ${halo}
  ${a.corps}
</svg>
`;
}

// La marque seule : l'avatar sans fond, pour un verrouillage, une affiche, une impression.
export function marque(nom = 'app', { taille = 512 } = {}) {
  const v = VARIANTES[nom];
  const T = 512;
  const marge = v.anneau === 'aura' ? 40 : 40 + AVATAR.lisere + AVATAR.anneau;
  const a = avatar(v, marge, marge, T - 2 * marge, 'm');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${T} ${T}" width="${taille}" height="${taille}">
  <title>${MARQUE.nom}</title>
  <defs>${a.defs}</defs>
  ${a.corps}
</svg>
`;
}

// Le monogramme en une couleur : tampon, filigrane, gravure. Le carré arrondi en réserve, l'initiale
// en plein, ou l'inverse selon la surface.
export function marqueMono(couleur = 'currentColor') {
  const T = 512;
  const cote = 432;
  const x = (T - cote) / 2;
  const r = cote * AVATAR.rayon;
  const b = AVATAR.bordure * (cote / AVATAR.cote);
  return `${svgOuvre(T, T)}
  <title>${MARQUE.nom} — monogramme</title>
  <path fill-rule="evenodd" fill="${couleur}" d="M${n2(x + r)} ${n2(x)}h${n2(cote - 2 * r)}a${n2(r)} ${n2(r)} 0 0 1 ${n2(r)} ${n2(r)}v${n2(cote - 2 * r)}a${n2(r)} ${n2(r)} 0 0 1 -${n2(r)} ${n2(r)}h-${n2(cote - 2 * r)}a${n2(r)} ${n2(r)} 0 0 1 -${n2(r)} -${n2(r)}v-${n2(cote - 2 * r)}a${n2(r)} ${n2(r)} 0 0 1 ${n2(r)} -${n2(r)}z M${n2(x + r)} ${n2(x + b)}a${n2(r - b)} ${n2(r - b)} 0 0 0 -${n2(r - b)} ${n2(r - b)}v${n2(cote - 2 * r)}a${n2(r - b)} ${n2(r - b)} 0 0 0 ${n2(r - b)} ${n2(r - b)}h${n2(cote - 2 * r)}a${n2(r - b)} ${n2(r - b)} 0 0 0 ${n2(r - b)} -${n2(r - b)}v-${n2(cote - 2 * r)}a${n2(r - b)} ${n2(r - b)} 0 0 0 -${n2(r - b)} -${n2(r - b)}z"/>
  ${initiale(T / 2, T / 2, cote * AVATAR.lettre, couleur)}
</svg>
`;
}

// Le logotype : le nom en Fraunces 500, la graisse de l'identité dans l'app (.boot-mark), avec
// l'interlettrage serré de -.01em déjà appliqué dans le tracé.
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

// Le logo horizontal : l'avatar à gauche, le nom à droite, le nom aligné sur le carré. L'écart vaut
// un tiers du côté, et la hauteur de capitale les deux tiers : c'est la proportion d'une ligne de
// liste dans l'app, avatar puis prénom.
export function logoHorizontal(nom, couleurTexte) {
  const v = VARIANTES[nom];
  const cote = 240;
  const cap = cote * 0.66;
  const s = cap / CAP_HEIGHT_FRAUNCES;
  const t = TRACES[MARQUE.mot];
  const largeurMot = (t.x2 - t.x1) * (s / 1000);
  const marge = 56;
  const ecart = cote / 3;
  const L = Math.ceil(marge + cote + ecart + largeurMot + marge);
  const H = cote + marge * 2;
  const a = avatar(v, marge, marge, cote, 'l');
  return `${svgOuvre(L, H)}
  <title>${MARQUE.nom}</title>
  <defs>${a.defs}</defs>
  ${a.corps}
  ${texte(MARQUE.mot, { taille: s, x: marge + cote + ecart, y: H / 2 + cap / 2 - cap * 0.04, fill: couleurTexte })}
</svg>
`;
}

// L'image de présentation de la mini app (BotFather en demande une de 640 × 360) : le match, en
// somme — l'encre, l'aura floutée, l'avatar vérifié et le nom.
export function affiche(largeur, hauteur, { beta = true } = {}) {
  const u = hauteur / 360;
  const cote = 104 * u;
  const cap = cote * 0.66;
  const s = cap / CAP_HEIGHT_FRAUNCES;
  const t = TRACES[MARQUE.mot];
  const largeurMot = (t.x2 - t.x1) * (s / 1000);
  const ecart = cote / 3;
  const bloc = cote + ecart + largeurMot;
  const x0 = (largeur - bloc) / 2;
  const cy = hauteur * 0.42;
  const a = avatar(VARIANTES.app, x0, cy - cote / 2, cote, 'p');
  const rh = 118 * u;
  const etiquette = beta
    ? `<rect x="${n2(largeur / 2 - 62 * u)}" y="${n2(hauteur * 0.815)}" width="${n2(124 * u)}" height="${n2(24 * u)}" rx="${n2(12 * u)}" fill="none" stroke="${COULEURS.os}" stroke-opacity="0.22" stroke-width="${n2(1.2 * u)}"/>
  ${texte('beta', { taille: 9.5 * u, x: largeur / 2, y: hauteur * 0.815 + 16.4 * u, ancre: 'centre', fill: COULEURS.os, opacity: 0.6 })}`
    : '';
  return `${svgOuvre(largeur, hauteur)}
  <title>${MARQUE.nom} — présentation</title>
  <defs>${a.defs}${flou('ph', 34 * u)}<clipPath id="phc"><circle cx="${n2(x0 + cote / 2)}" cy="${n2(cy)}" r="${n2(rh)}"/></clipPath></defs>
  <rect width="${largeur}" height="${hauteur}" fill="${COULEURS.encre}"/>
  <g filter="url(#ph)" opacity="0.32"><g clip-path="url(#phc)">${disqueAura(x0 + cote / 2, cy, rh, 90)}</g></g>
  ${a.corps}
  ${texte(MARQUE.mot, { taille: s, x: x0 + cote + ecart, y: cy + cap / 2 - cap * 0.04, fill: COULEURS.os })}
  ${texte('slogan', { taille: 16 * u, x: largeur / 2, y: hauteur * 0.7, ancre: 'centre', fill: COULEURS.os, opacity: 0.62 })}
  ${etiquette}
</svg>
`;
}

// Le favicon : l'avatar vérifié en 64 px, sans ombre, en 36 segments — il fait 16 px sur un onglet.
export function favicon() {
  const T = 64;
  const cote = 60;
  const x = 2;
  const r = cote * AVATAR.rayon;
  const b = 4;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${T} ${T}">
  <defs>${degradePhoto('fp', COULEURS.photoA, COULEURS.photoC)}<clipPath id="fc">${arrondi(x, x, cote, r)}</clipPath></defs>
  <g clip-path="url(#fc)">${disqueAura(T / 2, T / 2, cote, 36)}</g>
  ${arrondi(x + b, x + b, cote - 2 * b, r - b, ' fill="url(#fp)"')}
  ${initiale(T / 2, T / 2, cote * AVATAR.lettre, COULEURS.os)}
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
