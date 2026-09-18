# Audit UI/UX — Odo face aux meilleures applications de 2026

Date : 18 septembre 2026. Dépôt à `037b3d0` (« La discussion sait répondre, retirer et envoyer une photo », #122), c'est-à-dire la production du jour.

**La question posée** : où l'interface est-elle en dessous de ce que les meilleures applications mobiles offrent en 2026, et que faut-il faire pour passer à un niveau « ultra premium professionnel ».

**La méthode.** Un vrai parcours, dans un vrai navigateur à la taille d'un Pixel 5 (393 × 851, densité ×2), en mode développement, du premier écran à la dernière page publique : 38 écrans capturés **en sombre et en clair** (76 captures, script `captures.mjs` posé à côté de celui de la vidéo). Puis la lecture de `public/styles.css` (919 lignes), de `public/app.js` (3 369 lignes) et de `public/tg.js`. Chaque constat porte une marque, comme dans les audits précédents : **VU** (lu ou vu, avec l'écran ou la ligne), **MESURÉ** (chiffre obtenu), **SOURCE** (repère de marché, connaissance du modèle, non revérifié en ligne — à traiter comme une direction, pas comme une preuve).

**Le repère.** Les applications qui fixent la barre en 2026, sur ce que l'on compare ici (rythme, densité, hiérarchie, gestes, mouvement, cohérence, honnêteté) : Hinge (fiches en cartes de « prompts », « J'aime » sur un élément précis avec un mot, « Your turn »), Tinder (photo plein cadre, boutons ronds, retour en arrière, explorations), Bumble (« Opening Moves », voile sur les photos reçues), les apps éditoriales à typographie forte (Raya, Feeld) pour la retenue chromatique, et les mini apps Telegram les mieux tenues (plein écran, boutons natifs, feuilles du bas, retour natif). SOURCE, connaissance.

---

## 0. Le verdict en une page

**Odo n'a pas un problème d'identité visuelle : il a un problème de rythme et de structure.** Le langage est là et il est bon — deux polices bien choisies (Fraunces pour l'identité, Manrope pour l'interface), une palette d'encre et d'os avec une seule couleur vive réservée aux moments qui comptent, un sombre et un clair qui ne sont pas l'inversion l'un de l'autre, des mouvements courts et mesurés, une écriture tutoyée et honnête. Sur ce plan, l'accueil, l'écran de match, l'écran du pass et la discussion tiennent la comparaison avec le marché. **Ce sont des écrans premium.**

Ce qui sépare encore Odo d'une application « ultra premium », par ordre d'impact :

