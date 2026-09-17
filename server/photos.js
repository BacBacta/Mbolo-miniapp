// Les fichiers d'une photo, et la miniature que le serveur en tire.
//
// Une photo vit dans deux fichiers : l'image entière (`<id>-photo-<n>.jpg`, jusqu'à 720 px,
// compressée par le téléphone avant l'envoi) et sa miniature (`<id>-photo-<n>-mini.jpg`, un carré
// de 160 px). La carte et la fiche montrent l'entière ; les listes — Messages, « qui t'a aimé »,
// la vue Liste, l'en-tête de la discussion — n'ont besoin que de la petite : une vignette de
// 40 px téléchargeait 60 Ko là où 4 suffisent, et une liste en porte cinquante.
//
// **La miniature se fabrique ici, jamais sur le téléphone.** Le raisonnement est court : chaque
// photo est validée par un humain avant d'être montrée, et ce que l'humain valide est l'image
// entière. Une miniature envoyée par le client serait une seconde image, que personne n'aurait
// vue, montrée à tout le monde dans les listes — un contournement de la modération par la petite
// porte. On la tire donc du fichier validé, sur le serveur, et un champ `mini` reçu du client est
// ignoré (règle 5.1 : ne jamais faire confiance au client).
//
// Le décodage se fait en JavaScript pur (`jpeg-js`) : pas de binaire natif, pas de ffmpeg, rien
// qui ne tienne pas sur une machine de 256 Mo. Les bornes sont posées avant de décoder — une
// image de 1,5 Mo peut annoncer 20 000 × 20 000 pixels, soit 1,6 Go une fois décodée — et un
// fichier qui ne se décode pas ne fait tomber personne : la miniature est **facultative**, la
// photo entière reste le repli. C'est la même règle que le flux de la discussion : ce qui
// économise ne doit jamais devenir ce qui casse.
//
// Rien n'est refait à chaque requête : la miniature s'écrit une fois, à l'envoi de la photo, et
// à la première demande pour les photos d'avant (les profils de démonstration compris). Une
// nouvelle photo dans le même emplacement emporte l'ancienne miniature avec elle.
import fs from 'node:fs';
import path from 'node:path';
import jpeg from 'jpeg-js';

export const PHOTO_SLOTS = [1, 2, 3, 4, 5, 6];
// Le côté de la miniature. Les vignettes font 40 à 60 px à l'écran, 104 sur la fiche : 160 px
// couvre un écran à densité 2 sans dépasser quelques kilo-octets.
export const MINI_COTE = 160;
export const MINI_QUALITE = 72;
// L'aperçu **flouté** : ce qu'une personne sans pass voit de qui l'a aimée ou s'est arrêtée sur
// sa fiche. Dix pixels de côté — des taches de couleur, jamais un visage. Le flou est fait
// **ici, sur le serveur**, et pas par une règle CSS sur la photo entière : une règle CSS se
// retire d'un geste dans un navigateur, et l'adresse de la photo entière resterait dans la page.
// Ce qui part du serveur est déjà méconnaissable ; le navigateur ne fait que l'agrandir.
export const FLOU_COTE = 10;
export const FLOU_QUALITE = 60;
// Au-delà, on ne décode pas : le téléphone envoie du 720 px, et 6 mégapixels laissent de la marge
// à un client plus ancien sans laisser passer une image fabriquée pour remplir la mémoire.
const MAX_MEGAPIXELS = 6;
const MAX_MEMOIRE_MO = 64;

// Le nom de fichier sans l'identifiant ni l'extension : `photo-2`, `photo-2-mini`.
export const nomPhoto = (n, { mini = false } = {}) => `photo-${n}${mini ? '-mini' : ''}`;
export const fichierPhoto = (dir, id, n, opts) => path.join(dir, `${id}-${nomPhoto(n, opts)}.jpg`);
// Ce qu'un emplacement vidé emporte : les deux fichiers.
export const fichiersDUnePhoto = (n) => [nomPhoto(n), nomPhoto(n, { mini: true })];
// Ce qu'un compte supprimé emporte : l'ancienne photo unique, le selfie, et les six emplacements
// avec leurs miniatures. La liste vivait dans les deux stockages, à trois emplacements, quand il
// y en avait six : les photos 4 à 6 survivaient à la suppression du compte.
export const fichiersDUnCompte = () => ['profile', 'selfie', ...PHOTO_SLOTS.flatMap(fichiersDUnePhoto)];

