# Identité Odo : ce que BotFather affiche

Ce dossier n'est **jamais servi au navigateur**. Il ne coûte rien aux forfaits data de
l'app : ce sont des sources de marque, pas des fichiers de `public/`.

## Ce qui va où dans BotFather

| Champ de BotFather | Fichier |
|---|---|
| Set New Photo | `odo-photo-1024.png` — carré, rogné en cercle par Telegram |
| Set Welcome Picture | `odo-accueil-fr-640x360.png` (taille exacte demandée) ou `odo-accueil-fr-1280x720.png` (2×, même cadrage, plus net) |
| Info et « What can this bot do? » | `textes-botfather.md`, cinq langues, longueurs comptées |

`apercu-telephone.png` n'est pas à envoyer : c'est la simulation de l'écran que verra
quelqu'un qui ouvre le bot sans l'avoir jamais démarré. Il sert à juger l'image à sa
taille réelle, pas à sa taille de fichier — un texte lisible sur l'écran d'un ordinateur
peut être illisible une fois réduit à la largeur d'un chat.

## Le dessin, et pourquoi il est fait comme ça

L'app pose déjà un anneau d'aura autour d'un avatar vérifié, et seulement là
(`--aura` dans `public/styles.css`, règle 14). **La marque est cet anneau** : le O
d'Odo est le signe que les membres voient déjà quand un profil est vérifié. Aucune
lettre n'est posée dedans — elle ferait doublon avec la forme.

Sur l'image d'accueil, un second cercle tracé au filet vient toucher le premier en un
seul point, et la lumière se dépose là. Deux cercles, un point de contact : c'est le
« face à face » du titre, dessiné plutôt qu'écrit.

Le dégradé est celui de `--aura`, copié à l'identique. Ce qui est ajouté, c'est
l'éclairage : reflet sur le quart exposé, ombrage vers le violet à l'opposé, lisière
claire sur le bord extérieur, ombre portée sur la surface, grain photographique.

## Régénérer après un changement de nom ou de texte

Les cinq PNG se refabriquent depuis les pages HTML de `source/`. Utile le jour où
`APP_NAME` change, ou si une phrase de l'app évolue.

```powershell
cd "C:\chemin\vers\Mbolo-miniapp"
npm ci
node "identite\source\rendre.mjs"
```

Le script rend chaque page dans Chromium à la taille exacte et réécrit les PNG du
dossier parent. Sans argument il refait les cinq ; on peut lui passer un dossier et une
liste `[[page, largeur, hauteur, densité, sortie]]` pour n'en refaire qu'un.

Les polices sont dans `source/fonts/` (Fraunces et Manrope, licence SIL OFL, libres de
redistribution) : le rendu ne dépend donc d'aucun accès réseau, et un PNG régénéré dans
deux ans sera identique à celui d'aujourd'hui. C'est la raison de leur présence ici —
sans elles, Chromium retomberait sur une police système et le dessin changerait sans
prévenir.

## La vidéo de présentation

`npm run video` fabrique `video/odo-presentation.mp4` : 1080 × 1920, 58 secondes, H.264
avec sa bande-son, le format vertical que Telegram lit en ligne comme en story. Dix scènes,
une idée par écran, dans l'identité de l'app : l'accroche, la vérification, la découverte,
le match, la demande d'argent bloquée, le pseudo qui reste caché, le premier rendez-vous,
**rien à télécharger, tout est dans Telegram**, et l'appel.

**Les écrans sont de vraies captures**, pas des maquettes : `video/captures.mjs` lance le
serveur en mode développement, crée un compte, se fait vérifier, aime un profil de
démonstration, matche, ouvre la discussion et tente une demande d'argent — puis
photographie chaque écran à la densité d'un téléphone. Une fonctionnalité qui change se
voit donc dans la vidéo au rendu suivant, sans retouche. Deux retouches de tournage, et
seulement deux : le prénom du compte de développement devient « Bienvenue », et la
pastille « démo » des profils de démonstration est masquée.

Le montage est `video/video.html` : toutes les animations sont posées avec l'API Web
Animations puis mises en pause, et `video/rendre.mjs` demande chaque image à l'instant
voulu avant de la pousser dans ffmpeg. Deux rendus donnent les mêmes images, au pixel.
`--image=12.5` sort une seule image (en secondes) pour vérifier une scène ;
`--sans-captures` réemploie les captures existantes.

Il faut ffmpeg sur la machine (`winget install Gyan.FFmpeg` sous Windows, puis rouvrir le
terminal ; ou son chemin dans la variable `FFMPEG`). Ce n'est pas une dépendance du
projet : il ne sert qu'ici.

```powershell
cd "C:\chemin\vers\Mbolo-miniapp"
npm run video
```

### La bande-son

`video/son.mjs` la **synthétise** : aucune musique du commerce, aucun échantillon, donc
aucune licence à vérifier — et deux exécutions donnent le même son au bit près. Une nappe
d'accords chauds en ré mineur qui change à chaque scène, une basse tenue, un souffle qui
monte avant chaque changement et un coup sourd dessus, une cloche sur le bouclier, le like
et le match, un battement de cœur au match, un son mat sur le message bloqué, une
réverbération sur tout ce qui frappe. Le minutage (`SCENES`) est le miroir de celui de
`video.html` : déplacer une scène, c'est déplacer les deux.

Pour une autre bande-son, une piste dont tu as la licence :

```powershell
npm run video -- --son="C:\chemin\vers\piste.mp3"
```

Telegram lance les vidéos sans le son dans les canaux : les images doivent se suffire, et
c'est le cas. `video/affiche.jpg` est l'image de fin, pour la vignette.

### Les portraits

Sans rien, les profils montrent les images de démonstration (dégradé et initiale). Pose des
portraits dans `video/photos/` — `femme-1.jpg`, `homme-1.jpg`, `femme-2.jpg`… — et
`npm run video` les place sur les profils de démonstration du même genre, dans l'ordre où
l'app les montre : la carte, le match et la discussion portent alors de vrais visages.

**D'où ils viennent compte.** Une photo prise dans une banque d'images montre une vraie
personne qui n'a jamais accepté d'illustrer une app de rencontres : c'est une atteinte à
son image, et un risque pour toi. Deux sources sûres : des ami(e)s qui ont signé un accord
écrit, ou un générateur d'images (Ideogram, Midjourney, Flux…) avec une consigne du genre :

> Portrait photo, jeune femme camerounaise de 24 ans, souriante, lumière naturelle de fin
> d'après-midi, terrasse d'un café à Yaoundé, arrière-plan doux, cadrage épaules, format
> vertical 4:5, style photo de téléphone récent, pas de texte, pas de logo.

Varie l'âge (19 à 30 ans), la tenue, le lieu (marché, campus, bord du lac, salon) et le
genre, garde le format 4:5 et une taille d'au moins 720 × 900. Aucune de ces photos n'est
versionnée : le dossier est ignoré par Git, comme la vidéo et les captures.
