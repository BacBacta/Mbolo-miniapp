# 14 · Fluidité : la mesure, et ce qui a été corrigé (17 septembre 2026)

Le propriétaire, sur son téléphone : « le chat est trop passif, impossible de savoir quand l'autre est en train d'écrire, s'il a lu le message ; et de manière générale l'application n'est pas très fluide ». Ce document dit ce qu'on a mesuré, ce qu'on a trouvé, et ce qui a changé.

## 1. Le banc

`npm run mesure` (`scripts/mesure.js`, `e2e/banc.spec.js`) lance Chromium à la taille d'un téléphone, **processeur bridé ×4**, réseau **1,6 Mb/s** avec **150 ms de latence** (300 ms l'aller-retour) — l'ordre de grandeur d'un Android d'entrée de gamme sur une 4G moyenne à Yaoundé. Il mesure cinq choses : le chargement à froid puis à chaud, le changement d'onglet, le balayage d'une carte (durée de chaque image), la discussion entre deux navigateurs (frappe, message, accusé de lecture, requêtes au repos), et les temps de réponse de l'API. Il n'est **pas** dans `npm run e2e` : ses chiffres varient d'une machine à l'autre, et un banc n'est pas un test.

Ce qu'il ne voit pas, et qu'il faut garder en tête : la WebView de Telegram Android (pas Chromium nu), les vraies photos (100 à 300 Ko chacune, contre 10 Ko pour les images de démonstration), et les polices de Google (60 Ko la première fois).

## 2. Les chiffres, avant et après

| Mesure | Avant | Après |
|---|---|---|
| Premier écran, à froid | 1 542 ms | 1 527 ms |
| Paquet à l'écran, à froid | 1 561 ms | 1 553 ms |
| À chaud | 993 ms | 963 ms |
| Octets à froid | 108 Ko, 10 requêtes | 129 Ko, 12 requêtes (les deux photos suivantes, préchargées) |
| Changer d'onglet | 78 à 176 ms | 113 à 187 ms (bruit de mesure ; l'onglet Messages ne montre plus de squelette) |
| Balayer une carte | 17 ms par image, aucune lente | idem |
| « écrit… » vu par l'autre | 950 ms | 943 ms |
| Message vu par l'autre | 891 ms | 897 ms |
| Accusé de lecture | **aucun** | **15 ms** |
| Requêtes au repos, discussion ouverte | 2 par minute | 2 par minute |
| API, p95 | 4 à 8 ms | idem |

Le verdict du banc est clair : **le serveur et le rendu ne sont pas lents**. Trois millisecondes par appel, dix-sept millisecondes par image pendant un balayage, un écran en 100 ms. Ce que la personne ressent comme de la lenteur vient d'ailleurs : de ce que l'app **ne dit pas**, et de ce qu'elle **fait attendre pour rien**.

## 3. Ce qui manquait au chat, et qui est là

- **Deux coches.** Chaque message envoyé porte une horloge (pas encore pris), puis une coche (pris par le serveur), puis **deux coches en ambre** quand l'autre a lu. Le serveur savait déjà jusqu'où chacun avait lu (`readAt`, qui servait aux non-lus) ; il ne le disait à personne. `GET /matches/:id` renvoie maintenant `lu`, et le flux porte un signal `lu` **quand une lecture change quelque chose** — pas à chaque interrogation, sinon l'autre serait réveillé toutes les quatre secondes pour rien. Les coches passent de une à deux **en place**, sans refaire le fil.
- **« En ligne ».** L'en-tête dit quand l'autre a **cette discussion ouverte en ce moment** — jamais « vu à 23 h 12 », qui serait de la filature. Le flux le signale à l'ouverture et à la fermeture du **dernier** flux de la personne (un rechargement en remplace un par un autre, ce n'est pas un départ), et la présence s'efface à ce moment-là plutôt que dix secondes plus tard.
- **« écrit… » à deux endroits.** Une bulle de trois points **au bas du fil**, là où le message va arriver, et « écrit… » dans l'en-tête à la place de « En ligne ». Avant, c'était une ligne grise sous le fil, que personne ne remarquait.
- **La frappe passait mal dans un cas précis**, et c'est probablement ce que le propriétaire a vu : quand le flux de l'un est tombé (il dit « j'écris » par l'interrogation, toutes les 1,5 s) et que le flux de l'autre est vivant (il n'interroge plus que toutes les 30 s), le mot n'atteignait jamais l'autre — il expirait au bout de six secondes, bien avant la prochaine interrogation. Le chemin par interrogation **signale maintenant aussi par le flux** de l'autre.

## 4. Ce qui faisait attendre pour rien

- **L'onglet Messages montrait un squelette à chaque retour**, même quand la liste n'avait pas bougé : un aller-retour réseau à regarder, une seconde de gris sur un réseau ordinaire. Il affiche maintenant **tout de suite** ce qu'il avait, et le serveur corrige derrière — sans refaire l'écran si rien n'a changé.
- **La carte suivante arrivait grise.** Seule la photo de la carte du haut se téléchargeait ; après un balayage, la suivante attendait la sienne. Les photos des **deux cartes suivantes** partent pendant qu'on regarde la première.
- **Trois modules découverts trop tard.** `app.js` importe `ui.js`, `tg.js` et `i18n.js` : le navigateur ne les demandait qu'après avoir lu `app.js`, soit un aller-retour de plus au premier lancement. Ils sont **préchargés** (`modulepreload`) et partent en même temps.
- **L'entrée des écrans durait 280 ms**, avec un décalage jusqu'à 100 ms par élément : sur un processeur bridé, l'écran « finissait d'arriver » 400 ms après l'appui. 200 ms, décalage 60 ms au plus.

## 5. Ce qu'on n'a pas fait, et pourquoi

- **Pas de bibliothèque, pas de compilation** : `app.js` fait 57 Ko compressés, et le banc dit qu'il se charge en une seconde et demie sur un réseau lent. Le découper en morceaux ferait deux requêtes de plus sur un réseau à 300 ms d'aller-retour ; ce serait pire.
- **Pas de LISTEN/NOTIFY** : une seule machine en production, la carte des flux y suffit. Le jour où il y en a deux, c'est dans `flux.js` que ça se pose.
- **Pas de « vu à telle heure »** : c'est de la filature, et ça n'a rien à faire dans une app de rencontres.
