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
