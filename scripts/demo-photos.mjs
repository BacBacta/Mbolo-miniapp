// Les images des profils de démonstration : `npm run demo-photos`.
//
// **Développement seulement.** Ce script importe Chromium (@playwright/test, dépendance de
// développement) : il ne tourne jamais dans l'image déployée, et rien en production ne l'appelle.
// Les images qu'il écrit, elles, sont versionnées — c'est ce qu'on sert quand SEED_DEMO=true.
//
// Pourquoi il existe : les images d'avant étaient des fichiers sans fabrique. Le jour où elles se
// sont révélées mal calibrées — l'initiale posée trop haut, les cercles en travers de la lettre —
// il n'y avait aucun moyen de les refaire. Maintenant si.
//
// Ce que « calibré » veut dire ici, et qui est tout le sujet :
//
//   * **La lettre est centrée sur son encre, pas sur sa boîte.** Une boîte de texte contient
//     l'interligne, la hampe ascendante et la jambage descendante, que la lettre les emploie ou
//     non. Centrer la boîte pose un « C » haut et un « J » bas. On mesure donc l'encre réelle
//     (`actualBoundingBox*`) et on centre ça.
//   * **La lettre a toujours le même poids optique.** Elle est mise à l'échelle pour remplir un
//     carré, largeur comme hauteur : un « I » étroit et un « W » large pèsent pareil sur la carte.
//   * **Les cercles ne touchent jamais la lettre.** Ils débordent du cadre, en diagonale, loin de
//     la zone réservée. Avant, ils tombaient en plein dessus.
//   * **La lettre vit au-dessus du voile.** L'app pose un dégradé sombre sur les 58 % du bas et y
//     écrit le prénom : une lettre centrée dans l'image se retrouvait à moitié dessous.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SORTIE = path.join(ICI, '..', 'server', 'demo-photos');
const POLICES = path.join(ICI, '..', 'identite', 'source', 'fonts');

// 640 × 800, soit le 4/5 de `.card-photo` : l'image remplit la carte sans être rognée.
const L = 640, H = 800;

