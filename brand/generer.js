// Fabrique l'identité visuelle : les SVG de brand/svg/ et les PNG de brand/png/.
//
//   node brand/generer.js          (ou npm run logo)
//
// Tout part d'ici, rien n'est dessiné à la main : les couleurs sont celles de public/styles.css,
// les lettres viennent de brand/traces.js (Fraunces et Manrope figées en tracés), et les PNG sont
// rendus par le Chromium de Playwright, déjà présent pour les tests de bout en bout. Changer une
// couleur ou une taille, c'est changer une constante ici et relancer.
//
// Le concept : le logo est l'anneau « vérifié » de l'app elle-même. Dans l'interface, l'aura
// (rose, ambre, violet) n'a le droit d'apparaître qu'au match, sur l'anneau d'un avatar vérifié
// et sur le stamp du like. L'avatar du bot est donc un avatar vérifié : un disque d'encre, un
// anneau d'aura, et le M de Fraunces au centre. Les groupes gardent la même construction et
// changent seulement l'anneau : ambre pour la modération (la couleur de la confiance), rose pour
// la communauté (la couleur du like), aura sur os pour les annonces (le thème clair).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRACES, CAP_HEIGHT_FRAUNCES } from './traces.js';

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
// Anneau uni ou en dégradé linéaire (modération, communauté, monochrome).
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
// Le monogramme : le M de Fraunces, posé par la hauteur de ses capitales et centré optiquement.
// Le M est légèrement remonté (3 % de la hauteur) : centré au millimètre, il paraît tomber.
function monogramme(cx, cy, hauteurCap, fill) {
  const taille = hauteurCap / CAP_HEIGHT_FRAUNCES;
  return texte('M', { taille, x: cx, y: cy + hauteurCap / 2 - hauteurCap * 0.03, ancre: 'centre', fill });
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
// L'aura qui respire : deux nappes radiales très douces, rose en haut à gauche, violet en bas à
// droite — la même idée que l'écran de match, où « l'aura respire derrière la paire ».
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
function degrade(id, de, a) {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${de}"/><stop offset="1" stop-color="${a}"/></linearGradient>`;
}
const svgOuvre = (l, h, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${l} ${h}" width="${l}" height="${h}"${extra}>`;

// ------------------------------------------------------------------ Les variantes de pastille
// Quatre déclinaisons, une construction : ce qui change est l'anneau, le fond et la couleur du M.
export const VARIANTES = {
  app: {
    titre: 'Bot et mini app',
    fond: COULEURS.encre, respiration: 0.26, anneau: 'aura', lettre: COULEURS.os,
    usage: 'Photo de profil du bot (@BotFather → /setuserpic) et icône de la mini app.',
  },
  moderation: {
    titre: 'Groupe de modération',
    fond: COULEURS.encre, respiration: 0, ambre: 0.16, anneau: 'or', lettre: COULEURS.orSombre,
    usage: 'Photo du groupe privé « Modération Mbolo » (ADMIN_CHAT_ID). L’ambre est la couleur de la confiance dans l’app.',
  },
  communaute: {
    titre: 'Groupe de la communauté',
    fond: COULEURS.encre, respiration: 0.22, anneau: 'rose', lettre: COULEURS.os,
    usage: 'Photo du groupe ouvert aux membres de la bêta. Le rose est la couleur du « J’aime ».',
  },
  annonces: {
    titre: 'Canal d’annonces',
    fond: COULEURS.os, respiration: 0.14, anneau: 'aura', lettre: COULEURS.texteClair,
    usage: 'Photo du canal public. La version claire : os et encre, comme le thème clair de l’app.',
  },
};

// La pastille : 1024 × 1024, le disque remplit tout le carré parce que Telegram découpe un cercle
// dedans. L'anneau est posé à 84 px du bord, sa lueur à l'intérieur : rien n'est coupé.
export const PASTILLE = { taille: 1024, rayonAnneau: 428, epaisseur: 26, hauteurM: 376 };

function anneau(variante, cx, cy, r, ep, defs) {
  if (variante.anneau === 'aura') return anneauAura(cx, cy, r, ep);
  if (variante.anneau === 'or') {
    defs.push(degrade('or', COULEURS.orSombre, COULEURS.orClair));
    return anneauSimple(cx, cy, r, ep, 'url(#or)');
  }
  if (variante.anneau === 'rose') {
    defs.push(degrade('rose', COULEURS.like, COULEURS.ambre));
    return anneauSimple(cx, cy, r, ep, 'url(#rose)');
  }
  return anneauSimple(cx, cy, r, ep, variante.lettre);
}

// { carre: true } remplit tout le carré (avatar Telegram : Telegram découpe lui-même le cercle) ;
// sinon la pastille est un disque sur fond transparent, à poser sur n'importe quelle surface, et
// la lueur de l'anneau déborde un peu du disque — c'est ce qui la fait exister sur un fond sombre.
export function pastille(nom, { carre = true, taille = PASTILLE.taille } = {}) {
  const v = VARIANTES[nom];
  const T = PASTILLE.taille;
  const c = T / 2;
  const defs = [grain('grain'), halo('halo', 30)];
  const nappe = v.respiration
    ? respiration(T, T, v.respiration)
    : v.ambre
      ? `<defs><radialGradient id="ra" gradientUnits="userSpaceOnUse" cx="${T * 0.3}" cy="${T * 0.22}" r="${T * 0.7}"><stop offset="0" stop-color="${COULEURS.orSombre}" stop-opacity="${v.ambre}"/><stop offset="1" stop-color="${COULEURS.orSombre}" stop-opacity="0"/></radialGradient></defs><rect width="${T}" height="${T}" fill="url(#ra)"/>`
      : '';
  const ring = anneau(v, c, c, PASTILLE.rayonAnneau, PASTILLE.epaisseur, defs);
  const clip = carre ? '' : ` clip-path="url(#rond)"`;
  const lueur = v.fond === COULEURS.os ? 0.35 : 0.55;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${T} ${T}" width="${taille}" height="${taille}">
  <title>Mbolo — ${v.titre}</title>
  <defs>${defs.join('')}<clipPath id="rond"><circle cx="${c}" cy="${c}" r="${c}"/></clipPath></defs>
  <g${clip}>
    <rect width="${T}" height="${T}" fill="${v.fond}"/>
    ${nappe}
  </g>
  <g filter="url(#halo)" opacity="${lueur}">${ring}</g>
  ${ring}
  ${monogramme(c, c, PASTILLE.hauteurM, v.lettre)}
  <rect width="${T}" height="${T}" filter="url(#grain)"${clip}/>
</svg>
`;
}

// Le monogramme seul, en une couleur : tampon, filigrane, impression en une couleur.
export function marqueMono(couleur = 'currentColor') {
  const T = 1024;
  const c = T / 2;
  return `${svgOuvre(T, T)}
  <title>Mbolo — monogramme</title>
  ${anneauSimple(c, c, PASTILLE.rayonAnneau, PASTILLE.epaisseur, couleur)}
  ${monogramme(c, c, PASTILLE.hauteurM, couleur)}
</svg>
`;
}

// Le logotype : « Mbolo » en Fraunces, ancré par sa hauteur de capitales.
const LOGOTYPE = { hauteurCap: 700 * 0.4, marge: 24 };
export function logotype(couleur) {
  const s = LOGOTYPE.hauteurCap / (700 / 1000);
  const t = TRACES.Mbolo;
  const largeur = (t.x2 - t.x1) * (s / 1000);
  const haut = -t.y1 * (s / 1000);
  const bas = t.y2 * (s / 1000);
  const L = Math.ceil(largeur + LOGOTYPE.marge * 2);
  const H = Math.ceil(haut + bas + LOGOTYPE.marge * 2);
  return `${svgOuvre(L, H)}
  <title>Mbolo — logotype</title>
  ${texte('Mbolo', { taille: s, x: LOGOTYPE.marge, y: LOGOTYPE.marge + haut, fill: couleur })}
</svg>
`;
}

// Le logo horizontal : pastille à gauche, logotype à droite, alignés sur l'axe de la pastille.
export function logoHorizontal(nom, couleurTexte, { fond = null } = {}) {
  const P = 320;                       // diamètre de la pastille
  const cap = 232;                     // hauteur des capitales du logotype
  const s = cap / CAP_HEIGHT_FRAUNCES; // taille d'em
  const t = TRACES.Mbolo;
  const largeurMot = (t.x2 - t.x1) * (s / 1000);
  const marge = 64;
  const ecart = 60;
  const L = Math.ceil(marge + P + ecart + largeurMot + marge);
  const H = P + marge * 2;
  const cy = H / 2;
  const contenu = pastille(nom, { carre: false })
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/<title>.*?<\/title>/, '');
  const echelle = P / PASTILLE.taille;
  return `${svgOuvre(L, H)}
  <title>Mbolo</title>
  ${fond ? `<rect width="${L}" height="${H}" fill="${fond}"/>` : ''}
  <g transform="translate(${marge} ${marge}) scale(${n2(echelle)})">${contenu}</g>
  ${texte('Mbolo', { taille: s, x: marge + P + ecart, y: cy + cap / 2 - cap * 0.04, fill: couleurTexte })}
</svg>
`;
}

// Image de présentation de la mini app (BotFather demande 640 × 360) et bannière de partage.
export function affiche(largeur, hauteur, { beta = true } = {}) {
  const u = hauteur / 360; // tout est pensé en 640 × 360 puis mis à l'échelle
  const P = 128 * u;
  const cap = 84 * u;
  const s = cap / CAP_HEIGHT_FRAUNCES;
  const t = TRACES.Mbolo;
  const largeurMot = (t.x2 - t.x1) * (s / 1000);
  const ecart = 28 * u;
  const bloc = P + ecart + largeurMot;
  const x0 = (largeur - bloc) / 2;
  const cy = hauteur * 0.43;
  const contenu = pastille('app', { carre: false })
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/<title>.*?<\/title>/, '');
  const echelle = P / PASTILLE.taille;
  const slogan = texte('slogan', { taille: 17 * u, x: largeur / 2, y: hauteur * 0.74, ancre: 'centre', fill: COULEURS.os, opacity: 0.72 });
  const etiquette = beta
    ? `<g>
    <rect x="${n2(largeur / 2 - 62 * u)}" y="${n2(hauteur * 0.815)}" width="${n2(124 * u)}" height="${n2(24 * u)}" rx="${n2(12 * u)}" fill="none" stroke="${COULEURS.os}" stroke-opacity="0.28" stroke-width="${n2(1.2 * u)}"/>
    ${texte('beta', { taille: 9.5 * u, x: largeur / 2, y: hauteur * 0.815 + 16.4 * u, ancre: 'centre', fill: COULEURS.os, opacity: 0.72 })}
  </g>`
    : '';
  return `${svgOuvre(largeur, hauteur)}
  <title>Mbolo — présentation</title>
  <defs>${grain('grainA', 0.03)}</defs>
  <rect width="${largeur}" height="${hauteur}" fill="${COULEURS.encre}"/>
  ${respiration(largeur, hauteur, 0.2, 'af')}
  <g transform="translate(${n2(x0)} ${n2(cy - P / 2)}) scale(${n2(echelle)})">${contenu}</g>
  ${texte('Mbolo', { taille: s, x: x0 + P + ecart, y: cy + cap / 2 - cap * 0.04, fill: COULEURS.os })}
  ${slogan}
  ${etiquette}
  <rect width="${largeur}" height="${hauteur}" filter="url(#grainA)"/>
</svg>
`;
}

// Le favicon : la pastille, sans lueur ni grain, en 36 segments — il fait 16 px sur un onglet.
export function favicon() {
  const T = 64;
  const c = 32;
  const ring = anneauAura(c, c, 26.5, 3, 36);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${T} ${T}">
  <circle cx="${c}" cy="${c}" r="${c}" fill="${COULEURS.encre}"/>
  ${ring}
  ${monogramme(c, c, 24, COULEURS.os)}
</svg>
`;
}

// ------------------------------------------------------------------ Ce qui est écrit sur le disque
export function fichiersSvg() {
  const svg = {};
  for (const nom of Object.keys(VARIANTES)) {
    svg[`svg/avatar-${nom}.svg`] = pastille(nom, { carre: true });
    svg[`svg/pastille-${nom}.svg`] = pastille(nom, { carre: false });
  }
  svg['svg/monogramme-encre.svg'] = marqueMono(COULEURS.texteClair);
  svg['svg/monogramme-os.svg'] = marqueMono(COULEURS.os);
  svg['svg/logotype-encre.svg'] = logotype(COULEURS.texteClair);
  svg['svg/logotype-os.svg'] = logotype(COULEURS.os);
  svg['svg/logo-horizontal-sombre.svg'] = logoHorizontal('app', COULEURS.os);
  svg['svg/logo-horizontal-clair.svg'] = logoHorizontal('annonces', COULEURS.texteClair);
  svg['svg/presentation-640x360.svg'] = affiche(640, 360);
  svg['svg/banniere-1200x630.svg'] = affiche(1200, 630);
  return svg;
}

// Chaque PNG : la source SVG, la taille, et si le fond reste transparent.
export const RENDUS = [
  ...Object.keys(VARIANTES).flatMap((nom) => [
    { source: `svg/avatar-${nom}.svg`, sortie: `png/avatar-${nom}-1024.png`, largeur: 1024, hauteur: 1024 },
    { source: `svg/avatar-${nom}.svg`, sortie: `png/avatar-${nom}-512.png`, largeur: 512, hauteur: 512 },
    { source: `svg/pastille-${nom}.svg`, sortie: `png/pastille-${nom}-512.png`, largeur: 512, hauteur: 512, transparent: true },
  ]),
  { source: 'svg/logo-horizontal-sombre.svg', sortie: 'png/logo-horizontal-sombre.png', transparent: true },
  { source: 'svg/logo-horizontal-clair.svg', sortie: 'png/logo-horizontal-clair.png', transparent: true },
  { source: 'svg/logo-horizontal-sombre.svg', sortie: 'png/logo-horizontal-sur-encre.png', fond: COULEURS.encre },
  { source: 'svg/logo-horizontal-clair.svg', sortie: 'png/logo-horizontal-sur-os.png', fond: COULEURS.osPage },
  { source: 'svg/presentation-640x360.svg', sortie: 'png/presentation-640x360.png', largeur: 640, hauteur: 360 },
  { source: 'svg/presentation-640x360.svg', sortie: 'png/presentation-1280x720.png', largeur: 1280, hauteur: 720 },
  { source: 'svg/banniere-1200x630.svg', sortie: 'png/banniere-1200x630.png', largeur: 1200, hauteur: 630 },
];

const dossier = path.dirname(fileURLToPath(import.meta.url));

export function ecrireSvg(racine = dossier) {
  const svg = fichiersSvg();
  fs.mkdirSync(path.join(racine, 'svg'), { recursive: true });
  for (const [nom, contenu] of Object.entries(svg)) fs.writeFileSync(path.join(racine, nom), contenu);
  return Object.keys(svg);
}

function dimensions(svgSource) {
  const m = svgSource.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
  return { largeur: Math.round(+m[1]), hauteur: Math.round(+m[2]) };
}

export async function rendrePng(racine = dossier) {
  const { chromium } = await import('@playwright/test');
  fs.mkdirSync(path.join(racine, 'png'), { recursive: true });
  const navigateur = await chromium.launch();
  try {
    for (const r of RENDUS) {
      const source = fs.readFileSync(path.join(racine, r.source), 'utf8');
      const base = dimensions(source);
      const largeur = r.largeur ?? base.largeur;
      const hauteur = r.hauteur ?? base.hauteur;
      const page = await navigateur.newPage({ viewport: { width: largeur, height: hauteur }, deviceScaleFactor: 1 });
      const svgDimensionne = source.replace(/^<svg([^>]*?) width="[^"]*" height="[^"]*"/, `<svg$1 width="${largeur}" height="${hauteur}"`);
      await page.setContent(
        `<!doctype html><html><body style="margin:0;background:${r.fond ?? 'transparent'}">${svgDimensionne}</body></html>`,
      );
      await page.screenshot({ path: path.join(racine, r.sortie), omitBackground: !!r.transparent, type: 'png' });
      await page.close();
      console.log(`${r.sortie}  ${largeur}×${hauteur}`);
    }
  } finally {
    await navigateur.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const svgs = ecrireSvg();
  console.log(`${svgs.length} SVG écrits dans brand/svg/`);
  await rendrePng();
  console.log(`${RENDUS.length} PNG rendus dans brand/png/`);
}