1. **La découverte n'est pas photo d'abord.** La carte fait plus haut que l'écran (photo 4/5 **plus** un corps de texte), donc la question et la jauge de confiance sont sous le pli, et le geste de balayage cohabite avec le défilement. Les boutons « Passer / J'aime » sont deux boutons texte dans une barre. En 2026, la carte remplit l'écran, l'information est posée sur la photo, un appui ouvre la fiche, et les deux gestes sont des boutons ronds avec retour en arrière. Et les profils de démonstration n'ont **pas de visage** : un dégradé et une initiale. Rien ne dégrade plus la perception d'une app de rencontres. (Ce point ne se règle pas dans le code : il faut des portraits, voir §3, lot 1.)
2. **Un défaut de navigation réel.** Depuis une discussion, « Se protéger » puis Retour renvoie sur **Découvrir** au lieu de la discussion, la première fois — et le bouton principal devient alors « J'aime » sur la carte suivante. Cause : `go()` calcule l'écran parent **avant** de dessiner l'écran demandé (`public/app.js:371-375`), or `PARENT.protection` lit `S.protection`, posé par l'écran lui-même. Reproduit en sombre et en clair (captures 27 → 28).
3. **Trop de texte, trop de vide, pas assez d'ancrage visuel** sur les écrans secondaires (voix, jauge, vues, confiance, langue) : 50 à 60 % de l'écran est vide sous un bloc de prose. Les apps premium donnent à chacun de ces écrans une image, un chiffre ou un geste, et les tiennent en une main.
4. **L'onglet Profil fait trois écrans en un** : en-tête, complétion, la fiche entière en aperçu, douze lignes de réglages qui mêlent le pass, la langue, un outil de test et la personne de confiance, puis la zone de suppression. Le bouton natif « Réglages » de Telegram existe et n'est pas employé pour cela.
5. **Le paywall se répète.** Quatre portes dorées sur l'écran des filtres, une dans Messages, une dans Vues, une dans Profil, et le mode Liste ouvre le pass **en plein écran** dès l'appui. Chaque porte est bien écrite, mais leur nombre fabrique une fatigue que les apps premium évitent en groupant l'offre à deux endroits et en la présentant en **feuille du bas**, pas en écran.
6. **Des détails de système qui trahissent le niveau visé** : l'étoile Telegram en emoji (rendue par la police du téléphone, différente sur chaque appareil) à côté d'icônes dessinées ; un libellé de bouton qui passe sur deux lignes (« Prendre 30 jours · 299 ⭐ ») ; des chevrons sur des lignes qui ne mènent nulle part (choix de la langue) ; une ligne « 5 restants » posée seule en haut à droite ; « Tester les notifications » dans les réglages de tout le monde ; l'heure du dernier message absente des lignes de Messages ; l'eyebrow à 10,5 px ; toutes les tailles en pixels, donc la taille de police choisie par la personne dans son téléphone est ignorée.
7. **La discussion est bonne, il lui manque le dernier tiers** : réactions à un message, copier, un champ de légende pour la photo, la barre de déblocage posée comme une carte flottante au milieu du fil, et « Proposer un rendez-vous » en bouton principal permanent alors qu'aucun lieu partenaire n'existe — le bouton mène à un écran qui dit que ce n'est pas disponible.
8. **Pas de transition entre écrans.** Chaque écran remplace le précédent avec un fondu décalé de 200 ms, le même dans les deux sens. Les apps premium distinguent « j'entre dans un détail » (glissement latéral) de « je change d'onglet » (fondu) : c'est ce qui donne la sensation de profondeur.

**Ce que ça veut dire.** Il n'y a pas de refonte à faire. Il y a **un chantier de découverte** (lot 1), **un chantier de structure** (lot 3) et **une passe de finition** sur tout le reste. Le plan tient en cinq lots (§3), le premier — les corrections immédiates — se fait en une journée.

---

## 1. Ce qui est déjà au niveau, à ne pas toucher

- **L'accueil** (capture 01) : la scène des deux cartes, le titre en Fraunces à forte taille optique, le dégradé ambre-rose sur les deux derniers mots, les quatre promesses au filet, le jeton de langue à côté du nom. C'est un écran d'ouverture de marque, pas un écran de formulaire. VU.
- **Le match** (20) : écran d'encre dans les deux thèmes, aura voilée qui respire, deux avatars qui glissent, un titre qui nomme la personne. VU.
- **Le pass** (13) : héros ambré, trois offres en cartes avec « le plus choisi », le prix par jour, la liste de ce que ça débloque, la phrase « aucune reconduction ». C'est plus honnête et plus lisible que la plupart des paywalls du marché. VU.
- **La discussion** (21, 25) : carte d'ouverture avec amorces tirées de la fiche, bulles avec heure et coches, citation avec filet ambré, bulle « écrit… », voile sur la photo reçue. VU.
- **Le système de jetons** (`styles.css:10-90`) : couleurs, rayons, ombres, courbes, verre avec trois replis. Un composant ne porte aucune couleur en dur. C'est la base qui rend tout le reste corrigeable sans refonte. VU.
- **La vérification** (08) : le geste en grand, le bouton dans la carte, les trois garanties dessous. Rien à changer.
- **La discipline du mouvement** : 200 ms d'entrée, 180 ms pour une bulle, `prefers-reduced-motion` respecté partout. MESURÉ dans `audit/14-fluidite.md`.
- **L'écriture** : tutoiement, phrases courtes, erreurs qui disent quoi faire. Un standard que peu d'apps tiennent.

---

## 2. Les faiblesses, écran par écran

Chaque point donne le constat, pourquoi c'est en dessous de la barre, et la correction.

### 2.1 Parcours d'entrée (accueil → profil → vérification → voix → jauge)