// Réduit une image décodée (RGBA) en un carré de `cote` px, rognée au centre puis moyennée par
// zones : chaque pixel de sortie est la moyenne du bloc qu'il remplace, ce qui vaut mieux qu'un
// pixel pris au hasard dans le bloc, et ne demande aucune bibliothèque. Jamais agrandie : une
// image plus petite que le carré donne une miniature à sa taille.
export function reduireEnCarre({ data, width, height }, cote = MINI_COTE) {
  const source = Math.min(width, height);
  const x0 = Math.floor((width - source) / 2);
  const y0 = Math.floor((height - source) / 2);
  const taille = Math.min(cote, source);
  const sortie = Buffer.alloc(taille * taille * 4);
  for (let y = 0; y < taille; y++) {
    const ya = y0 + Math.floor((y * source) / taille);
    const yb = y0 + Math.max(ya - y0 + 1, Math.floor(((y + 1) * source) / taille));
    for (let x = 0; x < taille; x++) {
      const xa = x0 + Math.floor((x * source) / taille);
      const xb = x0 + Math.max(xa - x0 + 1, Math.floor(((x + 1) * source) / taille));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = ya; yy < yb; yy++) {
        let i = (yy * width + xa) * 4;
        for (let xx = xa; xx < xb; xx++, i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
      }
      const o = (y * taille + x) * 4;
      sortie[o] = r / n; sortie[o + 1] = g / n; sortie[o + 2] = b / n; sortie[o + 3] = 255;
    }
  }
  return { data: sortie, width: taille, height: taille };
}

// La miniature d'un fichier JPEG, en octets — ou null si le fichier ne se décode pas ou dépasse
// les bornes. Ne jette jamais : l'appelant sert la photo entière à la place.
export function fabriquerMiniature(octets) {
  try {
    const image = jpeg.decode(octets, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: MAX_MEGAPIXELS, maxMemoryUsageInMB: MAX_MEMOIRE_MO });
    return jpeg.encode(reduireEnCarre(image), MINI_QUALITE).data;
  } catch {
    return null;
  }
}

// L'aperçu flouté d'un fichier JPEG, en octets — ou null. Même repli que la miniature : ne
// jette jamais, et l'appelant montre une tuile neutre à la place.
export function fabriquerFlou(octets) {
  try {
    const image = jpeg.decode(octets, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: MAX_MEGAPIXELS, maxMemoryUsageInMB: MAX_MEMOIRE_MO });
    return jpeg.encode(reduireEnCarre(image, FLOU_COTE), FLOU_QUALITE).data;
  } catch {
    return null;
  }
}

// L'aperçu flouté d'une photo, prêt à être posé dans une page (`data:` URI). Il part de la
// **miniature**, pas de la photo entière : décoder 160 pixels de côté coûte quelques
// millisecondes, décoder 720 × 960 en coûte quatre-vingts, et une liste en porte jusqu'à douze.
// Rien n'est écrit sur le disque : quelques centaines d'octets se refont à chaque demande.
export function flouDe(fichier) {
  const source = miniatureDe(fichier) || (fs.existsSync(fichier) ? fichier : null);
  if (!source) return null;
  const octets = fabriquerFlou(fs.readFileSync(source));
  return octets ? `data:image/jpeg;base64,${octets.toString('base64')}` : null;
}

// Le chemin de la miniature d'une photo, écrite si elle ne l'est pas encore. `null` quand elle
// ne peut pas être faite : la photo entière reste le repli, et rien ne casse.
export function miniatureDe(fichier) {
  const mini = fichier.replace(/\.jpg$/, '-mini.jpg');
  if (fs.existsSync(mini)) return mini;
  if (!fs.existsSync(fichier)) return null;
  const octets = fabriquerMiniature(fs.readFileSync(fichier));
  if (!octets) return null;
  fs.writeFileSync(mini, octets);
  return mini;
}

// À l'arrivée d'une nouvelle photo : l'ancienne miniature de l'emplacement part (sinon une liste
// montrerait la photo d'avant à côté de la fiche d'après), et la nouvelle s'écrit tout de suite —
// c'est la personne qui envoie qui paie ces quelques dizaines de millisecondes, pas la première
// qui regarde.
export function refaireLaMiniature(fichier) {
  const mini = fichier.replace(/\.jpg$/, '-mini.jpg');
  if (fs.existsSync(mini)) fs.unlinkSync(mini);
  return miniatureDe(fichier);
}