// Une teinte par profil, tirée de son identifiant : stable d'une exécution à l'autre, et deux
// profils voisins dans la liste ne tombent pas sur la même couleur.
function teinte(cle) {
  let h = 0;
  for (const c of cle) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

const page = `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="file://${POLICES}/local2.css">
<style>html,body{margin:0;background:#000}</style>
<canvas id="c" width="${L}" height="${H}"></canvas>
<script>
window.dessiner = ({ lettre, hue, motif, L, H }) => {
  const ctx = document.getElementById('c').getContext('2d');

  // Fond : la rampe du jeton --photo de styles.css, à la teinte du profil. Mêmes trois paliers de
  // luminosité pour tout le monde (56 %, 33 %, 16 %) : les images d'avant mettaient côte à côte
  // un vert sombre et un orange éclatant, et le prénom se lisait sur l'une et pas sur l'autre.
  // Le placeholder que l'app dessine elle-même, faute de photo, est de la même famille.
  const fond = ctx.createLinearGradient(L * 0.3, 0, L * 0.3, H);
  fond.addColorStop(0, \`hsl(\${hue} 34% 56%)\`);
  fond.addColorStop(0.45, \`hsl(\${hue} 38% 33%)\`);
  fond.addColorStop(1, \`hsl(\${hue} 42% 16%)\`);
  ctx.fillStyle = fond;
  ctx.fillRect(0, 0, L, H);

  // Un motif par numéro de photo. Ce n'est pas de la décoration : une fiche porte jusqu'à trois
  // photos, et toucher la moitié droite de la carte passe à la suivante. Si les trois se
  // ressemblaient, le geste n'aurait l'air de rien faire — et c'est justement ce qu'on va
  // vérifier à la main sur un téléphone.
  //
  // Aucun des trois ne coupe la lettre : les formes débordent du cadre par les coins, et les
  // rayures sont une texture, pas une silhouette.
  if (motif === 1) {
    ctx.fillStyle = 'rgb(255 255 255 / .07)';
    ctx.beginPath(); ctx.arc(-30, 110, 185, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgb(255 255 255 / .05)';
    ctx.beginPath(); ctx.arc(L + 60, H - 90, 215, 0, 7); ctx.fill();
  } else if (motif === 2) {
    ctx.save();
    ctx.fillStyle = 'rgb(255 255 255 / .075)';
    ctx.translate(L / 2, H / 2); ctx.rotate(-Math.PI / 4); ctx.translate(-H, -H);
    for (let x = 0; x < H * 2; x += 96) ctx.fillRect(x, 0, 48, H * 2);
    ctx.restore();
  } else {
    ctx.save();
    ctx.strokeStyle = 'rgb(255 255 255 / .06)';
    ctx.lineWidth = 46;
    for (let r = 150; r < 760; r += 130) { ctx.beginPath(); ctx.arc(-40, H + 60, r, 0, 7); ctx.stroke(); }
    ctx.restore();
  }

  // La lettre, posée exactement comme l'app pose la sienne quand un profil n'a pas de photo :
  // même taille relative (130 px sur une carte de 449 px de haut, soit 29 % de la hauteur), même
  // opacité, même centre. Une image de démonstration et un profil sans photo doivent se
  // ressembler — c'est l'inverse qui donnait l'impression d'un réglage raté.
  //
  // Ce qui change, et qui est tout le sujet : on centre **l'encre**, pas la boîte de texte. Une
  // boîte porte l'interligne, la hampe ascendante et le jambage descendant, que la lettre les
  // emploie ou non. Centrer la boîte pose un « C » haut et un « J » bas.
  const TAILLE = H * (130 / 449);
  const CENTRE_X = L / 2;
  const CENTRE_Y = H / 2;
  ctx.font = \`400 \${TAILLE}px Fraunces, Georgia, serif\`;
  const m = ctx.measureText(lettre);
  const e = {
    gauche: m.actualBoundingBoxLeft, droite: m.actualBoundingBoxRight,
    haut: m.actualBoundingBoxAscent, bas: m.actualBoundingBoxDescent,
  };

  ctx.fillStyle = 'rgb(255 255 255 / .12)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  // measureText donne les distances depuis le point d'ancrage : on place ce point de façon que
  // le milieu de l'encre tombe exactement sur le centre voulu.
  ctx.fillText(lettre, CENTRE_X - (e.droite - e.gauche) / 2, CENTRE_Y + (e.haut - e.bas) / 2);

  return document.getElementById('c').toDataURL('image/jpeg', 0.82);
};
</script>`;

const fichiers = fs.readdirSync(SORTIE).filter((f) => f.endsWith('.jpg')).sort();
if (!fichiers.length) throw new Error(`Aucune image à refaire dans ${SORTIE}`);

const navigateur = await chromium.launch();
const ctx = await navigateur.newContext({ viewport: { width: L, height: H } });
const p = await ctx.newPage();
await p.setContent(page);
await p.evaluate(() => document.fonts.load('400 300px Fraunces').then(() => document.fonts.ready));

for (const fichier of fichiers) {
  // demo-carine-2.jpg : le prénom donne la lettre et la teinte, le numéro donne le motif.
  const [, prenom, numero] = fichier.match(/^demo-([a-z]+)-(\d+)\.jpg$/) || [];
  if (!prenom) { console.warn(`ignoré (nom inattendu) : ${fichier}`); continue; }
  const lettre = prenom[0].toUpperCase();
  const motif = ((Number(numero) - 1) % 3) + 1;
  // La teinte glisse un peu d'une photo à l'autre : on reste dans la famille du profil — il
  // faut qu'on le reconnaisse — mais le changement se voit au premier coup d'œil.
  const hue = (teinte(`demo-${prenom}`) + (motif - 1) * 32) % 360;
  const dataUrl = await p.evaluate((a) => window.dessiner(a), { lettre, hue, motif, L, H });
  fs.writeFileSync(path.join(SORTIE, fichier), Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log(`${fichier}  ${lettre}  motif ${motif}  teinte ${hue}`);
}

await navigateur.close();
console.log(`${fichiers.length} images refaites dans server/demo-photos/`);