**A. Six écrans avant le premier visage.** Accueil, trois étapes de profil, l'écran de la jauge (07), la vérification (08), l'attente (09), la présentation vocale (10), puis Découvrir. VU. Les apps de 2026 montrent le paquet **derrière un voile** dès l'inscription, et repoussent ce qui n'est pas indispensable au moment où ça sert. La jauge s'explique très bien **depuis la première carte** (un appui sur les pastilles), la voix se propose **après le premier match** (« ta voix sur ta fiche, maintenant qu'on te regarde »). *Correction : retirer les deux interstitiels du parcours d'entrée ; les garder comme écrans atteignables. Sous « badge », enchaîner profil → vérification → Découvrir.*

**B. La photo est à l'étape 3, facultative, en petit.** VU (06). Or c'est l'actif principal d'une fiche et « +25 % » de complétion dit que l'app le sait (12). Les apps premium posent la photo **en premier**, en grand, avec une raison (« les fiches avec photo sont regardées trois fois plus »). *Correction : étape 1 = photo (grand emplacement 4/5, bouton « Ajouter ma photo ») + prénom + âge ; étape 2 = ce que tu cherches ; étape 3 = ta question.*

**C. Quatorze pastilles de villes** sous le champ Ville (04, 18) : quatre rangées, pour un choix qui tient en trois villes dans 90 % des cas. *Correction : six pastilles (les plus grandes, celle du fuseau d'abord) et « Autre ville… » qui ouvre le champ. Le champ reste pour la saisie libre.*

**D. Le libellé « Tu es » touche le contrôle segmenté** (03) : 6 px de marge quand les autres champs en ont 10. *Correction : même gouttière que `.field`.*

**E. Le choix de la langue** (02) porte un chevron sur chaque ligne alors qu'une ligne ne navigue pas, elle sélectionne. *Correction : coche sur la ligne active, rien sur les autres — le motif « radio » des listes iOS/Android.*

### 2.2 Découverte (17, 19) — le chantier principal

**F. La carte dépasse l'écran.** Photo au format 4/5 (`max-height: 64vh`) **plus** le corps (question, faits, jauge) : sur un Pixel 5, le corps commence sous le bouton ; sur un Android 360 × 640, la question n'est jamais visible sans défiler. VU (17 et 17-bas). Le geste de balayage est posé sur la carte (`touch-action: pan-y`) : on défile **et** on balaie sur la même surface. Les apps de référence font l'inverse : la carte remplit l'espace disponible, la photo est le fond, la question est posée **sur** la photo en bas (une ligne, tronquée), et un appui ouvre la fiche complète en feuille. *Correction : `.card.top` à la hauteur `100dvh − barres`, corps replié à une ligne (question en pastille sur le scrim), fiche complète au tap. Le déplacement de la carte suit le doigt en X seulement.*

**G. « Passer / J'aime » en deux boutons texte** dans la barre du bas (17). VU. Le standard depuis dix ans est deux boutons ronds (× et ♥) sous la carte, avec un troisième plus petit pour **revenir** sur le dernier passage. Ce n'est pas du décor : le bouton rond se touche sans lire, et le retour est le filet qui rend le balayage rapide acceptable. *Correction : trois boutons ronds sous la carte (retour 44 px, passer 56 px, aimer 56 px, l'aura sur le ♥ à l'appui), la barre native pour « Écrire » après match seulement. `DELETE /api/swipes/dernier` côté serveur (une fois par carte, dans la minute).*

**H. « 5 restants » flotte** en haut à droite, en texte gris (17). *Correction : anneau de quota dans la pastille de zone (« Yaoundé · 5 ») ou une pastille à part, avec l'aura quand le pass est actif.*

**I. Le mode Liste ouvre le pass plein écran** au premier appui (19). *Correction : une feuille du bas (« La vue Liste vient avec le pass », deux lignes, un bouton), le pass en plein écran seulement depuis « En savoir plus ».*

**J. L'étiquette « DÉMO »** en haut à gauche de la carte (17). Utile en développement, elle ne devrait jamais sortir en production. Si `SEED_DEMO` reste allumé sur la machine de démonstration, c'est un choix ; sinon, `test/production.test.js` pourrait refuser des profils de démonstration en production.

**K. Pas de visages.** Les profils de démonstration portent un dégradé à initiale (17, 26). VU. C'est la faiblesse la plus visible et la seule qui ne se règle pas dans le code : il faut des portraits de personnes qui ont accepté d'illustrer une app de rencontres, ou des portraits générés (le dossier `identite/video/photos/` a été prévu pour cela, et reste vide). *Correction : fournir six à huit portraits ; le script de la vidéo sait déjà les poser sur les profils de démonstration.*

### 2.3 La fiche (26)

**L. La fiche est la carte, en plus long.** Photo, question, faits, jauge : la même chose que dans le paquet, ce qui n'apporte rien à l'appui. VU. Le modèle de 2026 (Hinge, repris par tous) : une **suite de blocs** — photo, question en carte, photo, question, faits — et surtout la possibilité d'**aimer un bloc précis avec un mot**. C'est le mécanisme qui a le plus fait bouger le taux de premier message sur le marché : au lieu de « J'aime » sur une personne, « J'aime » sur *sa réponse à « ce qui me fait rire »*, avec « moi aussi ! ». Odo a déjà les amorces et la mesure `amorce` : c'est la même idée, un cran plus tôt. *Correction : `POST /api/swipes` accepte `sur: { q }` et `mot` (60 caractères, anti-arnaque), le match affiche « Junior a aimé ta réponse à … », la discussion s'ouvre avec le mot comme premier message. Côté fiche, chaque question porte un cœur.*

### 2.4 Match et discussion (20–25)

**M. « Proposer un rendez-vous » est le bouton principal permanent de toute discussion** (21, 25), alors que la liste des lieux partenaires est vide : l'appui mène à un écran qui dit que ce n'est pas disponible. VU (28 dans le parcours, voir aussi §0.2). Un bouton principal qui mène à un « non » coûte de la confiance. *Correction : tant que `venues` est vide pour la ville, pas de bouton principal dans la discussion ; « Je pars au rendez-vous » (personne de confiance) en bouton secondaire seulement quand une personne de confiance existe.*

**N. La barre de déblocage est une carte flottante au milieu du fil** (21). *Correction : une ligne fine sous l'en-tête (« Liens et numéros à 10 · 3/10 »), qui disparaît au seuil.*

**O. Pas de réactions, pas de « Copier ».** Depuis que l'appui long ouvre un menu (#122) et que la sélection de texte est coupée sur les bulles, copier un message n'est plus possible. VU (`styles.css`, `.bubble { user-select: none }`). *Correction : « Copier » dans le menu ; une ligne de six réactions au-dessus du menu (❤️ 😂 😮 😢 👍 🔥), stockées comme un champ `reactions` du message, jamais notifiées — c'est le geste qui fait vivre un fil sans écrire.*

**P. La photo n'a pas de légende** : l'envoi est immédiat après le choix dans la galerie. *Correction : une feuille d'aperçu avec un champ de légende et « Envoyer », comme partout ailleurs.*

**Q. Le message d'anti-arnaque fait cinq lignes** (22). *Correction : « Les demandes d'argent sont bloquées ici. Retire le montant ou le moyen de paiement. » Deux lignes, le reste dans « Pourquoi ? ».*

**R. L'en-tête dit « En ligne aujourd'hui »** (21) : c'est la tranche d'activité (« Aujourd'hui ») précédée de « En ligne », et ça se lit comme une présence en ce moment. *Correction : « Actif aujourd'hui » pour la tranche, « En ligne » seul pour la présence.*

### 2.5 Messages (11, 29)

**S. Les lignes n'ont pas d'heure.** Nom, aperçu, pastille — pas de « 06:34 » ni de « hier ». VU (29). C'est la première chose qu'on lit dans une liste de discussions. *Correction : l'heure à droite du nom, en `--hint`, format court.*

**T. Pas d'actions sur une ligne.** Retirer, bloquer, marquer lu : tout passe par la discussion puis « Se protéger ». *Correction : balayage vers la gauche sur une ligne → « Retirer », comme Telegram lui-même.*

**U. La tuile floutée** (11, 14) est un carré brun sans autre signe : sans le texte « Qui ? », elle se lit comme une image cassée. *Correction : un anneau doré et un petit cadenas au centre ; l'appui ouvre une feuille, pas un écran.*

### 2.6 Profil et réglages (12, 16)

**V. Trois écrans en un.** En-tête, complétion, la fiche entière, douze réglages, suppression : cinq écrans de hauteur. VU (12, 12-bas). *Correction : l'onglet Profil = en-tête + complétion + « Voir ma fiche » + « Modifier » ; les réglages derrière le **SettingsButton** natif de Telegram (déjà câblé dans `tg.js:170`) et une roue dentée hors Telegram ; à l'intérieur, trois groupes — Compte (langue, notifications, confidentialité, conditions), Sécurité (personne de confiance, rester discret, jauge), Odo Plus (pass, reçus). « Tester les notifications » derrière `ALLOW_DEV_AUTH` ou dans le bot (`/test`).*

**W. Le pass, la story, l'invitation et « Ajouter à l'écran d'accueil »** sont dans la même liste que la suppression du compte. *Correction : « Faire connaître Odo » en groupe à part, avec ses deux lignes.*

### 2.7 Écrans secondaires (07, 10, 14, 15)

**X. De la prose sur du vide.** La jauge, la voix, les vues, la personne de confiance : un titre, un paragraphe, une liste de trois, puis 50 à 60 % d'écran vide. VU. Aucun n'a d'image, de chiffre ou d'élément interactif. *Correction : un ancrage visuel par écran — la jauge montre **la jauge** (deux pastilles animées qui se remplissent), la voix montre un **onde** et un bouton d'écoute de l'exemple, la personne de confiance montre **l'aperçu du message** qu'elle recevra, les vues montrent les tuiles en grand. Et chaque écran tient en une main : titre plus court, liste plus dense.*

### 2.8 Système, cohérence, accessibilité

**Y. L'étoile Telegram en emoji** (13) : « 299 ⭐ » est rendu par la police d'emoji du téléphone — jaune Google, orange Samsung, absente sur certains Android — au milieu d'icônes dessinées au trait. *Correction : une icône `star` dans `ui.js`, en `--gold`.*

**Z. Le libellé du bouton passe sur deux lignes** : « Prendre 30 jours · 299 ⭐ » (13). Dans Telegram, le MainButton coupe ou rétrécit. *Correction : « 30 jours · 299 ★ » ; la durée est déjà sélectionnée à l'écran.*

**AA. Toutes les tailles sont en pixels** (106 déclarations `font-size` en px, 8 en rem, MESURÉ `styles.css`). La taille de police choisie dans les réglages du téléphone — très utilisée sur la cible, souvent « grande » — est ignorée. Les apps premium suivent le réglage système. *Correction : `html { font-size: 100% }`, échelle en `rem` sur `body`, `h1`, `.lead`, `.list-row`, les bulles ; les composants de photo restent en px.*

**AB. L'eyebrow à 10,5 px** en capitales espacées (partout). Sur un 360 px à densité 2, c'est sous le seuil de confort. *Correction : 11,5 px, espacement .12em.*

**AC. Le contraste de l'ambre sur la photo** : « Cette semaine » en `--gold` sur le scrim brun (17) tombe autour de 3:1 (estimé, non mesuré — à mesurer). *Correction : `--gold` uniquement sur fond d'encre ; sur la photo, `--on-photo` avec un point ambré devant.*

**AD. Trois styles de barre du bas** : un bouton plein, deux boutons égaux, un plein et un teinté. VU. *Correction : une règle — le principal toujours à droite et toujours plein, le secondaire toujours fantôme ; pas de secondaire quand il n'est pas nécessaire.*

**AE. Pas de transition directionnelle.** `render()` remplace `main` avec le même fondu dans tous les cas (`styles.css:175-184`). *Correction : `go()` connaît le parent ; un écran enfant entre par la droite (translateX 24 px → 0, 220 ms), revient par la gauche ; les onglets fondent. Une classe sur `main`, quatre lignes de CSS.*

**AF. Le retour natif est calculé trop tôt** (`app.js:371-375`) : voir §0.2. *Correction : calculer la cible **au moment de l'appui** — `tg.setBack(() => { const p = PARENT[screen]?.(); if (p) go(p, …); })` — et poser `S.protection` dans le gestionnaire de clic avant `go()`.*

**AG. Hors Telegram, la barre de secours recouvre le bas des écrans** (visible sur toutes les captures). Sans effet dans Telegram (le bouton natif réduit la fenêtre), mais c'est ce que voient les tests et les captures. *Correction : `padding-bottom` de `main` égal à la hauteur de la barre quand elle est visible.*

---

## 3. Le plan : cinq lots vers « ultra premium »

Chaque lot est livrable seul, dans une pull request, avec ses tests. L'ordre suit l'impact sur ce qu'une personne ressent dans la première minute.

### Lot 0 — Les corrections d'une journée
Retour calculé à l'appui (AF) · heure sur les lignes de Messages (S) · étoile en icône (Y) · libellés de bouton en une ligne (Z) · chevrons de la langue (E) · « Tester les notifications » retiré des réglages (V, partie) · eyebrow 11,5 px (AB) · « Actif aujourd'hui » (R) · message anti-arnaque en deux lignes (Q) · « Copier » dans le menu du message (O, partie) · gouttière du contrôle « Tu es » (D). Aucun changement de données. Tests : `interface.test.js` pour le retour, `discussion.test.js` pour « Copier ».

### Lot 1 — La découverte photo d'abord (une semaine)
Carte à la hauteur de l'écran, information sur le scrim, fiche au tap (F) · trois boutons ronds avec retour en arrière (G, route `DELETE /api/swipes/dernier`) · quota en pastille (H) · feuille du bas pour le mode Liste (I) · six pastilles de villes (C) · **portraits de démonstration** (K, à fournir par le propriétaire). Mesure : temps jusqu'au premier « J'aime », taux de fiches ouvertes.

### Lot 2 — La fiche et le « J'aime » sur un élément (une à deux semaines)
Fiche en blocs (L) · cœur sur chaque question, mot de 60 caractères passé à l'anti-arnaque, premier message posé à l'ouverture de la discussion · l'écran de match nomme ce qui a plu. Événement `like_sur` (clé de la question, jamais le mot) pour `npm run chiffres`. C'est le lot qui touche le produit le plus profondément — et celui dont le marché a le plus mesuré l'effet.

### Lot 3 — Structure et navigation (une semaine)
Réglages derrière le SettingsButton, en trois groupes (V, W) · Profil réduit à l'essentiel · transitions directionnelles (AE) · feuilles du bas pour les portes du pass et les menus, popups natifs pour les seules confirmations · photo en première étape du profil (B) · interstitiels jauge et voix sortis du parcours d'entrée (A) · barres du bas unifiées (AD) · balayage sur les lignes de Messages (T).

### Lot 4 — La discussion, dernier tiers (une semaine)
Réactions (O) · légende de photo (P) · barre de déblocage en ligne fine (N) · bouton de rendez-vous contextuel (M) · tuile floutée avec anneau et cadenas (U).

### Lot 5 — La finition continue
Échelle en rem et respect de la taille système (AA) · contraste de l'ambre sur photo mesuré et corrigé (AC) · écrans secondaires avec un ancrage visuel chacun (X) · passe sombre/clair sur chaque écran après chaque lot (les captures de ce document se refont en trois minutes) · spécification du mouvement écrite dans `styles.css` (durées, courbes, ce qui bouge et ce qui ne bouge pas).

**Ce qui n'est pas dans le plan, à dessein.** Pas de nouvelle police, pas de nouvelle palette, pas d'illustrations 3D, pas d'animations de célébration à chaque geste : l'identité « Aura » est juste, et les apps qui vieillissent le mieux sont celles qui en font le moins. Le niveau « ultra premium » se gagne sur la structure, la densité, la cohérence et les gestes — pas sur l'ornement.

---

## 4. Comment mesurer que ça a marché

- **Temps jusqu'au premier « J'aime »** (`app_opened` → premier `swipe`), aujourd'hui non mesuré : viser moins de 90 secondes pour un nouveau compte.
- **Taux de premier message après match** (`firstMessageAt` / matchs) : le lot 2 doit le faire monter ; c'est le chiffre qui dit si les rencontres ont lieu.
- **Taux de retour à J+1 et J+7** (`npm run chiffres`, activation) : les lots 1 et 3.
- **Part des fiches ouvertes** (nouvel événement `fiche_ouverte`, ralenti) : le lot 1.
- **Zéro écran dont le contenu utile est sous le pli sur 360 × 640** : à vérifier par les captures, dans les deux thèmes, à chaque lot.

## 5. Refaire les captures

Le script `captures.mjs` de cet audit n'est pas versionné (il vit à côté de celui de la vidéo, `identite/video/captures.mjs`, dont il reprend le parcours). Pour refaire la passe : le même serveur de développement que les tests de bout en bout, un contexte Pixel 5 par thème, trente-huit captures — et regarder chacune, dans les deux thèmes, avant de dire qu'un écran est fini.
